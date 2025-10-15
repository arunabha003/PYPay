import type { Address, Hex } from 'viem';

/**
 * Merchant domain model
 */
export interface Merchant {
  address: Address;
  payoutAddress: Address;
  feeBps: number;
  active: boolean;
  chainId: number;
}

/**
 * Invoice domain model
 */
export interface Invoice {
  id: Hex;
  merchant: Address;
  amount: string;
  chainId: number;
  expiry: number;
  memoHash: Hex;
  status: 'unpaid' | 'paid' | 'cancelled';
  createdAt?: Date;
  txHash?: Hex;
}

/**
 * Receipt domain model
 */
export interface Receipt {
  id: Hex;
  invoiceId: Hex;
  payer: Address;
  merchant: Address;
  amount: string;
  chainId: number;
  txHash: Hex;
  blockTime: number;
  createdAt?: Date;
}

/**
 * Cost quote for a specific chain
 * @see CostQuoteSchema in schemas/api.ts for the Zod schema and inferred type
 */
// CostQuote type is exported from schemas/api.ts (z.infer)

/**
 * Bridge reference for inventory-based bridging
 */
export interface BridgeRef {
  ref: Hex;
  srcChainId: number;
  dstChainId: number;
  payer: Address;
  amount: string;
  status: 'pending' | 'locked' | 'released' | 'failed';
  lockTxHash?: Hex;
  releaseTxHash?: Hex;
  createdAt?: Date;
}

/**
 * Session key attestation signed by guardian
 */
export interface SessionAttestation {
  userId: string;
  smartAccount: Address;
  sessionPubKey: Hex;
  validUntil: number;
  policyId: number;
  signature: Hex;
}

/**
 * Session key stored on smart account
 */
export interface SessionKey {
  pubKeyHash: Hex;
  validUntil: number;
  policyId: number;
  active: boolean;
}

/**
 * Session policy constraints
 */
export interface SessionPolicy {
  policyId: number;
  allowedTarget: Address;
  allowedToken: Address;
  maxAmountPerTx: string;
  maxAmountPerDay: string;
}

/**
 * User account mapping
 */
export interface UserAccount {
  userId: string;
  passkeyCredentialId: string;
  smartAccountAddress: Address;
  owner: Address;
  createdAt: Date;
}

