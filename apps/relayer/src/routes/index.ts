import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ChainConfig } from '@pypay/common';
import {
  SessionAttestationRequestSchema,
  BridgeQuoteRequestSchema,
  BridgeLockRequestSchema,
  SettleInvoiceSchema,
} from '@pypay/common';
import { createWalletClient, http, keccak256, encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || 'dev-secret';
const GUARDIAN_PRIVATE_KEY = process.env.GUARDIAN_PRIVATE_KEY as `0x${string}`;

export function registerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  chains: ChainConfig[]
) {
  // HMAC authentication hook
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return; // Skip auth for health check

    const hmacHeader = request.headers['x-hmac-signature'];
    if (!hmacHeader) {
      return reply.code(401).send({ error: 'Missing HMAC signature' });
    }

    const body = JSON.stringify(request.body);
    const expectedHmac = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(body)
      .digest('hex');

    if (hmacHeader !== expectedHmac) {
      return reply.code(401).send({ error: 'Invalid HMAC signature' });
    }
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: Date.now(),
      chains: chains.length,
    };
  });

  // Session attestation
  app.post<{
    Body: {
      userId: string;
      smartAccount: string;
      sessionPubKey: string;
      validUntil: number;
      policyId: number;
    };
  }>('/session/attest', async (request, reply) => {
    const validation = SessionAttestationRequestSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    const { userId, smartAccount, sessionPubKey, validUntil, policyId } = validation.data;

    // TODO: Verify user owns this account (check DB)

    // Create attestation hash
    const attestationHash = keccak256(
      encodeFunctionData({
        abi: [
          {
            type: 'function',
            name: 'hash',
            inputs: [
              { name: 'account', type: 'address' },
              { name: 'pubKeyHash', type: 'bytes32' },
              { name: 'validUntil', type: 'uint48' },
              { name: 'policyId', type: 'uint8' },
            ],
            outputs: [{ type: 'bytes32' }],
          },
        ],
        functionName: 'hash',
        args: [
          smartAccount as `0x${string}`,
          keccak256(sessionPubKey as `0x${string}`),
          validUntil,
          policyId,
        ],
      })
    );

    // Sign with guardian key
    const guardian = privateKeyToAccount(GUARDIAN_PRIVATE_KEY);
    const signature = await guardian.signMessage({
      message: { raw: attestationHash },
    });

    // Store in DB (optional)
    await prisma.sessionKey.upsert({
      where: { pubKeyHash: keccak256(sessionPubKey as `0x${string}`) },
      create: {
        pubKeyHash: keccak256(sessionPubKey as `0x${string}`),
        account: smartAccount.toLowerCase(),
        validUntil,
        policyId,
        active: true,
      },
      update: {
        validUntil,
        active: true,
      },
    });

    return {
      userId,
      smartAccount,
      sessionPubKey,
      validUntil,
      policyId,
      signature,
    };
  });

  // Bridge quote
  app.post<{
    Body: {
      srcChainId: number;
      dstChainId: number;
      amount: string;
    };
  }>('/bridge/quote', async (request, reply) => {
    const validation = BridgeQuoteRequestSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    const { srcChainId, dstChainId, amount } = validation.data;

    // Check relayer inventory on destination chain
    const dstChain = chains.find((c) => c.chainId === dstChainId);
    if (!dstChain) {
      return reply.code(400).send({ error: 'Invalid destination chain' });
    }

    // TODO: Check actual PYUSD balance of BridgeEscrow contract
    // For MVP, assume sufficient inventory

    // Calculate costs
    const inventoryFeeBps = parseInt(process.env.INVENTORY_FEE_BPS || '30', 10);
    const bridgeCostUsd =
      (parseInt(amount, 10) * inventoryFeeBps) / 10000 / 1e6 + // Fee on amount
      0.01 + // Source lock gas estimate
      0.01; // Dest release gas estimate

    const etaMs = 15000; // 15 seconds estimate

    // Generate unique ref
    const ref = keccak256(
      encodeFunctionData({
        abi: [
          {
            type: 'function',
            name: 'ref',
            inputs: [
              { name: 'src', type: 'uint256' },
              { name: 'dst', type: 'uint256' },
              { name: 'amount', type: 'uint256' },
              { name: 'timestamp', type: 'uint256' },
            ],
            outputs: [{ type: 'bytes32' }],
          },
        ],
        functionName: 'ref',
        args: [BigInt(srcChainId), BigInt(dstChainId), BigInt(amount), BigInt(Date.now())],
      })
    );

    // Store bridge request
    await prisma.bridge.create({
      data: {
        ref,
        srcChainId,
        dstChainId,
        payer: '0x0', // Will be updated on lock
        amount,
        status: 'pending',
      },
    });

    return {
      ref,
      bridgeCostUsd,
      etaMs,
      srcChainId,
      dstChainId,
      amount,
    };
  });

  // Bridge lock (return unsigned tx)
  app.post<{
    Body: {
      ref: string;
      srcChainId: number;
      amount: string;
      payer: string;
    };
  }>('/bridge/lock', async (request, reply) => {
    const validation = BridgeLockRequestSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    const { ref, srcChainId, amount, payer } = validation.data;

    // Get source chain config
    const srcChain = chains.find((c) => c.chainId === srcChainId);
    if (!srcChain) {
      return reply.code(400).send({ error: 'Invalid source chain' });
    }

    // Update bridge with payer
    await prisma.bridge.update({
      where: { ref },
      data: { payer: payer.toLowerCase() },
    });

    // Return unsigned tx data for BridgeEscrow.lock
    return {
      ref,
      txData: {
        to: srcChain.contracts.bridgeEscrow,
        data: encodeFunctionData({
          abi: [
            {
              type: 'function',
              name: 'lock',
              inputs: [
                { name: 'ref', type: 'bytes32' },
                { name: 'amount', type: 'uint256' },
              ],
              outputs: [],
            },
          ],
          functionName: 'lock',
          args: [ref as `0x${string}`, BigInt(amount)],
        }),
        value: '0',
      },
    };
  });

  // Gasless settlement relay
  app.post<{
    Body: {
      invoiceTuple: any;
      permitData?: string;
      sessionPubKey: string;
      webauthnAssertion?: any;
    };
  }>('/relay/settle', async (request, reply) => {
    const validation = SettleInvoiceSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    // TODO: Validate webauthn assertion
    // TODO: Validate session key is enabled for smart account
    // TODO: Validate invoice exists, not paid, not expired, merchant active
    // TODO: Submit tx calling Checkout.settle

    return reply.code(501).send({ error: 'Not implemented yet' });
  });
}

