import type { ChainConfig } from '@pypay/common';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export async function initializeBridgeMonitor(
  chains: ChainConfig[],
  prisma: PrismaClient,
  logger: Logger
) {
  const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
  
  if (!RELAYER_PRIVATE_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY environment variable is required');
  }
  
  const relayerAccount = privateKeyToAccount(RELAYER_PRIVATE_KEY);

  for (const chain of chains) {
    logger.info(`Starting bridge monitor for ${chain.name} (${chain.chainId})`);

    const publicClient = createPublicClient({
      chain: {
        id: chain.chainId,
        name: chain.name,
        network: chain.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [chain.rpcUrl] },
          public: { http: [chain.rpcUrl] },
        },
      },
      transport: http(chain.rpcUrl),
    });

    const walletClient = createWalletClient({
      account: relayerAccount,
      chain: {
        id: chain.chainId,
        name: chain.name,
        network: chain.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [chain.rpcUrl] },
          public: { http: [chain.rpcUrl] },
        },
      },
      transport: http(chain.rpcUrl),
    });

    // Watch Locked events on this chain (source locks)
    publicClient.watchEvent({
      address: chain.contracts.bridgeEscrow,
      event: parseAbiItem(
        'event Locked(bytes32 indexed ref, address indexed payer, uint256 amount, uint256 timestamp)'
      ),
      onLogs: async (logs: any[]) => {
        for (const log of logs) {
          try {
            const { ref, payer, amount } = log.args;

            logger.info(
              { ref, payer, amount: amount.toString(), srcChainId: chain.chainId },
              'Bridge lock detected'
            );

            // Get bridge record
            const bridge = await prisma.bridge.findUnique({ where: { ref } });
            if (!bridge) {
              logger.error({ ref }, 'Bridge record not found');
              continue;
            }

            // Get destination chain
            const dstChain = chains.find((c) => c.chainId === bridge.dstChainId);
            if (!dstChain) {
              logger.error({ dstChainId: bridge.dstChainId }, 'Destination chain not found');
              continue;
            }

            // Create wallet client for destination chain
            const dstWalletClient = createWalletClient({
              account: relayerAccount,
              chain: {
                id: dstChain.chainId,
                name: dstChain.name,
                network: dstChain.name,
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: {
                  default: { http: [dstChain.rpcUrl] },
                  public: { http: [dstChain.rpcUrl] },
                },
              },
              transport: http(dstChain.rpcUrl),
            });

            // Call BridgeEscrow.release on destination chain
            logger.info(
              { ref, dstChainId: dstChain.chainId, payer },
              'Releasing funds on destination chain'
            );

            const hash = await dstWalletClient.writeContract({
              address: dstChain.contracts.bridgeEscrow,
              abi: [
                {
                  type: 'function',
                  name: 'release',
                  inputs: [
                    { name: 'ref', type: 'bytes32' },
                    { name: 'to', type: 'address' },
                    { name: 'amount', type: 'uint256' },
                  ],
                  outputs: [],
                },
              ],
              functionName: 'release',
              args: [ref, payer, amount],
            });

            logger.info(
              { ref, txHash: hash, dstChainId: dstChain.chainId },
              'Bridge release submitted'
            );

            // Update bridge status (will be updated to 'released' by indexer when event is detected)
          } catch (error) {
            logger.error({ error, log }, 'Failed to process bridge lock');
          }
        }
      },
    });
  }

  logger.info('Bridge monitor initialized for all chains');
}

