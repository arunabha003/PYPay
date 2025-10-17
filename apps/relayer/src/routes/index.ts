import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ChainConfig } from '@pypay/common';
import {
  SessionAttestationRequestSchema,
  BridgeQuoteRequestSchema,
  BridgeLockRequestSchema,
  SettleInvoiceSchema,
} from '@pypay/common';
import { createWalletClient, createPublicClient, http, keccak256, encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';

export function registerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  chains: ChainConfig[]
) {
  const HMAC_SECRET = process.env.HMAC_SECRET || 'dev-secret';
  const GUARDIAN_PRIVATE_KEY = process.env.GUARDIAN_PRIVATE_KEY as `0x${string}`;
  
  if (!GUARDIAN_PRIVATE_KEY) {
    throw new Error('GUARDIAN_PRIVATE_KEY environment variable is required');
  }
  
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

  // Get nonce for UserOperation preparation
  app.post<{
    Body: {
      smartAccountAddress: string;
      chainId: number;
    };
  }>('/relay/get-nonce', async (request, reply) => {
    const { chainId, smartAccountAddress } = request.body;

    if (!smartAccountAddress || !chainId) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    // Find chain config
    const chain = chains.find((c) => c.chainId === chainId);
    if (!chain) {
      return reply.code(400).send({ error: `Unsupported chain: ${chainId}` });
    }

    try {
      // Fetch current nonce from EntryPoint
      const publicClient = createPublicClient({
        transport: http(chain.rpcUrl),
      });

      const nonce = await publicClient.readContract({
        address: chain.entryPointAddress,
        abi: [
          {
            type: 'function',
            name: 'getNonce',
            inputs: [
              { name: 'sender', type: 'address' },
              { name: 'key', type: 'uint192' },
            ],
            outputs: [{ name: 'nonce', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getNonce',
        args: [smartAccountAddress as `0x${string}`, 0n],
      }) as bigint;

      return reply.send({
        nonce: `0x${nonce.toString(16)}`,
        entryPoint: chain.entryPointAddress,
        paymaster: chain.contracts.paymaster,
      });
    } catch (error) {
      app.log.error({ error }, 'Error fetching nonce');
      return reply.code(500).send({
        error: 'Failed to fetch nonce',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Gasless settlement relay
  app.post<{
    Body: {
      invoiceTuple: any;
      permitData?: string;
      sessionPubKey: string;
      smartAccountAddress: string;
      chainId: number;
      callData: string;
      userOpSignature?: string;
      webauthnAssertion?: any;
    };
  }>('/relay/settle', async (request, reply) => {
    const validation = SettleInvoiceSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    const { chainId, smartAccountAddress, callData, userOpSignature } = request.body;

    // Require signature - no mocking
    if (!userOpSignature || userOpSignature === '0x') {
      return reply.code(400).send({ 
        error: 'UserOperation signature is required',
        details: 'Frontend must sign the UserOp with session key before submitting'
      });
    }

    // Find chain config
    const chain = chains.find((c) => c.chainId === chainId);
    if (!chain) {
      return reply.code(400).send({ error: `Unsupported chain: ${chainId}` });
    }

    try {
      // Fetch current nonce from EntryPoint
      const publicClient = createPublicClient({
        transport: http(chain.rpcUrl),
      });

      const nonce = await publicClient.readContract({
        address: chain.entryPointAddress,
        abi: [
          {
            type: 'function',
            name: 'getNonce',
            inputs: [
              { name: 'sender', type: 'address' },
              { name: 'key', type: 'uint192' },
            ],
            outputs: [{ name: 'nonce', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getNonce',
        args: [smartAccountAddress as `0x${string}`, 0n], // key = 0 for default nonce sequence
      }) as bigint;

      app.log.info({ smartAccount: smartAccountAddress, nonce: nonce.toString() }, 'Fetched nonce');

      // Use the signature provided by the frontend (already in TapKitAccount format)
      app.log.info({ signatureLength: userOpSignature.length }, 'Using frontend signature');

      // Construct UserOperation for Pimlico v2 (EntryPoint v0.7)
      // Pimlico v2 expects separate fields, not packed
      const userOp = {
        sender: smartAccountAddress as `0x${string}`,
        nonce: `0x${nonce.toString(16)}`,
        factory: undefined as any, // undefined if account already deployed
        factoryData: undefined as any,
        callData: callData as `0x${string}`,
        callGasLimit: `0x${(1000000).toString(16)}`, // 1M gas
        verificationGasLimit: `0x${(1000000).toString(16)}`,
        preVerificationGas: `0x${(500000).toString(16)}`,
        maxFeePerGas: `0x${(1e9).toString(16)}`, // 1 gwei
        maxPriorityFeePerGas: `0x${(1e9).toString(16)}`,
        paymaster: chain.contracts.paymaster,
        paymasterVerificationGasLimit: `0x${(100000).toString(16)}`,
        paymasterPostOpGasLimit: `0x${(100000).toString(16)}`,
        paymasterData: '0x' as `0x${string}`,
        signature: userOpSignature as `0x${string}`,
      };

      // Submit UserOperation to bundler
      const bundlerResponse = await fetch(chain.bundlerRpc, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendUserOperation',
          params: [userOp, chain.entryPointAddress],
        }),
      });

      const bundlerResult = await bundlerResponse.json() as {
        jsonrpc: string;
        id: number;
        result?: string;
        error?: { code: number; message: string };
      };

      if (bundlerResult.error) {
        app.log.error({ bundlerError: bundlerResult.error }, 'Bundler error');
        return reply.code(500).send({ 
          error: 'Bundler submission failed', 
          details: bundlerResult.error 
        });
      }

      const userOpHash = bundlerResult.result;

      // Wait for UserOperation to be mined (optional, can poll separately)
      // For now, return immediately with the userOpHash
      return reply.send({
        success: true,
        userOpHash,
        message: 'UserOperation submitted successfully',
      });
    } catch (error) {
      app.log.error({ error }, 'Error submitting UserOperation');
      return reply.code(500).send({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
}
