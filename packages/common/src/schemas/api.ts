import { z } from 'zod';

// Base schemas
export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
export const HexSchema = z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex string');
export const ChainIdSchema = z.number().int().positive();

// Invoice schemas
export const CreateInvoiceSchema = z.object({
  merchant: AddressSchema,
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive integer string'),
  expiry: z.number().int().positive(),
  memo: z.string().max(500),
  chainId: ChainIdSchema,
  salt: HexSchema,
});

export const InvoiceTupleSchema = z.object({
  invoiceId: HexSchema,
  merchant: AddressSchema,
  amount: z.union([z.string(), z.number()]).transform(val => String(val)), // Accept string or number, convert to string
  expiry: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? parseInt(val, 10) : val), // Accept string or number, convert to number
  chainId: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? parseInt(val, 10) : val), // Accept string or number, convert to number
  memoHash: HexSchema,
});

// Settlement schemas
export const SettleInvoiceSchema = z.object({
  invoiceTuple: InvoiceTupleSchema,
  permitData: z.string().optional(),
  sessionPubKey: HexSchema,
  smartAccountAddress: HexSchema, // ERC-4337 smart account address
  chainId: ChainIdSchema,
  callData: HexSchema, // Encoded Checkout.settle() call
  userOpSignature: HexSchema.optional(), // Pre-signed UserOp signature from frontend
  webauthnAssertion: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
  }).optional(),
});

// Bridge schemas
export const BridgeQuoteRequestSchema = z.object({
  srcChainId: ChainIdSchema,
  dstChainId: ChainIdSchema,
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive integer string'),
  recipient: AddressSchema.optional(), // Optional destination chain recipient address
});

export const BridgeQuoteResponseSchema = z.object({
  ref: HexSchema,
  bridgeCostUsd: z.number(),
  etaMs: z.number().int(),
  srcChainId: ChainIdSchema,
  dstChainId: ChainIdSchema,
  amount: z.string(),
});

export const BridgeLockRequestSchema = z.object({
  ref: HexSchema,
  srcChainId: ChainIdSchema,
  amount: z.string(),
  payer: AddressSchema,
  recipient: AddressSchema.optional(), // Optional destination chain recipient address
});

export const BridgeLockResponseSchema = z.object({
  ref: HexSchema,
  txData: z.object({
    to: AddressSchema,
    data: HexSchema,
    value: z.string(),
  }),
});

// Session schemas
export const SessionAttestationRequestSchema = z.object({
  userId: z.string(),
  smartAccount: AddressSchema,
  sessionPubKey: HexSchema,
  validUntil: z.number().int().positive(),
  policyId: z.number().int().nonnegative(),
});

export const SessionAttestationResponseSchema = z.object({
  userId: z.string(),
  smartAccount: AddressSchema,
  sessionPubKey: HexSchema,
  validUntil: z.number(),
  policyId: z.number(),
  signature: HexSchema,
});

// Cost quote schemas
export const CostQuoteSchema = z.object({
  chainId: ChainIdSchema,
  chainName: z.string(),
  gasSponsorCostUsd: z.number(),
  estLatencyMs: z.number().int(),
  bridgeCostUsd: z.number(),
  totalCostUsd: z.number(),
  updatedAt: z.number(),
});

export const CostQuotesResponseSchema = z.array(CostQuoteSchema);

// Merchant schemas
export const GetInvoicesQuerySchema = z.object({
  chainId: ChainIdSchema.optional(),
  status: z.enum(['paid', 'unpaid', 'cancelled']).optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

// Passkey schemas
export const RegisterPasskeySchema = z.object({
  username: z.string().min(3).max(50),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
    type: z.literal('public-key'),
  }),
});

export const AuthenticatePasskeySchema = z.object({
  userId: z.string().optional(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
  }),
});

// Type exports
export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceSchema>;
export type InvoiceTuple = z.infer<typeof InvoiceTupleSchema>;
export type SettleInvoiceRequest = z.infer<typeof SettleInvoiceSchema>;
export type BridgeQuoteRequest = z.infer<typeof BridgeQuoteRequestSchema>;
export type BridgeQuoteResponse = z.infer<typeof BridgeQuoteResponseSchema>;
export type BridgeLockRequest = z.infer<typeof BridgeLockRequestSchema>;
export type BridgeLockResponse = z.infer<typeof BridgeLockResponseSchema>;
export type SessionAttestationRequest = z.infer<typeof SessionAttestationRequestSchema>;
export type SessionAttestationResponse = z.infer<typeof SessionAttestationResponseSchema>;
export type CostQuote = z.infer<typeof CostQuoteSchema>;
export type CostQuotesResponse = z.infer<typeof CostQuotesResponseSchema>;
export type GetInvoicesQuery = z.infer<typeof GetInvoicesQuerySchema>;
export type RegisterPasskeyRequest = z.infer<typeof RegisterPasskeySchema>;
export type AuthenticatePasskeyRequest = z.infer<typeof AuthenticatePasskeySchema>;

