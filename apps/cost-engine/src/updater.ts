import type { ChainConfig } from '@pypay/common';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { calculateCostQuote } from './calculator';

const UPDATE_INTERVAL_MS = 15000; // 15 seconds

/**
 * Start cost quote updater loop
 */
export async function startUpdater(
  chains: ChainConfig[],
  prisma: PrismaClient,
  logger: Logger
) {
  logger.info('Starting cost quote updater');

  async function updateQuotes() {
    for (const chain of chains) {
      try {
        const quote = await calculateCostQuote(chain);

        await prisma.costQuote.upsert({
          where: { chainId: chain.chainId },
          create: quote,
          update: {
            gasSponsorCostUsd: quote.gasSponsorCostUsd,
            estLatencyMs: quote.estLatencyMs,
            bridgeCostUsd: quote.bridgeCostUsd,
            totalCostUsd: quote.totalCostUsd,
            updatedAt: new Date(),
          },
        });

        logger.info(
          {
            chainId: chain.chainId,
            chainName: chain.name,
            gasSponsorCostUsd: quote.gasSponsorCostUsd.toFixed(4),
            totalCostUsd: quote.totalCostUsd.toFixed(4),
          },
          'Cost quote updated'
        );
      } catch (error) {
        logger.error({ error, chainId: chain.chainId }, 'Failed to update cost quote');
      }
    }
  }

  // Initial update
  await updateQuotes();

  // Schedule periodic updates
  setInterval(updateQuotes, UPDATE_INTERVAL_MS);

  logger.info(`Cost quotes will update every ${UPDATE_INTERVAL_MS / 1000}s`);
}

