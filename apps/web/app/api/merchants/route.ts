import { NextResponse } from 'next/server';
import { getIndexerUrl } from '@/lib/config';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = searchParams.get('chainId');

    const indexerUrl = getIndexerUrl();
    const url = chainId 
      ? `${indexerUrl}/merchants?chainId=${chainId}`
      : `${indexerUrl}/merchants`;

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Indexer returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch merchants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch merchants' },
      { status: 500 }
    );
  }
}

