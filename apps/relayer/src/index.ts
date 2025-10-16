import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadChainConfig, validateChainConfigs } from '@pypay/common';
import { PrismaClient } from '@prisma/client';
import { registerRoutes } from './routes';
import { initializeBridgeMonitor } from './bridge/monitor';

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

    // Register CORS
    await app.register(cors, {
      origin: true,
    });

    // Register rate limiting
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // Register routes
    registerRoutes(app, prisma, chains);

    // Initialize bridge monitor
    app.log.info('Initializing bridge monitor...');
    await initializeBridgeMonitor(chains, prisma, app.log as any);

    // Start server
    const port = parseInt(process.env.RELAYER_PORT || '3002', 10);
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Relayer running on http://localhost:${port}`);
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

