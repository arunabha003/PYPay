'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { authenticatePasskey, registerPasskey, hasPasskey } from '@/lib/passkey';
import { generateSessionKey, getSessionKey } from '@/lib/sessionKey';
import { getOrCreateSmartAccount, getPYUSDBalance } from '@/lib/smartAccount';
import { settleInvoice, approvePYUSD, checkPYUSDAllowance } from '@/lib/payment';
import { getChainById, getChains } from '@/lib/config';
import type { ChainConfig } from '@pypay/common';
import { encodeFunctionData } from 'viem';
import type { Address } from 'viem';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3002';
const GUARDIAN_ADDRESS = process.env.NEXT_PUBLIC_GUARDIAN_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TEST_OWNER = process.env.NEXT_PUBLIC_TEST_OWNER || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

interface Invoice {
  id: string;
  merchant: string;
  amount: string;
  chainId: number;
  expiry: number;
  memoHash: string;
  status: string;
}

interface CostQuote {
  chainId: number;
  chainName: string;
  gasSponsorCostUsd: number;
  estLatencyMs: number;
  bridgeCostUsd: number;
  totalCostUsd: number;
}

interface PaymentOption {
  chainId: number;
  chainName: string;
  balance: bigint;
  needsBridge: boolean;
  sourceChainId?: number;
  sourceChainName?: string;
  sourceBalance?: bigint;
  gasCostUsd: number;
  bridgeCostUsd: number;
  totalCostUsd: number;
  estLatencyMs: number;
}

type Step = 'loading' | 'auth' | 'checking' | 'bridge' | 'pay' | 'success' | 'error';

export default function CheckoutPage() {
  const params = useParams();
  const invoiceId = params.invoiceId as string;

  const [step, setStep] = useState<Step>('loading');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [user, setUser] = useState<any>(null);
  const [account, setAccount] = useState<string>('');
  const [paymentOption, setPaymentOption] = useState<PaymentOption | null>(null);
  const [bridgeRef, setBridgeRef] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [paymentTxHash, setPaymentTxHash] = useState<string>('');

  // Step 1: Load invoice
  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const response = await fetch(`${INDEXER_URL}/invoice/${invoiceId}`);
      if (!response.ok) throw new Error('Invoice not found');

      const data = await response.json();
      setInvoice(data);

      // Check if already paid
      if (data.status === 'paid') {
        setStep('success');
      } else {
        setStep('auth');
      }
    } catch (err) {
      setError('Failed to load invoice. Please check the link and try again.');
      setStep('error');
    }
  };

  // Step 2: Authenticate with passkey
  const handleAuth = async () => {
    try {
      setProcessing(true);

      let authenticatedUser;
      if (hasPasskey()) {
        authenticatedUser = await authenticatePasskey();
      } else {
        // First time - register passkey
        const username = prompt('Choose a username for your passkey:');
        if (!username) {
          setProcessing(false);
          return;
        }
        authenticatedUser = await registerPasskey(username);
      }

      setUser(authenticatedUser);

      // Generate a fresh session key for each checkout session
      // This avoids time-bound conflicts and ensures clean state
      const sessionKey = generateSessionKey(1);
      console.log('[Auth] Generated fresh session key for this checkout');

      // Resolve chain for the invoice (default to Arbitrum Sepolia)
      const chainId = (invoice?.chainId as number) || 421614;
      const chain = getChainById(chainId);
      if (!chain) throw new Error(`Chain ${chainId} not configured`);

      console.log('Checkout config:', {
        chainId,
        rpcUrl: chain.rpcUrl,
        accountFactory: chain.contracts.accountFactory,
        testOwner: TEST_OWNER,
        guardian: GUARDIAN_ADDRESS,
      });

      if (!chain.rpcUrl) throw new Error(`Missing RPC URL for chain ${chainId}`);
      if (!chain.contracts.accountFactory || (chain.contracts.accountFactory as string).length !== 42) {
        console.error('AccountFactory value:', chain.contracts.accountFactory);
        console.error('AccountFactory length:', (chain.contracts.accountFactory as string).length);
        throw new Error(`Missing NEXT_PUBLIC_ACCOUNT_FACTORY_* for chain ${chainId}`);
      }

      // Owner address for MVP: use a configured test owner
      const testOwner = TEST_OWNER;

      if (!chain.contracts.accountFactory) {
        throw new Error('Missing NEXT_PUBLIC_ACCOUNT_FACTORY_* for selected chain');
      }

      const { address, isDeployed } = await getOrCreateSmartAccount(
        testOwner as any,
        GUARDIAN_ADDRESS as any,
        chain.contracts.accountFactory as any,
        chain.rpcUrl,
        0n
      );

      setAccount(address);

      // Always enable session key for this checkout session if account is deployed
      // This ensures the session key is fresh and properly registered on-chain
      if (isDeployed) {
        console.log('[Auth] Enabling session key on smart account...');
        try {
          // For MVP, we'll enable session key via relayer endpoint
          // In production, this would require guardian attestation
          await fetch(`${process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3002'}/session/enable`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              smartAccount: address,
              // Contract expects hashing of 64-byte ECDSA public key, not address
              sessionPubKey: (sessionKey as any).ecdsaPublicKey || sessionKey.publicKey,
              validUntil: Math.floor(sessionKey.validUntil / 1000), // Convert to seconds
              policyId: sessionKey.policyId,
            }),
          });
          console.log('[Auth] Session key enabled successfully');
        } catch (err) {
          console.warn('[Auth] Failed to enable session key:', err);
          // Continue anyway - will fallback to owner signature if needed
        }
      }

      setAccount(address);
      setStep('checking');
    } catch (err: any) {
      console.error('Authentication failed:', err);
      setError(err.message || 'Authentication failed. Please try again.');
      setStep('error');
    } finally {
      setProcessing(false);
    }
  };

  // Step 3: Check balance and determine payment method
  useEffect(() => {
    if (step === 'checking' && account && invoice) {
      checkBalanceAndPreparePayment();
    }
  }, [step, account, invoice]);

  const checkBalanceAndPreparePayment = async () => {
    try {
      if (!invoice) return;

      const invoiceAmount = BigInt(invoice.amount);
      const invoiceChain = getChainById(invoice.chainId);
      
      if (!invoiceChain) {
        throw new Error(`Unsupported chain: ${invoice.chainId}`);
      }

      // Get cost quote for invoice chain
      const costResponse = await fetch(`${INDEXER_URL}/costs/quotes`);
      const costQuotes: CostQuote[] = await costResponse.json();
      const invoiceChainCost = costQuotes.find((q: CostQuote) => q.chainId === invoice.chainId);

      if (!invoiceChainCost) {
        throw new Error('Failed to get cost estimate');
      }

      // Check balance on invoice chain
      console.log('[Checkout] Checking balance on', invoiceChain.name);
      const balanceOnInvoiceChain = await getPYUSDBalance(
        account as Address,
        invoiceChain.pyusdAddress,
        invoiceChain.rpcUrl
      );

      console.log('[Checkout] Balance on invoice chain:', balanceOnInvoiceChain.toString(), 'Required:', invoiceAmount.toString());

      // If sufficient balance on invoice chain, pay directly
      if (balanceOnInvoiceChain >= invoiceAmount) {
        setPaymentOption({
          chainId: invoice.chainId,
          chainName: invoiceChain.name,
          balance: balanceOnInvoiceChain,
          needsBridge: false,
          gasCostUsd: invoiceChainCost.gasSponsorCostUsd,
          bridgeCostUsd: 0,
          totalCostUsd: invoiceChainCost.gasSponsorCostUsd,
          estLatencyMs: invoiceChainCost.estLatencyMs,
        });
        setStep('pay');
        return;
      }

      // Insufficient balance - check other chains for bridging
      console.log('[Checkout] Insufficient balance on invoice chain. Checking other chains...');
      const allChains = getChains();
      const otherChains = allChains.filter((c) => c.chainId !== invoice.chainId);

      for (const sourceChain of otherChains) {
        // Get smart account address for this specific chain (counterfactual addresses differ per chain)
        const { address: sourceChainAccount } = await getOrCreateSmartAccount(
          TEST_OWNER as any,
          GUARDIAN_ADDRESS as any,
          sourceChain.contracts.accountFactory as any,
          sourceChain.rpcUrl,
          0n
        );

        const balanceOnSourceChain = await getPYUSDBalance(
          sourceChainAccount as Address,
          sourceChain.pyusdAddress,
          sourceChain.rpcUrl
        );

        console.log('[Checkout] Balance on', sourceChain.name, ':', balanceOnSourceChain.toString(), 'Account:', sourceChainAccount);

        if (balanceOnSourceChain >= invoiceAmount) {
          // Found sufficient balance on another chain - need to bridge
          const sourceCost = costQuotes.find((q: CostQuote) => q.chainId === sourceChain.chainId);
          
          setPaymentOption({
            chainId: invoice.chainId,
            chainName: invoiceChain.name,
            balance: balanceOnInvoiceChain,
            needsBridge: true,
            sourceChainId: sourceChain.chainId,
            sourceChainName: sourceChain.name,
            sourceBalance: balanceOnSourceChain,
            gasCostUsd: invoiceChainCost.gasSponsorCostUsd,
            bridgeCostUsd: invoiceChainCost.bridgeCostUsd,
            totalCostUsd: invoiceChainCost.gasSponsorCostUsd + invoiceChainCost.bridgeCostUsd,
            estLatencyMs: invoiceChainCost.estLatencyMs + 15000, // Add bridge time
          });
          setStep('pay');
          return;
        }
      }

      // No sufficient balance on any chain
      throw new Error(
        `Insufficient PYUSD balance. Required: ${(Number(invoiceAmount) / 1e6).toFixed(2)} PYUSD. ` +
        `Available: ${(Number(balanceOnInvoiceChain) / 1e6).toFixed(2)} PYUSD on ${invoiceChain.name}`
      );
    } catch (error: any) {
      console.error('Failed to check balance:', error);
      setError(error.message || 'Failed to check balance');
      setStep('error');
    }
  };

  // Step 4: Handle bridge and payment
  const handlePayment = async () => {
    if (!paymentOption || !invoice || !account) return;

    setProcessing(true);

    try {
      // If bridging is needed, execute bridge first
      if (paymentOption.needsBridge && paymentOption.sourceChainId) {
        await executeBridge();
      } else {
        // Direct payment on invoice chain
        await executePayment();
      }
    } catch (error: any) {
      console.error('Payment failed:', error);
      setError(error.message || 'Payment failed');
      setStep('error');
      setProcessing(false);
    }
  };

  // Execute bridge lock transaction on source chain - FULL IMPLEMENTATION
  const executeBridgeLock = async (
    payerAddress: Address,
    bridgeEscrowAddress: Address,
    lockCallData: `0x${string}`,
    chain: ChainConfig
  ): Promise<string> => {
    console.log('[Bridge Lock] Starting bridge lock execution...');
    
    const sessionKey = getSessionKey();
    if (!sessionKey) {
      throw new Error('No active session key');
    }

    // Step 1: Wrap bridge lock call in smart account's execute()
    const callData = encodeFunctionData({
      abi: [{
        type: 'function',
        name: 'execute',
        inputs: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
        outputs: [],
      }] as const,
      functionName: 'execute',
      args: [bridgeEscrowAddress, 0n, lockCallData],
    });

    console.log('[Bridge Lock] Encoded call data:', callData);

    // Step 2: Get nonce from relayer
    console.log('[Bridge Lock] Fetching nonce from relayer...');
    const nonceResponse = await fetch(`${RELAYER_URL}/relay/get-nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smartAccountAddress: payerAddress,
        chainId: chain.chainId,
      }),
    });

    if (!nonceResponse.ok) {
      throw new Error(`Failed to get nonce: ${await nonceResponse.text()}`);
    }

    const { nonce, entryPoint, paymaster } = await nonceResponse.json();
    console.log('[Bridge Lock] Got nonce:', nonce);

    // Step 3: Build UserOperation with higher gas limits for bridge transactions
    // Bridge lock transactions need more gas due to:
    // - PYUSD transfer approval check
    // - Bridge escrow lock logic
    // - Event emissions
    const unsignedUserOp = {
      sender: payerAddress,
      nonce: nonce as `0x${string}`,
      callData: callData as `0x${string}`,
      callGasLimit: '0x200000' as `0x${string}`, // 2M gas (doubled for bridge complexity)
      verificationGasLimit: '0x200000' as `0x${string}`, // 2M gas (doubled for session key verification)
      preVerificationGas: '0x100000' as `0x${string}`, // 1M gas (doubled for safety)
      maxFeePerGas: '0x3B9ACA00' as `0x${string}`,
      maxPriorityFeePerGas: '0x3B9ACA00' as `0x${string}`,
      paymasterAndData: paymaster as `0x${string}`,
    };

    // Step 4: Sign UserOp with session key
    console.log('[Bridge Lock] Signing UserOperation with session key...');
    const { signUserOpWithSessionKey } = await import('@/lib/userOp');
    const userOpSignature = await signUserOpWithSessionKey(
      unsignedUserOp,
      entryPoint as Address,
      chain.chainId
    );

    console.log('[Bridge Lock] UserOp signed');

    // Step 5: Submit to relayer
    // Create a dummy invoice tuple for the bridge lock (relayer expects this structure)
    const bridgeInvoiceTuple = {
      invoiceId: lockCallData, // Use the encoded call data as invoice ID
      merchant: bridgeEscrowAddress, // BridgeEscrow is the "merchant"
      amount: '0', // No direct payment amount for bridge
      expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      chainId: chain.chainId,
      memoHash: lockCallData, // Use call data as memo hash
    };

    console.log('[Bridge Lock] Submitting UserOp to relayer...');
    const response = await fetch(`${RELAYER_URL}/relay/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smartAccountAddress: payerAddress,
        chainId: chain.chainId,
        callData,
        sessionPubKey: (sessionKey as any).ecdsaPublicKey || sessionKey.publicKey,
        userOpSignature,
        invoiceTuple: bridgeInvoiceTuple,
        permitData: '',
        // Ensure relayer packs with the exact same values used for signing
        nonce,
        callGasLimit: unsignedUserOp.callGasLimit,
        verificationGasLimit: unsignedUserOp.verificationGasLimit,
        preVerificationGas: unsignedUserOp.preVerificationGas,
        maxFeePerGas: unsignedUserOp.maxFeePerGas,
        maxPriorityFeePerGas: unsignedUserOp.maxPriorityFeePerGas,
        // Increase paymaster gas limits for bridge lock path
        paymasterVerificationGasLimit: '0x80000',
        paymasterPostOpGasLimit: '0x80000',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bridge lock failed: ${error}`);
    }

    const result = await response.json();
    console.log('[Bridge Lock] Lock successful, userOpHash:', result.userOpHash);
    
    return result.userOpHash;
  };

  // Execute bridge from source chain to invoice chain
  const executeBridge = async () => {
    if (!paymentOption || !invoice || !account || !paymentOption.sourceChainId) return;

    try {
      setStep('bridge');

      const sourceChain = getChainById(paymentOption.sourceChainId);
      const destChain = getChainById(invoice.chainId);

      if (!sourceChain || !destChain) {
        throw new Error('Invalid chain configuration');
      }

      // CRITICAL: Enable session key on SOURCE chain before bridge execution
      // We need to get the smart account address for the source chain first
      const sessionKey = getSessionKey();
      if (!sessionKey) {
        throw new Error('No active session key');
      }

      console.log('[Bridge] Getting smart account address on source chain...');
      const { address: sourceChainAccount, isDeployed } = await getOrCreateSmartAccount(
        TEST_OWNER as any,
        GUARDIAN_ADDRESS as any,
        sourceChain.contracts.accountFactory as any,
        sourceChain.rpcUrl,
        0n
      );

      console.log('[Bridge] Source chain account:', sourceChainAccount);

      // Enable session key on source chain if account is deployed
      if (isDeployed) {
        console.log('[Bridge] Enabling session key on source chain...');
        try {
          await fetch(`${RELAYER_URL}/session/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              smartAccount: sourceChainAccount,
              sessionPubKey: (sessionKey as any).ecdsaPublicKey || sessionKey.publicKey,
              validUntil: Math.floor(sessionKey.validUntil / 1000),
              policyId: sessionKey.policyId,
              chainId: sourceChain.chainId, // Specify the source chain
            }),
          });
          console.log('[Bridge] Session key enabled on source chain');
        } catch (err) {
          console.error('[Bridge] Failed to enable session key on source chain:', err);
          throw new Error('Failed to enable session key on source chain');
        }
      }

      console.log('[Bridge] Getting bridge quote...', {
        source: sourceChain.name,
        destination: destChain.name,
        amount: invoice.amount,
      });

      // Get bridge quote from relayer
      // Include recipient (destination chain smart account address)
      const quoteResponse = await fetch(`${RELAYER_URL}/bridge/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hmac-signature': await calculateHMAC({
            srcChainId: paymentOption.sourceChainId,
            dstChainId: invoice.chainId,
            amount: invoice.amount,
          }),
        },
        body: JSON.stringify({
          srcChainId: paymentOption.sourceChainId,
          dstChainId: invoice.chainId,
          amount: invoice.amount,
          recipient: account, // Destination chain smart account address
        }),
      });

      if (!quoteResponse.ok) {
        throw new Error('Failed to get bridge quote');
      }

      const quoteData = await quoteResponse.json();
      const ref = quoteData.ref;
      setBridgeRef(ref);

      console.log('[Bridge] Got quote, ref:', ref);

      // Get bridge lock transaction data
      const lockResponse = await fetch(`${RELAYER_URL}/bridge/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hmac-signature': await calculateHMAC({
            ref,
            srcChainId: paymentOption.sourceChainId,
            amount: invoice.amount,
            payer: sourceChainAccount,
          }),
        },
        body: JSON.stringify({
          ref,
          srcChainId: paymentOption.sourceChainId,
          amount: invoice.amount,
          payer: sourceChainAccount,
          recipient: account, // Destination chain smart account address
        }),
      });

      if (!lockResponse.ok) {
        throw new Error('Failed to get bridge lock transaction');
      }

      const lockData = await lockResponse.json();

      console.log('[Bridge] Executing lock on', sourceChain.name);

      // Execute lock transaction on source chain using settleInvoice pattern
      // Create a dummy invoice object for the bridge lock transaction
      const bridgeLockInvoice: Invoice = {
        id: ref, // Use bridge ref as invoice ID
        merchant: lockData.txData.to, // BridgeEscrow contract address
        amount: invoice.amount, // Same amount
        chainId: sourceChain.chainId,
        expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        memoHash: ref, // Use ref as memoHash
        status: 'pending' as const,
      };

      console.log('[Bridge] Executing lock transaction via relayer...');
      
      // Use settleInvoice to execute the bridge lock (it handles UserOp creation)
      // But we need to pass the raw bridge calldata instead of settlement calldata
      // For now, let's call the relayer directly with the bridge transaction
      const lockTxHash = await executeBridgeLock(
        sourceChainAccount as Address,
        sourceChain.contracts.bridgeEscrow as Address,
        lockData.txData.data as `0x${string}`,
        sourceChain
      );

      console.log('[Bridge] Lock executed, txHash:', lockTxHash);

      // Wait for relayer to detect lock event and release on destination chain
      // Poll bridge status
      let bridgeComplete = false;
      const maxAttempts = 30; // 30 seconds timeout
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // Check if bridge is complete
        try {
          const statusResponse = await fetch(`${INDEXER_URL}/bridge/${ref}`);
          if (statusResponse.ok) {
            const bridgeStatus = await statusResponse.json();
            if (bridgeStatus.status === 'released') {
              bridgeComplete = true;
              console.log('[Bridge] Bridge completed successfully');
              break;
            }
          }
        } catch (e) {
          // Continue polling
        }
      }

      if (!bridgeComplete) {
        throw new Error('Bridge timeout - please check transaction status');
      }

      // Bridge complete, now execute payment on destination chain
      await executePayment();
    } catch (error) {
      throw error;
    }
  };

  // Execute payment on invoice chain
  const executePayment = async () => {
    if (!invoice || !account) return;

    try {
      const chain = getChainById(invoice.chainId);
      
      if (!chain) {
        throw new Error('Invalid chain configuration');
      }

      console.log('[Checkout] Executing payment on', chain.name);

      // Prepare invoice object for settleInvoice
      const invoiceData: Invoice = {
        id: invoice.id,
        merchant: invoice.merchant,
        amount: invoice.amount,
        chainId: invoice.chainId,
        expiry: invoice.expiry,
        memoHash: invoice.memoHash,
        status: invoice.status,
      };

      // Settle invoice through Checkout contract
      const result = await settleInvoice(
        invoiceData,
        account as Address,
        chain.contracts.checkout,
        chain.chainId,
        chain.rpcUrl,
        chain.entryPointAddress,
        chain.contracts.paymaster
      );

      if (!result.success) {
        throw new Error(result.error || 'Payment failed');
      }

      console.log('[Checkout] Payment successful:', result.txHash);
      setPaymentTxHash(result.txHash || '');

      // Wait a bit for indexer to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setStep('success');
      setProcessing(false);
    } catch (error) {
      throw error;
    }
  };

  // Helper to calculate HMAC signature with deterministic JSON stringification
  const calculateHMAC = async (data: any): Promise<string> => {
    const encoder = new TextEncoder();
    // Sort keys alphabetically to ensure consistent HMAC calculation
    const sortedKeys = Object.keys(data).sort();
    const sortedObj: any = {};
    for (const key of sortedKeys) {
      sortedObj[key] = data[key];
    }
    const sortedData = JSON.stringify(sortedObj);
    const secret = 'dev-secret'; // Match RELAYER HMAC_SECRET
    
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(sortedData);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('[HMAC] Calculated for data:', sortedData, 'Result:', hashHex);
    return hashHex;
  };

  if (step === 'loading') {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading invoice...</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4 text-red-600">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Checkout</h1>

        {/* Invoice Details */}
        <div className="bg-primary-50 border border-primary-200 p-6 rounded-lg mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">Amount</h3>
              <p className="text-3xl font-bold text-primary-600">
                {(parseInt(invoice.amount) / 1e6).toFixed(2)} <span className="text-xl">PYUSD</span>
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-sm font-medium text-gray-600 mb-1">Merchant</h3>
              <p className="font-mono text-sm text-gray-700">
                {invoice.merchant.slice(0, 6)}...{invoice.merchant.slice(-4)}
              </p>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Expires:</span>
            <span className="font-medium">
              {new Date(invoice.expiry * 1000).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Step 1: Authentication */}
        {step === 'auth' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">🔐</div>
            <h2 className="text-2xl font-bold mb-4">Authenticate to Pay</h2>
            <p className="text-gray-600 mb-8">
              Use your device's biometrics to securely authenticate
            </p>
            <button
              onClick={handleAuth}
              disabled={processing}
              className="px-8 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Authenticating...' : '👆 Sign in with Passkey'}
            </button>
            <p className="text-sm text-gray-500 mt-4">
              No wallet or seed phrase required
            </p>
          </div>
        )}

        {/* Step 2: Checking Balance */}
        {step === 'checking' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold mb-4">Preparing Payment</h2>
            <p className="text-gray-600">Checking balances and optimizing routing...</p>
          </div>
        )}

        {/* Step 3: Bridge */}
        {step === 'bridge' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">🌉</div>
            <h2 className="text-2xl font-bold mb-4">Bridging Assets</h2>
            <p className="text-gray-600 mb-2">
              Moving PYUSD from {paymentOption?.sourceChainName} to {paymentOption?.chainName}
            </p>
            <p className="text-sm text-gray-500 mb-8">
              Amount: {(parseInt(invoice.amount) / 1e6).toFixed(2)} PYUSD
            </p>
            <div className="flex justify-center items-center gap-4 mb-8">
              <div className="w-3 h-3 bg-primary-600 rounded-full animate-bounce"></div>
              <div className="w-3 h-3 bg-primary-600 rounded-full animate-bounce delay-100"></div>
              <div className="w-3 h-3 bg-primary-600 rounded-full animate-bounce delay-200"></div>
            </div>
            <p className="text-sm text-gray-500">This usually takes 10-30 seconds</p>
          </div>
        )}

        {/* Step 4: Pay */}
        {step === 'pay' && paymentOption && (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">💳</div>
            <h2 className="text-2xl font-bold mb-4">Confirm Payment</h2>
            <p className="text-gray-600 mb-2">
              Paying {(parseInt(invoice.amount) / 1e6).toFixed(2)} PYUSD
            </p>
            <p className="text-sm text-gray-500 mb-6">
              on {paymentOption.chainName}
            </p>

            {/* Payment Details */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Chain:</span>
                  <span className="font-medium">{paymentOption.chainName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Your Balance:</span>
                  <span className="font-medium">
                    {(Number(paymentOption.balance) / 1e6).toFixed(2)} PYUSD
                  </span>
                </div>
                {paymentOption.needsBridge && (
                  <>
                    <div className="border-t pt-3">
                      <div className="flex justify-between text-orange-600 mb-2">
                        <span>⚠️ Bridging Required</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">From Chain:</span>
                        <span className="font-medium">{paymentOption.sourceChainName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Bridge Cost:</span>
                        <span className="font-medium">${paymentOption.bridgeCostUsd.toFixed(4)}</span>
                      </div>
                    </div>
                  </>
                )}
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-gray-600">Gas Cost:</span>
                  <span className="font-medium text-green-600">
                    ${paymentOption.gasCostUsd.toFixed(4)} (Sponsored)
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total Cost to You:</span>
                  <span className="text-primary-600">
                    ${paymentOption.totalCostUsd.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePayment}
              disabled={processing}
              className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg transition disabled:opacity-50"
            >
              {processing ? 'Processing Payment...' : '✓ Pay Now'}
            </button>
            <p className="text-sm text-gray-500 mt-4">
              {paymentOption.needsBridge 
                ? 'Bridging + Payment will complete automatically'
                : 'No gas fees required'}
            </p>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 'success' && paymentOption && (
          <div className="text-center py-8">
            <div className="text-green-600 text-6xl mb-6">✅</div>
            <h2 className="text-2xl font-bold mb-4 text-green-600">Payment Successful!</h2>
            <p className="text-gray-600 mb-6">
              Your payment of {invoice ? (parseInt(invoice.amount) / 1e6).toFixed(2) : '0.00'} PYUSD
              has been processed
            </p>

            <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
              <div className="space-y-2 text-sm">
                {paymentTxHash && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transaction Hash:</span>
                    <a
                      href={`${getChainById(invoice.chainId)?.explorerUrl}/tx/${paymentTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-800 font-mono text-xs"
                    >
                      {paymentTxHash.slice(0, 10)}...{paymentTxHash.slice(-8)}
                    </a>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Chain:</span>
                  <span className="font-medium">{paymentOption.chainName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Gas Paid:</span>
                  <span className="font-medium text-green-600">
                    ${paymentOption.gasCostUsd.toFixed(4)} (Sponsored)
                  </span>
                </div>
                {paymentOption.needsBridge && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bridge Cost:</span>
                    <span className="font-medium">
                      ${paymentOption.bridgeCostUsd.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <a
                href="/"
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                Done
              </a>
              <button className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                Download Receipt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

