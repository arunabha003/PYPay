import { NextResponse } from 'next/server';
import { createInvoice } from '@/lib/contracts';
import { parseUnits, type Address } from 'viem';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, merchant, amount, expiryMinutes, memo } = body;

    // Validate inputs
    if (!chainId || !merchant || !amount || !expiryMinutes || !memo) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // For development, use the deployer private key (Anvil account #0)
    // In production, this would be the merchant's key or use a meta-transaction
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    // Convert amount to wei (PYUSD has 6 decimals)
    const amountWei = parseUnits(amount.toString(), 6);

    // Create invoice on-chain
    const result = await createInvoice(
      parseInt(chainId),
      merchant as Address,
      amountWei,
      parseInt(expiryMinutes),
      memo,
      privateKey as `0x${string}`
    );

    return NextResponse.json({
      invoiceId: result.invoiceId,
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      checkoutUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/checkout/${result.invoiceId}`,
    });
  } catch (error) {
    console.error('Failed to create invoice:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

