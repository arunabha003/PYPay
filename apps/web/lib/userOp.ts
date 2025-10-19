'use client';

import { 
  type Hex, 
  type Address, 
  keccak256, 
  encodeAbiParameters, 
  parseAbiParameters,
  concat,
  toHex,
  hexToBytes,
  toBytes,
  pad,
} from 'viem';
import { getSessionKey, getSessionKeyAccount } from './sessionKey';

/**
 * UserOperation structure for ERC-4337
 */
export interface UserOperation {
  sender: Address;
  nonce: Hex;
  initCode?: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymasterAndData?: Hex;
  signature: Hex;
}

/**
 * Get UserOperation hash for signing
 * This follows ERC-4337 spec for UserOp hash calculation
 */
export function getUserOpHash(
  userOp: Omit<UserOperation, 'signature'>,
  entryPoint: Address,
  chainId: number
): Hex {
  // ERC-4337 v0.7: Pack gas limits into bytes32
  // accountGasLimits = verificationGasLimit (128 bits) | callGasLimit (128 bits)
  const accountGasLimits = 
    (BigInt(userOp.verificationGasLimit) << 128n) | 
    BigInt(userOp.callGasLimit);
  
  // gasFees = maxPriorityFeePerGas (128 bits) | maxFeePerGas (128 bits)
  const gasFees = 
    (BigInt(userOp.maxPriorityFeePerGas) << 128n) | 
    BigInt(userOp.maxFeePerGas);

  // Pack userOp fields (ERC-4337 v0.7 format with packed gas)
  const packedUserOp = encodeAbiParameters(
    parseAbiParameters('address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32'),
    [
      userOp.sender,
      BigInt(userOp.nonce),
      keccak256(userOp.initCode || '0x'),
      keccak256(userOp.callData),
      toHex(accountGasLimits, { size: 32 }) as `0x${string}`, // bytes32
      BigInt(userOp.preVerificationGas),
      toHex(gasFees, { size: 32 }) as `0x${string}`, // bytes32
      keccak256(userOp.paymasterAndData || '0x'),
    ]
  );

  // Hash the packed userOp
  const userOpHash = keccak256(packedUserOp);

  // Add entryPoint and chainId to create final hash
  const finalHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256'),
      [userOpHash, entryPoint, BigInt(chainId)]
    )
  );

  return finalHash;
}

/**
 * Sign UserOperation with session key in TapKitAccount format
 * Signature format: [validUntil:6][validAfter:6][pubKey:64][signature:65]
 * Total: 141 bytes
 */
export async function signUserOpWithSessionKey(
  userOp: Omit<UserOperation, 'signature'>,
  entryPoint: Address,
  chainId: number
): Promise<Hex> {
  const sessionKey = getSessionKey();
  const sessionKeyAccount = getSessionKeyAccount();
  
  if (!sessionKey || !sessionKeyAccount) {
    throw new Error('No active session key found');
  }

  // Get current timestamp and calculate time bounds
  const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const validAfter = now - 60; // 1 minute in the past to account for clock skew
  const validUntil = Math.floor(sessionKey.validUntil / 1000); // Convert ms to seconds

  console.log('[UserOp] Time bounds:', { 
    validAfter, 
    validUntil, 
    now,
    validForSeconds: validUntil - now 
  });

  // Create EIP-712 typed data to sign (matching TapKitAccount's __hashTypedData)
  const domain = {
    name: 'TapKitAccount',
    version: '1.0.0',
    chainId: BigInt(chainId),
    verifyingContract: userOp.sender as Address,
  };

  const types = {
    Validate: [
      { name: 'sender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'initCodeHash', type: 'bytes32' },
      { name: 'callDataHash', type: 'bytes32' },
      { name: 'accountGasLimits', type: 'bytes32' },
      { name: 'preVerificationGas', type: 'uint256' },
      { name: 'gasFees', type: 'bytes32' },
      { name: 'paymasterAndDataHash', type: 'bytes32' },
      { name: 'validUntil', type: 'uint48' },
      { name: 'validAfter', type: 'uint48' },
    ],
  };

  // Pack gas limits (v0.7 format)
  const accountGasLimits = 
    (BigInt(userOp.verificationGasLimit) << 128n) | 
    BigInt(userOp.callGasLimit);
  
  const gasFees = 
    (BigInt(userOp.maxPriorityFeePerGas) << 128n) | 
    BigInt(userOp.maxFeePerGas);

  const message = {
    sender: userOp.sender,
    nonce: BigInt(userOp.nonce),
    initCodeHash: keccak256(userOp.initCode || '0x'),
    callDataHash: keccak256(userOp.callData),
    accountGasLimits: toHex(accountGasLimits, { size: 32 }),
    preVerificationGas: BigInt(userOp.preVerificationGas),
    gasFees: toHex(gasFees, { size: 32 }),
    paymasterAndDataHash: keccak256(userOp.paymasterAndData || '0x'),
    validUntil: BigInt(validUntil),
    validAfter: BigInt(validAfter),
  };

  console.log('[UserOp] EIP-712 message:', message);

  // Sign with session key using EIP-712
  const ecdsaSignature = await sessionKeyAccount.signTypedData({
    domain,
    types,
    primaryType: 'Validate',
    message,
  });
  console.log('[UserOp] ECDSA signature:', ecdsaSignature);

  // Extract public key from session key account
  // For secp256k1, public key is 64 bytes (uncompressed, without 0x04 prefix)
  const publicKeyFull = sessionKeyAccount.publicKey; // This is 0x04 + 64 bytes
  const publicKey = publicKeyFull.slice(4) as Hex; // Remove 0x04 prefix, keep 64 bytes
  
  console.log('[UserOp] Session public key (full):', publicKeyFull);
  console.log('[UserOp] Session public key (64 bytes):', publicKey);

  // Encode time bounds as 6-byte values (uint48)
  const validUntilBytes = pad(toHex(validUntil), { size: 6 });
  const validAfterBytes = pad(toHex(validAfter), { size: 6 });

  console.log('[UserOp] validUntil bytes:', validUntilBytes);
  console.log('[UserOp] validAfter bytes:', validAfterBytes);

  // Construct signature: [validUntil:6][validAfter:6][pubKey:64][signature:65]
  const signature = concat([
    validUntilBytes,      // 6 bytes
    validAfterBytes,      // 6 bytes
    publicKey,            // 64 bytes (0x + 128 hex chars)
    ecdsaSignature,       // 65 bytes (0x + 130 hex chars)
  ]);

  console.log('[UserOp] Final signature length:', signature.length);
  console.log('[UserOp] Final signature:', signature);

  // Verify length: should be 2 + (6+6+64+65)*2 = 2 + 282 = 284 characters
  if (signature.length !== 284) {
    throw new Error(`Invalid signature length: ${signature.length}, expected 284`);
  }

  return signature;
}

/**
 * Build complete UserOperation with signature
 */
export async function buildSignedUserOp(
  sender: Address,
  callData: Hex,
  entryPoint: Address,
  paymaster: Address,
  chainId: number,
  nonce: Hex
): Promise<UserOperation> {
  // Build unsigned UserOp
  const unsignedUserOp: Omit<UserOperation, 'signature'> = {
    sender,
    nonce,
    callData,
    callGasLimit: '0x100000', // 1M gas
    verificationGasLimit: '0x100000',
    preVerificationGas: '0x50000',
    maxFeePerGas: '0x3B9ACA00', // 1 gwei
    maxPriorityFeePerGas: '0x3B9ACA00',
    paymasterAndData: paymaster,
  };

  // Sign it with session key
  const signature = await signUserOpWithSessionKey(unsignedUserOp, entryPoint, chainId);

  // Return complete UserOp
  return {
    ...unsignedUserOp,
    signature,
  };
}
