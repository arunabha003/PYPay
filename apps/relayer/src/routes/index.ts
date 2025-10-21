import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ChainConfig } from '@pypay/common';
import {
  SessionAttestationRequestSchema,
  BridgeQuoteRequestSchema,
  BridgeLockRequestSchema,
  SettleInvoiceSchema,
} from '@pypay/common';
import { createWalletClient, createPublicClient, http, keccak256, encodeFunctionData, encodeAbiParameters, encodePacked, parseEther, concat, toHex } from 'viem';
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
    // Skip auth for health check, session, bridge, and relay endpoints (internal/dev use)
    if (request.url === '/health' || 
        request.url === '/session/enable' ||
        request.url.startsWith('/bridge/') ||
        request.url.startsWith('/relay/')) return;

    const hmacHeader = request.headers['x-hmac-signature'];
    if (!hmacHeader) {
      app.log.warn({ url: request.url }, 'Missing HMAC signature');
      return reply.code(401).send({ error: 'Missing HMAC signature' });
    }

    // Sort keys alphabetically for deterministic HMAC calculation
    const sortedKeys = Object.keys(request.body || {}).sort();
    const sortedObj: any = {};
    for (const key of sortedKeys) {
      sortedObj[key] = (request.body as any)[key];
    }
    const body = JSON.stringify(sortedObj);
    const expectedHmac = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(body)
      .digest('hex');

    app.log.info({ body, expectedHmac, receivedHmac: hmacHeader }, 'HMAC verification');

    if (hmacHeader !== expectedHmac) {
      app.log.warn({ expectedHmac, receivedHmac: hmacHeader }, 'Invalid HMAC signature');
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
      // Expect 64-byte ECDSA public key hex (0x + 128 hex chars), not an address
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

    // Compute the same digest the contract expects for guardian signature
    // digest = keccak256("\x19Ethereum Signed Message:\n32" || keccak256(abi.encode(account, pubKeyHash, validUntil, policyId)))
    const pubKeyHash = keccak256(sessionPubKey as `0x${string}`);
    const innerHash = keccak256(
      encodeAbiParameters(
        [
          { name: 'account', type: 'address' },
          { name: 'pubKeyHash', type: 'bytes32' },
          { name: 'validUntil', type: 'uint48' },
          { name: 'policyId', type: 'uint8' },
        ],
        [smartAccount as `0x${string}`, pubKeyHash, validUntil, policyId]
      )
    );
    const prefix = '\x19Ethereum Signed Message:\n32';
    const attestationHash = keccak256(concat([toHex(prefix), innerHash]));

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

  // Session key enable - Call smart account to enable session key
  app.post<{
    Body: {
      smartAccount: string;
      sessionPubKey: string;
      validUntil: number;
      policyId: number;
      chainId?: number;
    };
  }>('/session/enable', async (request, reply) => {
    try {
      const { smartAccount, sessionPubKey, validUntil, policyId, chainId } = request.body;

      app.log.info({ smartAccount, sessionPubKey, validUntil, policyId, chainId }, 'Enabling session key');

      // Find the chain for this account
      const chain = chainId 
        ? chains.find(c => c.chainId === chainId)
        : chains[0]; // Default to Arbitrum Sepolia for backwards compatibility
      
      if (!chain) {
        return reply.code(400).send({ error: `Chain ${chainId} not supported` });
      }
      
      // Create publicClient
      const publicClient = createPublicClient({
        transport: http(chain.rpcUrl),
      });

      // Validate inputs
      if (!smartAccount || (smartAccount as string).length !== 42) {
        return reply.code(400).send({ error: 'Invalid smartAccount address' });
      }
      if (typeof sessionPubKey !== 'string' || !sessionPubKey.startsWith('0x')) {
        return reply.code(400).send({ error: 'sessionPubKey must be 0x-prefixed hex' });
      }
      // Expect 64-byte ECDSA public key (128 hex chars after 0x)
      if ((sessionPubKey as string).length !== 2 + 128) {
        app.log.warn({ len: (sessionPubKey as string).length }, 'sessionPubKey length unexpected; expected 64 bytes (128 hex chars)');
      }

      // Hash the ECDSA public key (64 bytes expected)
      const pubKeyHash = keccak256(sessionPubKey as `0x${string}`);

      // Create inner hash: keccak256(abi.encode(address(this), pubKeyHash, validUntil, policyId))
      const innerHash = keccak256(
        encodeAbiParameters(
          [
            { name: 'account', type: 'address' },
            { name: 'pubKeyHash', type: 'bytes32' },
            { name: 'validUntil', type: 'uint48' },
            { name: 'policyId', type: 'uint8' },
          ],
          [smartAccount as `0x${string}`, pubKeyHash, validUntil, policyId]
        )
      );

      app.log.info({ pubKeyHash, innerHash }, 'Hashes for session key');

  // Create the final digest with EIP-191 prefix (same as contract does)
      // Contract: keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash))
      const prefix = '\x19Ethereum Signed Message:\n32';
      const digest = keccak256(concat([toHex(prefix), innerHash]));

      app.log.info({ digest }, 'Final digest for signing');
      app.log.info({ smartAccount, pubKeyHash, validUntil, policyId }, 'Signing parameters');

      // Sign the digest directly (NOT using signMessage which would add another prefix)
      const guardian = privateKeyToAccount(GUARDIAN_PRIVATE_KEY);
      const guardianSignature = await guardian.sign({
        hash: digest,
      });

      // Create wallet client
      const walletClient = createWalletClient({
        account: guardian,
        chain: {
          id: chain.chainId,
          name: chain.name,
          network: chain.name.toLowerCase().replace(/\s+/g, '-'),
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [chain.rpcUrl] },
            public: { http: [chain.rpcUrl] },
          },
        },
        transport: http(chain.rpcUrl),
      });

      // Optional: Read guardian from the account to ensure we sign with the correct key
      try {
        const onchainGuardian = await publicClient.readContract({
          address: smartAccount as `0x${string}`,
          abi: [
            {
              type: 'function',
              name: 'guardian',
              inputs: [],
              outputs: [{ type: 'address' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'guardian',
          args: [],
        });
        const guardianAddress = privateKeyToAccount(GUARDIAN_PRIVATE_KEY).address;
        if (onchainGuardian.toLowerCase() !== guardianAddress.toLowerCase()) {
          app.log.warn({ onchainGuardian, signer: guardianAddress }, 'Guardian mismatch between account and relayer key');
        }
      } catch (e) {
        app.log.warn({ e }, 'Could not read guardian from smart account');
      }

      // Call enableSessionKey on the smart account
      const txHash = await walletClient.writeContract({
        address: smartAccount as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'enableSessionKey',
            inputs: [
              { name: 'pubKeyHash', type: 'bytes32' },
              { name: 'validUntil', type: 'uint48' },
              { name: 'policyId', type: 'uint8' },
              { name: 'guardianSignature', type: 'bytes' },
            ],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'enableSessionKey',
        args: [pubKeyHash, validUntil, policyId, guardianSignature],
      });

      app.log.info({ txHash, smartAccount }, 'Session key enabled');

      return reply.send({
        success: true,
        txHash,
        pubKeyHash,
      });
    } catch (error: any) {
      app.log.error({ error }, 'Failed to enable session key');
      return reply.code(500).send({
        error: 'Failed to enable session key',
        details: error.message || 'Unknown error',
      });
    }
  });

  // Bridge quote
  app.post<{
    Body: {
      srcChainId: number;
      dstChainId: number;
      amount: string;
      recipient?: string;
    };
  }>('/bridge/quote', async (request, reply) => {
    const validation = BridgeQuoteRequestSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    const { srcChainId, dstChainId, amount, recipient } = validation.data;

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
        recipient, // Store destination chain recipient address
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
      recipient?: string;
    };
  }>('/bridge/lock', async (request, reply) => {
    const validation = BridgeLockRequestSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid request', details: validation.error });
    }

    const { ref, srcChainId, amount, payer, recipient } = validation.data;

    // Get source chain config
    const srcChain = chains.find((c) => c.chainId === srcChainId);
    if (!srcChain) {
      return reply.code(400).send({ error: 'Invalid source chain' });
    }

    // Update bridge with payer and recipient
    await prisma.bridge.update({
      where: { ref },
      data: { 
        payer: payer.toLowerCase(),
        recipient: recipient?.toLowerCase(),
      },
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

      app.log.info({ smartAccount: smartAccountAddress, nonce: `0x${nonce.toString(16)}` }, 'Returning nonce');
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
      // Optional overrides supplied by frontend to ensure signature consistency
      nonce?: `0x${string}`;
      callGasLimit?: `0x${string}`;
      verificationGasLimit?: `0x${string}`;
      preVerificationGas?: `0x${string}`;
      maxFeePerGas?: `0x${string}`;
      maxPriorityFeePerGas?: `0x${string}`;
      paymasterVerificationGasLimit?: `0x${string}`;
      paymasterPostOpGasLimit?: `0x${string}`;
      paymasterData?: `0x${string}`;
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
      // Resolve nonce: use provided value (to match signed digest) or fetch current
      const publicClient = createPublicClient({
        transport: http(chain.rpcUrl),
      });
      let resolvedNonce: bigint;
      if (request.body.nonce) {
        // Strip 0x and parse hex
        resolvedNonce = BigInt(request.body.nonce);
      } else {
        const fetched = await publicClient.readContract({
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
        resolvedNonce = fetched;
      }
      app.log.info({ smartAccount: smartAccountAddress, nonce: resolvedNonce.toString(), fromClient: request.body.nonce ?? null }, 'Resolved nonce');

      // Check if account is deployed
      const accountCode = await publicClient.getBytecode({
        address: smartAccountAddress as `0x${string}`,
      });
      const isAccountDeployed = accountCode && accountCode !== '0x';
      
      app.log.info({ 
        smartAccount: smartAccountAddress, 
        isDeployed: isAccountDeployed,
        codeLength: accountCode?.length || 0
      }, 'Account deployment status');

      // If account not deployed, we need factory + factoryData for deployment
      // For now, we expect accounts to be pre-deployed
      // TODO: Support auto-deployment with factory data in future
      let factory: `0x${string}` | undefined;
      let factoryData: `0x${string}` | undefined;

      if (!isAccountDeployed) {
        app.log.warn({ smartAccount: smartAccountAddress }, 'Account not deployed - will attempt transaction anyway');
        // In production, you'd include factory + initCode here
        // factory = chain.contracts.accountFactory;
        // factoryData = encodeFunctionData({ ... });
      }

      // Use the signature provided by the frontend (already in TapKitAccount format)
      app.log.info({ signatureLength: userOpSignature.length }, 'Using frontend signature');

      // Construct UserOperation for Pimlico v2 (EntryPoint v0.7)
      const userOp = {
        sender: smartAccountAddress as `0x${string}`,
        nonce: `0x${resolvedNonce.toString(16)}`,
        factory: factory,
        factoryData: factoryData,
        callData: callData as `0x${string}`,
        callGasLimit: request.body.callGasLimit ?? `0x${(0x200000).toString(16)}`, // default 2M gas
        verificationGasLimit: request.body.verificationGasLimit ?? `0x${(0x200000).toString(16)}`,
        preVerificationGas: request.body.preVerificationGas ?? `0x${(0x100000).toString(16)}`,
        maxFeePerGas: request.body.maxFeePerGas ?? `0x${(1e9).toString(16)}`, // 1 gwei
        maxPriorityFeePerGas: request.body.maxPriorityFeePerGas ?? `0x${(1e9).toString(16)}`,
        paymaster: chain.contracts.paymaster,
        paymasterVerificationGasLimit: request.body.paymasterVerificationGasLimit ?? `0x${(200000).toString(16)}`,
        paymasterPostOpGasLimit: request.body.paymasterPostOpGasLimit ?? `0x${(200000).toString(16)}`,
        paymasterData: (request.body.paymasterData ?? '0x') as `0x${string}`,
        signature: userOpSignature as `0x${string}`,
      };

      // Check if we're on localhost (anvil fork) or real testnet
      const isLocalhost = chain.rpcUrl.includes('localhost') || 
                         chain.rpcUrl.includes('127.0.0.1') || 
                         chain.rpcUrl.includes('0.0.0.0');
      
      let userOpHash: string;

      if (isLocalhost) {
        // LOCAL MODE: Direct EntryPoint call (for anvil testing)
        app.log.info('Using direct EntryPoint execution (localhost mode)');

        const guardianAccount = privateKeyToAccount(GUARDIAN_PRIVATE_KEY);
        const walletClient = createWalletClient({
          account: guardianAccount,
          chain: {
            id: chain.chainId,
            name: chain.name,
            network: chain.name.toLowerCase().replace(/\s+/g, '-'),
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: {
              default: { http: [chain.rpcUrl] },
              public: { http: [chain.rpcUrl] },
            },
          },
          transport: http(chain.rpcUrl),
        });

        // Pack UserOp for EntryPoint v0.7
        const packedUserOp = {
          sender: userOp.sender,
          nonce: BigInt(userOp.nonce),
          initCode: userOp.factory && userOp.factoryData 
            ? `${userOp.factory}${userOp.factoryData.slice(2)}` as `0x${string}`
            : '0x' as `0x${string}`,
          callData: userOp.callData,
          accountGasLimits: `0x${BigInt(userOp.verificationGasLimit).toString(16).padStart(32, '0')}${BigInt(userOp.callGasLimit).toString(16).padStart(32, '0')}` as `0x${string}`,
          preVerificationGas: BigInt(userOp.preVerificationGas),
          gasFees: `0x${BigInt(userOp.maxPriorityFeePerGas).toString(16).padStart(32, '0')}${BigInt(userOp.maxFeePerGas).toString(16).padStart(32, '0')}` as `0x${string}`,
          paymasterAndData: userOp.paymaster 
            ? `${userOp.paymaster}${BigInt(userOp.paymasterVerificationGasLimit).toString(16).padStart(32, '0')}${BigInt(userOp.paymasterPostOpGasLimit).toString(16).padStart(32, '0')}${userOp.paymasterData.slice(2)}` as `0x${string}`
            : '0x' as `0x${string}`,
          signature: userOp.signature,
        };

          // Log unpacked gas params for debugging AA95
          try {
            const vgl = BigInt(userOp.verificationGasLimit).toString();
            const cgl = BigInt(userOp.callGasLimit).toString();
            const pvgl = BigInt(userOp.paymasterVerificationGasLimit).toString();
            const ppgl = BigInt(userOp.paymasterPostOpGasLimit).toString();
            app.log.info({
              accountGasLimits: `${vgl}/${cgl}`,
              preVerificationGas: BigInt(userOp.preVerificationGas).toString(),
              gasFees: `${BigInt(userOp.maxPriorityFeePerGas).toString()}/${BigInt(userOp.maxFeePerGas).toString()}`,
              paymasterGas: `${pvgl}/${ppgl}`,
            }, 'Gas parameters');
          } catch {}

          app.log.info({ packedUserOp }, 'Packed UserOp for EntryPoint');

        // Call EntryPoint.handleOps directly
        try {
          const txHash = await walletClient.writeContract({
            address: chain.entryPointAddress as `0x${string}`,
            abi: [
              {
                type: 'function',
                name: 'handleOps',
                inputs: [
                  {
                    name: 'ops',
                    type: 'tuple[]',
                    components: [
                      { name: 'sender', type: 'address' },
                      { name: 'nonce', type: 'uint256' },
                      { name: 'initCode', type: 'bytes' },
                      { name: 'callData', type: 'bytes' },
                      { name: 'accountGasLimits', type: 'bytes32' },
                      { name: 'preVerificationGas', type: 'uint256' },
                      { name: 'gasFees', type: 'bytes32' },
                      { name: 'paymasterAndData', type: 'bytes' },
                      { name: 'signature', type: 'bytes' },
                    ],
                  },
                  { name: 'beneficiary', type: 'address' },
                ],
                outputs: [],
                stateMutability: 'nonpayable',
              },
            ],
            functionName: 'handleOps',
            args: [[packedUserOp], guardianAccount.address],
          });

          app.log.info({ txHash }, 'UserOp executed via direct EntryPoint call');
          
          // Use txHash as userOpHash for consistency
          userOpHash = txHash;
        } catch (handleOpsError: any) {
          app.log.error({ 
            handleOpsError,
            userOp: packedUserOp,
            errorMessage: handleOpsError.message,
            errorDetails: handleOpsError.details,
          }, 'Failed to execute handleOps');
          
          // Try to extract more useful error info
          const errorMsg = handleOpsError.message || handleOpsError.details || 'Unknown EntryPoint error';
          return reply.code(500).send({ 
            error: 'EntryPoint execution failed', 
            details: errorMsg,
            hint: 'Check: 1) Session key enabled? 2) Paymaster staked? 3) Signature format correct?'
          });
        }

      } else {
        // TESTNET MODE: Use Pimlico bundler
        app.log.info('Using Pimlico bundler (testnet mode)');

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

        userOpHash = bundlerResult.result!;
      }

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
