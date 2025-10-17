'use client';

import {
  type Address,
  type Hex,
  encodeFunctionData,
  keccak256,
  toHex,
  createPublicClient,
  http,
} from 'viem';
import { getRelayerUrl } from './config';
import { getSessionKey } from './sessionKey';
import { signUserOpWithSessionKey } from './userOp';

/**
 * Custom JSON serializer that handles BigInt values
 */
function stringifyWithBigInt(obj: any): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

/**
 * Generate HMAC signature for relayer authentication
 * Uses Next.js API route to securely sign on server-side
 */
async function generateHMAC(body: string): Promise<string> {
  try {
    const response = await fetch('/api/sign-hmac', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.parse(body)), // Parse and re-stringify to ensure consistency
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate HMAC signature');
    }
    
    const data = await response.json();
    return data.signature;
  } catch (error) {
    console.error('HMAC generation failed:', error);
    throw error;
  }
}

// Remove the old simple HMAC functions

const CHECKOUT_ABI = [
  {
    type: 'function',
    name: 'settle',
    inputs: [
      {
        name: 'invoice',
        type: 'tuple',
        components: [
          { name: 'invoiceId', type: 'bytes32' },
          { name: 'merchant', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiry', type: 'uint64' },
          { name: 'chainId', type: 'uint256' },
          { name: 'memoHash', type: 'bytes32' },
        ],
      },
      { name: 'payer', type: 'address' },
      { name: 'permitData', type: 'bytes' },
    ],
    outputs: [{ name: 'receiptId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
] as const;

interface Invoice {
  id: string;
  merchant: string;
  amount: string;
  chainId: number;
  expiry: number;
  memoHash: string;
}

interface SettlementResult {
  success: boolean;
  txHash?: string;
  receiptId?: string;
  error?: string;
}

/**
 * Settle an invoice payment through the Checkout contract
 * Uses ERC-4337 with paymaster for gasless transactions
 */
export async function settleInvoice(
  invoice: Invoice,
  payerAddress: Address,
  checkoutAddress: Address,
  chainId: number,
  rpcUrl: string,
  entryPointAddress: Address,
  paymasterAddress: Address
): Promise<SettlementResult> {
  try {
    console.log('[Payment] Starting settlement...', {
      invoiceId: invoice.id,
      payer: payerAddress,
      merchant: invoice.merchant,
      amount: invoice.amount,
      chainId,
    });

    // Get session key
    const sessionKey = getSessionKey();
    if (!sessionKey) {
      throw new Error('No active session key. Please log in again.');
    }

    // Prepare invoice tuple
    const invoiceTuple = {
      invoiceId: invoice.id as Hex,
      merchant: invoice.merchant as Address,
      amount: BigInt(invoice.amount),
      expiry: BigInt(invoice.expiry),
      chainId: BigInt(chainId),
      memoHash: invoice.memoHash as Hex,
    };

    // Encode the settlement call
    const callData = encodeFunctionData({
      abi: CHECKOUT_ABI,
      functionName: 'settle',
      args: [
        invoiceTuple,
        payerAddress,
        '0x' as Hex, // Empty permitData - using standard approval
      ],
    });

    console.log('[Payment] Encoded call data:', callData);

    // Step 1: Get nonce from relayer
    const relayerUrl = getRelayerUrl();
    console.log('[Payment] Fetching nonce from relayer...');

    const nonceRequestBody = {
      smartAccountAddress: payerAddress,
      chainId,
    };
    const nonceBodyString = stringifyWithBigInt(nonceRequestBody);
    const nonceHmac = await generateHMAC(nonceBodyString);

    const nonceResponse = await fetch(`${relayerUrl}/relay/get-nonce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hmac-signature': nonceHmac,
      },
      body: nonceBodyString,
    });

    if (!nonceResponse.ok) {
      const error = await nonceResponse.text();
      throw new Error(`Failed to get nonce: ${error}`);
    }

    const { nonce, entryPoint, paymaster } = await nonceResponse.json();
    console.log('[Payment] Got nonce:', nonce);

    // Step 2: Build and sign UserOperation with session key
    console.log('[Payment] Building and signing UserOperation...');
    const unsignedUserOp = {
      sender: payerAddress,
      nonce: nonce as Hex,
      callData: callData as Hex,
      callGasLimit: '0x100000' as Hex,
      verificationGasLimit: '0x100000' as Hex,
      preVerificationGas: '0x50000' as Hex,
      maxFeePerGas: '0x3B9ACA00' as Hex,
      maxPriorityFeePerGas: '0x3B9ACA00' as Hex,
      paymasterAndData: paymaster as Hex,
    };

    const userOpSignature = await signUserOpWithSessionKey(
      unsignedUserOp,
      entryPoint as Address,
      chainId
    );
    console.log('[Payment] UserOp signed:', userOpSignature.slice(0, 20) + '...');

    // Step 3: Send signed UserOp to relayer
    console.log('[Payment] Submitting signed UserOp to relayer...');

    const requestBody = {
      smartAccountAddress: payerAddress,
      chainId,
      callData,
      invoiceTuple,
      permitData: '',
      sessionPubKey: sessionKey.publicKey,
      userOpSignature, // Include the signature
      webauthnAssertion: undefined,
    };
    
    const bodyString = stringifyWithBigInt(requestBody);
    const hmacSignature = await generateHMAC(bodyString);

    const response = await fetch(`${relayerUrl}/relay/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hmac-signature': hmacSignature,
      },
      body: bodyString,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Relayer error: ${error}`);
    }

    const result = await response.json();
    console.log('[Payment] Settlement result:', result);

    return {
      success: true,
      txHash: result.userOpHash, // Relayer returns userOpHash instead of txHash
      receiptId: result.receiptId,
    };
  } catch (error: any) {
    console.error('[Payment] Settlement failed:', error);
    return {
      success: false,
      error: error.message || 'Payment failed',
    };
  }
}

/**
 * Approve PYUSD spending for the Checkout contract
 * This is required before settlement if using standard ERC-20 approval
 */
export async function approvePYUSD(
  pyusdAddress: Address,
  checkoutAddress: Address,
  amount: bigint,
  payerAddress: Address,
  chainId: number,
  rpcUrl: string,
  entryPointAddress: Address,
  paymasterAddress: Address
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log('[Payment] Approving PYUSD spending...', {
      pyusd: pyusdAddress,
      spender: checkoutAddress,
      amount: amount.toString(),
    });

    // Get session key
    const sessionKey = getSessionKey();
    if (!sessionKey) {
      throw new Error('No active session key. Please log in again.');
    }

    const callData = encodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'approve',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'approve',
      args: [checkoutAddress, amount],
    });

    // Step 1: Get nonce from relayer
    const relayerUrl = getRelayerUrl();
    console.log('[Payment] Fetching nonce for approval...');

    const nonceRequestBody = {
      smartAccountAddress: payerAddress,
      chainId,
    };
    const nonceBodyString = stringifyWithBigInt(nonceRequestBody);
    const nonceHmac = await generateHMAC(nonceBodyString);

    const nonceResponse = await fetch(`${relayerUrl}/relay/get-nonce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hmac-signature': nonceHmac,
      },
      body: nonceBodyString,
    });

    if (!nonceResponse.ok) {
      const error = await nonceResponse.text();
      throw new Error(`Failed to get nonce: ${error}`);
    }

    const { nonce, entryPoint, paymaster } = await nonceResponse.json();
    console.log('[Payment] Got nonce for approval:', nonce);

    // Step 2: Build and sign UserOperation
    console.log('[Payment] Building and signing approval UserOp...');
    const unsignedUserOp = {
      sender: payerAddress,
      nonce: nonce as Hex,
      callData: callData as Hex,
      callGasLimit: '0x100000' as Hex,
      verificationGasLimit: '0x100000' as Hex,
      preVerificationGas: '0x50000' as Hex,
      maxFeePerGas: '0x3B9ACA00' as Hex,
      maxPriorityFeePerGas: '0x3B9ACA00' as Hex,
      paymasterAndData: paymaster as Hex,
    };

    const userOpSignature = await signUserOpWithSessionKey(
      unsignedUserOp,
      entryPoint as Address,
      chainId
    );
    console.log('[Payment] Approval UserOp signed');

    // Step 3: Send signed UserOp to relayer
    const requestBody = {
      smartAccountAddress: payerAddress,
      chainId,
      callData,
      invoiceTuple: {
        invoiceId: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        merchant: '0x0000000000000000000000000000000000000000' as Address,
        amount: 0n,
        expiry: 0n,
        chainId: BigInt(chainId),
        memoHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      }, // Dummy invoice for approval
      permitData: '',
      sessionPubKey: sessionKey.publicKey,
      userOpSignature, // Include the signature
      webauthnAssertion: undefined,
    };
    
    const bodyString = stringifyWithBigInt(requestBody);
    const hmacSignature = await generateHMAC(bodyString);
    
    const response = await fetch(`${relayerUrl}/relay/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hmac-signature': hmacSignature,
      },
      body: bodyString,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Approval failed: ${error}`);
    }

    const result = await response.json();
    console.log('[Payment] Approval successful:', result);

    return {
      success: true,
      txHash: result.userOpHash, // Relayer returns userOpHash
    };
  } catch (error: any) {
    console.error('[Payment] Approval failed:', error);
    return {
      success: false,
      error: error.message || 'Approval failed',
    };
  }
}

/**
 * Check PYUSD allowance
 */
export async function checkPYUSDAllowance(
  pyusdAddress: Address,
  owner: Address,
  spender: Address,
  rpcUrl: string
): Promise<bigint> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const allowance = await client.readContract({
    address: pyusdAddress,
    abi: [
      {
        type: 'function',
        name: 'allowance',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'allowance',
    args: [owner, spender],
  });

  return allowance;
}
