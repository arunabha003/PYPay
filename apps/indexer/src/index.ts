import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });

import fastify from 'fastify';
import cors from '@fastify/cors';
import { loadChainConfig, validateChainConfigs } from '@pypay/common';
import { PrismaClient } from '@prisma/client';
import { initializeWatchers } from './watchers';
import { registerRoutes } from './routes';

const prisma = new PrismaClient();
const app = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

async function main() {
  try {
    // Load and validate chain configurations
    app.log.info('Loading chain configurations...');
    const chains = loadChainConfig();
    validateChainConfigs(chains);
    app.log.info(`Loaded ${chains.length} chain configurations`);
    for (const c of chains) {
      app.log.info({ chainId: c.chainId, name: c.name, rpcUrl: c.rpcUrl }, 'Chain config');
      app.log.info({ contracts: c.contracts }, 'Contract addresses');
    }

    // Register CORS
    await app.register(cors, {
      origin: true,
    });

    // Register routes
    registerRoutes(app, prisma, chains);

    // Initialize event watchers (non-blocking)
    app.log.info('Initializing event watchers...');
    initializeWatchers(chains, prisma, app.log as any).catch((e) => {
      app.log.error(e, 'Watcher initialization failed');
      process.exit(1);
    });

    // Start server
    const port = parseInt(process.env.INDEXER_PORT || '3001', 10);
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Indexer running on http://localhost:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  app.log.info('Shutting down...');
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
});

main();

