import type { ChainConfig } from '@pypay/common';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { createPublicClient, http, parseAbiItem } from 'viem';

export async function initializeWatchers(
  chains: ChainConfig[],
  prisma: PrismaClient,
  logger: Logger
) {
  for (const chain of chains) {
    logger.info(`Starting watchers for ${chain.name} (${chain.chainId})`);

    const client = createPublicClient({
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

    // Skip historical catch-up for now to test real-time watchers
    if (process.env.INDEXER_SKIP_CATCHUP !== 'true') {
      try {
        logger.info(`Catching up with historical events for ${chain.name}...`);
        await catchUpHistoricalEvents(client, chain, prisma, logger);
      } catch (error) {
        logger.error({ error, chain: chain.name }, 'Failed to catch up with historical events');
      }
    } else {
      logger.info(`Skipping historical catch-up for ${chain.name} (INDEXER_SKIP_CATCHUP=true)`);
    }

    // Watch MerchantRegistry events
    watchMerchantEvents(client, chain, prisma, logger);

    // Watch Invoice events
    watchInvoiceEvents(client, chain, prisma, logger);

    // Watch Checkout events
    watchCheckoutEvents(client, chain, prisma, logger);

    // Watch BridgeEscrow events
    watchBridgeEvents(client, chain, prisma, logger);
  }
}

async function catchUpHistoricalEvents(
  client: any,
  chain: ChainConfig,
  prisma: PrismaClient,
  logger: Logger
) {
  const currentBlock = await client.getBlockNumber();
  const maxLookback = 10000n; // cap lookback to 10k to limit load
  const fromBlock = currentBlock > maxLookback ? currentBlock - maxLookback : 0n;

  // Alchemy free tier allows only 10-block range for eth_getLogs.
  // Process in small chunks to stay within provider limits.
  const chunkSize = 10n;
  let start = fromBlock;
  let totalInvoices = 0;

  logger.info(
    `Catching up historical events from block ${fromBlock} to ${currentBlock} in ${chunkSize}-block chunks...`
  );

  while (start <= currentBlock) {
    // off-by-one: provider limit is inclusive range of 10 blocks → use chunkSize-1
    const end = start + (chunkSize - 1n) > currentBlock ? currentBlock : start + (chunkSize - 1n);
    try {
      const invoiceLogs = await client.getLogs({
        address: chain.contracts.invoice,
        event: parseAbiItem(
          'event InvoiceCreated(bytes32 indexed id, address indexed merchant, uint256 amount, uint64 expiry, uint256 chainId, bytes32 memoHash)'
        ),
        fromBlock: start,
        toBlock: end,
      });

      for (const log of invoiceLogs) {
        try {
          const { id, merchant, amount, expiry, chainId, memoHash } = log.args;

          const existing = await prisma.invoice.findUnique({ where: { id } });
          if (existing) continue;

          await prisma.merchant.upsert({
            where: {
              address_chainId: {
                address: merchant.toLowerCase(),
                chainId: Number(chainId),
              },
            },
            create: {
              address: merchant.toLowerCase(),
              payoutAddress: merchant.toLowerCase(),
              feeBps: 0,
              active: true,
              chainId: Number(chainId),
            },
            update: {},
          });

          await prisma.invoice.create({
            data: {
              id,
              merchant: merchant.toLowerCase(),
              amount: amount.toString(),
              chainId: Number(chainId),
              expiry: Number(expiry),
              memoHash,
              status: 'unpaid',
              blockNumber: Number(log.blockNumber),
            },
          });

          totalInvoices++;
          logger.info({ invoiceId: id, block: Number(log.blockNumber) }, 'Caught up historical invoice');
        } catch (error) {
          logger.error({ error, log }, 'Failed to process historical invoice');
        }
      }
    } catch (error) {
      logger.error(
        { error, start: `0x${start.toString(16)}`, end: `0x${end.toString(16)}` },
        `Failed to fetch logs for blocks ${start}-${end}`
      );
    }
    start = end + 1n;
  }

  logger.info(`Historical catch-up complete. Processed ${totalInvoices} invoice(s).`);
}

function watchMerchantEvents(client: any, chain: ChainConfig, prisma: PrismaClient, logger: Logger) {
  // Watch MerchantRegistered
  client.watchEvent({
    address: chain.contracts.merchantRegistry,
    event: parseAbiItem('event MerchantRegistered(address indexed merchant, address indexed payout, uint16 feeBps)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { merchant, payout, feeBps } = log.args;
          await prisma.merchant.upsert({
            where: {
              address_chainId: {
                address: merchant.toLowerCase(),
                chainId: chain.chainId,
              },
            },
            create: {
              address: merchant.toLowerCase(),
              payoutAddress: payout.toLowerCase(),
              feeBps: Number(feeBps),
              active: true,
              chainId: chain.chainId,
            },
            update: {
              payoutAddress: payout.toLowerCase(),
              feeBps: Number(feeBps),
            },
          });
          logger.info(
            { merchant, chainId: chain.chainId },
            'Merchant registered'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process MerchantRegistered event');
        }
      }
    },
  });

  // Watch MerchantStatus
  client.watchEvent({
    address: chain.contracts.merchantRegistry,
    event: parseAbiItem('event MerchantStatus(address indexed merchant, bool active)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { merchant, active } = log.args;
          await prisma.merchant.update({
            where: {
              address_chainId: {
                address: merchant.toLowerCase(),
                chainId: chain.chainId,
              },
            },
            data: { active },
          });
          logger.info(
            { merchant, active, chainId: chain.chainId },
            'Merchant status updated'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process MerchantStatus event');
        }
      }
    },
  });
}

function watchInvoiceEvents(client: any, chain: ChainConfig, prisma: PrismaClient, logger: Logger) {
  // Watch InvoiceCreated
  client.watchEvent({
    address: chain.contracts.invoice,
    event: parseAbiItem('event InvoiceCreated(bytes32 indexed id, address indexed merchant, uint256 amount, uint64 expiry, uint256 chainId, bytes32 memoHash)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { id, merchant, amount, expiry, chainId, memoHash } = log.args;
          // Ensure merchant exists (handles out-of-order events)
          await prisma.merchant.upsert({
            where: {
              address_chainId: {
                address: merchant.toLowerCase(),
                chainId: Number(chainId),
              },
            },
            create: {
              address: merchant.toLowerCase(),
              payoutAddress: merchant.toLowerCase(), // temporary until MerchantRegistered arrives
              feeBps: 0,
              active: true,
              chainId: Number(chainId),
            },
            update: {},
          });
          await prisma.invoice.create({
            data: {
              id,
              merchant: merchant.toLowerCase(),
              amount: amount.toString(),
              chainId: Number(chainId),
              expiry: Number(expiry),
              memoHash,
              status: 'unpaid',
              blockNumber: Number(log.blockNumber),
            },
          });
          logger.info(
            { invoiceId: id, merchant, amount: amount.toString(), chainId },
            'Invoice created'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process InvoiceCreated event');
        }
      }
    },
  });

  // Watch InvoiceCancelled
  client.watchEvent({
    address: chain.contracts.invoice,
    event: parseAbiItem('event InvoiceCancelled(bytes32 indexed id)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { id } = log.args;
          await prisma.invoice.update({
            where: { id },
            data: { status: 'cancelled' },
          });
          logger.info(
            { invoiceId: id, chainId: chain.chainId },
            'Invoice cancelled'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process InvoiceCancelled event');
        }
      }
    },
  });
}

function watchCheckoutEvents(client: any, chain: ChainConfig, prisma: PrismaClient, logger: Logger) {
  // Watch Settled
  client.watchEvent({
    address: chain.contracts.checkout,
    event: parseAbiItem('event Settled(bytes32 indexed receiptId, bytes32 indexed invoiceId, address indexed payer, address merchant, uint256 amount, uint256 chainId, bytes32 txHash)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { receiptId, invoiceId, payer, merchant, amount, chainId } = log.args;
          
          // Create receipt
          await prisma.receipt.create({
            data: {
              id: receiptId,
              invoiceId,
              payer: payer.toLowerCase(),
              merchant: merchant.toLowerCase(),
              amount: amount.toString(),
              chainId: Number(chainId),
              txHash: log.transactionHash,
              blockTime: Number(await client.getBlock({ blockNumber: log.blockNumber }).then((b: any) => b.timestamp)),
              blockNumber: Number(log.blockNumber),
            },
          });

          // Update invoice status
          await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
              status: 'paid',
              txHash: log.transactionHash,
              blockNumber: Number(log.blockNumber),
            },
          });

          logger.info(
            { receiptId, invoiceId, payer, merchant, amount: amount.toString(), chainId },
            'Invoice settled'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process Settled event');
        }
      }
    },
  });
}

function watchBridgeEvents(client: any, chain: ChainConfig, prisma: PrismaClient, logger: Logger) {
  // Watch Locked
  client.watchEvent({
    address: chain.contracts.bridgeEscrow,
    event: parseAbiItem('event Locked(bytes32 indexed ref, address indexed payer, uint256 amount, uint256 timestamp)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { ref, payer, amount } = log.args;
          await prisma.bridge.upsert({
            where: { ref },
            create: {
              ref,
              srcChainId: chain.chainId,
              dstChainId: 0, // Will be updated later
              payer: payer.toLowerCase(),
              amount: amount.toString(),
              status: 'locked',
              lockTxHash: log.transactionHash,
              lockedAt: new Date(),
            },
            update: {
              status: 'locked',
              lockTxHash: log.transactionHash,
              lockedAt: new Date(),
            },
          });
          logger.info(
            { ref, payer, amount: amount.toString(), chainId: chain.chainId },
            'Bridge locked'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process Locked event');
        }
      }
    },
  });

  // Watch Released
  client.watchEvent({
    address: chain.contracts.bridgeEscrow,
    event: parseAbiItem('event Released(bytes32 indexed ref, address indexed to, uint256 amount, uint256 timestamp)'),
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        try {
          const { ref } = log.args;
          await prisma.bridge.update({
            where: { ref },
            data: {
              status: 'released',
              releaseTxHash: log.transactionHash,
              releasedAt: new Date(),
              dstChainId: chain.chainId,
            },
          });
          logger.info(
            { ref, chainId: chain.chainId },
            'Bridge released'
          );
        } catch (error) {
          logger.error({ error, log }, 'Failed to process Released event');
        }
      }
    },
  });
}

