import 'dotenv/config';
import { loadChainConfig, validateChainConfigs } from '@pypay/common';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { startUpdater } from './updater';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
});

const prisma = new PrismaClient();

async function main() {
  try {
    // Load and validate chain configurations
    logger.info('Loading chain configurations...');
    const chains = loadChainConfig();
    validateChainConfigs(chains);
    logger.info(`Loaded ${chains.length} chain configurations`);

    // Start cost quote updater
    await startUpdater(chains, prisma, logger);

    logger.info('Cost engine is running');
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

main();

