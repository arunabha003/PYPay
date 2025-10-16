import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ChainConfig } from '@pypay/common';
import { GetInvoicesQuerySchema } from '@pypay/common';

export function registerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  chains: ChainConfig[]
) {
  // Root
  app.get('/', async () => {
    return {
      service: 'pypay-indexer',
      status: 'ok',
      docs: {
        health: '/health',
        invoice: '/invoice/:id',
        merchantInvoices: '/merchant/:address/invoices',
        merchantReceiptsCsv: '/merchant/:address/receipts.csv',
        costs: '/costs/quotes',
        bridge: '/bridge/:ref',
        chains: '/chains',
        user: '/user/:address',
      },
    };
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: Date.now(),
      chains: chains.length,
    };
  });

  // Get invoice by ID
  app.get<{ Params: { id: string } }>('/invoice/:id', async (request, reply) => {
    const { id } = request.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        receipts: true,
      },
    });

    if (!invoice) {
      return reply.code(404).send({ error: 'Invoice not found' });
    }

    return invoice;
  });

  // Get merchant invoices
  app.get<{
    Params: { address: string };
    Querystring: { chainId?: string; status?: string; limit?: string; offset?: string };
  }>('/merchant/:address/invoices', async (request, reply) => {
    const { address } = request.params;
    const query = {
      chainId: request.query.chainId ? parseInt(request.query.chainId, 10) : undefined,
      status: request.query.status,
      limit: request.query.limit ? parseInt(request.query.limit, 10) : 20,
      offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
    };

    // Validate query
    const validation = GetInvoicesQuerySchema.safeParse(query);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Invalid query parameters', details: validation.error });
    }

    const where: any = { merchant: address.toLowerCase() };
    if (query.chainId) where.chainId = query.chainId;
    if (query.status) where.status = query.status;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    };
  });

  // Get merchant receipts (CSV)
  app.get<{ Params: { address: string } }>('/merchant/:address/receipts.csv', async (request, reply) => {
    const { address } = request.params;

    const receipts = await prisma.receipt.findMany({
      where: { merchant: address.toLowerCase() },
      orderBy: { blockTime: 'desc' },
    });

    // Generate CSV
    const csv = [
      'Receipt ID,Invoice ID,Payer,Amount,Chain ID,Tx Hash,Block Time,Created At',
      ...receipts.map((r: any) =>
        [
          r.id,
          r.invoiceId,
          r.payer,
          r.amount,
          r.chainId,
          r.txHash,
          new Date(r.blockTime * 1000).toISOString(),
          r.createdAt.toISOString(),
        ].join(',')
      ),
    ].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="receipts-${address}.csv"`);
    return csv;
  });

  // Get cost quotes
  app.get('/costs/quotes', async () => {
    const quotes = await prisma.costQuote.findMany({
      orderBy: { totalCostUsd: 'asc' },
    });

    return quotes;
  });

  // Get bridge by ref
  app.get<{ Params: { ref: string } }>('/bridge/:ref', async (request, reply) => {
    const { ref } = request.params;

    const bridge = await prisma.bridge.findUnique({
      where: { ref },
    });

    if (!bridge) {
      return reply.code(404).send({ error: 'Bridge not found' });
    }

    return bridge;
  });

  // Get chain info
  app.get('/chains', async () => {
    return chains.map((c) => ({
      name: c.name,
      chainId: c.chainId,
      explorerUrl: c.explorerUrl,
    }));
  });

  // Get user by smart account
  app.get<{ Params: { address: string } }>('/user/:address', async (request, reply) => {
    const { address } = request.params;

    const user = await prisma.user.findFirst({
      where: { smartAccountAddress: address.toLowerCase() },
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return user;
  });
}

