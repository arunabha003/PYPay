import type { ChainConfig } from '@pypay/common';
import { createPublicClient, http, formatGwei, parseGwei } from 'viem';

// Cache ETH price to avoid rate limits (update every 60s)
let cachedEthPrice = parseFloat(process.env.ETH_USD_PRICE || '2000');
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 60000; // 60 seconds

const INVENTORY_FEE_BPS = parseInt(process.env.INVENTORY_FEE_BPS || '30', 10);

// Estimated gas units for settle transaction
const SETTLE_GAS_UNITS = 150000n;
const LOCK_GAS_UNITS = 80000n;
const RELEASE_GAS_UNITS = 70000n;

/**
 * Fetch real-time ETH/USD price from CoinGecko API
 */
async function fetchEthPrice(): Promise<number> {
  const now = Date.now();
  
  // Return cached price if still valid
  if (now - lastPriceFetch < PRICE_CACHE_TTL) {
    return cachedEthPrice;
  }
  
  try {
    console.log('[Cost Engine] Fetching real-time ETH price from CoinGecko...');
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) } // 5s timeout
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as { ethereum?: { usd?: number } };
    const price = data.ethereum?.usd;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid price data received');
    }
    
    cachedEthPrice = price;
    lastPriceFetch = now;
    
    console.log(`[Cost Engine] ✅ ETH price updated: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    console.error('[Cost Engine] ⚠️  Failed to fetch ETH price:', error);
    console.log(`[Cost Engine] Using cached/fallback price: $${cachedEthPrice.toFixed(2)}`);
    return cachedEthPrice;
  }
}

interface GasEstimate {
  baseFee: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/**
 * Estimate gas costs for a chain (with real-time price)
 */
export async function estimateGasCost(chain: ChainConfig): Promise<number> {
  try {
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

    // Get latest block to extract base fee
    const block = await client.getBlock({ blockTag: 'latest' });
    
    if (!block.baseFeePerGas) {
      console.warn(`No baseFeePerGas for ${chain.name}, using fallback`);
      return 0.01; // Fallback for chains without EIP-1559
    }

    // Fetch real-time ETH price
    const ethPriceUsd = await fetchEthPrice();

    // Calculate gas cost: gasUnits * baseFee * ethPrice
    // baseFee is in wei, we need to convert to ETH
    const gasCostWei = SETTLE_GAS_UNITS * block.baseFeePerGas;
    const gasCostEth = Number(gasCostWei) / 1e18;
    const gasCostUsd = gasCostEth * ethPriceUsd;

    console.log(`[Cost Engine] ${chain.name}: Gas=${formatGwei(block.baseFeePerGas)} gwei, Cost=$${gasCostUsd.toFixed(4)}`);

    return gasCostUsd;
  } catch (error) {
    console.error(`Error estimating gas for ${chain.name}:`, error);
    // Return fallback value
    return chain.chainId === 421614 ? 0.01 : 0.15; // Arbitrum cheaper than mainnet
  }
}

/**
 * Calculate bridge cost
 */
export function calculateBridgeCost(amount: string): number {
  // Bridge cost = inventory fee + lock gas + release gas
  const amountNum = parseFloat(amount) / 1e6; // Convert from PYUSD (6 decimals) to USD
  const inventoryFee = (amountNum * INVENTORY_FEE_BPS) / 10000;
  
  // Estimate lock and release gas costs (simplified)
  const lockGasCostUsd = 0.01;
  const releaseGasCostUsd = 0.01;
  
  return inventoryFee + lockGasCostUsd + releaseGasCostUsd;
}

/**
 * Estimate transaction latency based on chain
 */
export function estimateLatency(chainId: number): number {
  // Moving average would be better, but for MVP we use static estimates
  switch (chainId) {
    case 421614: // Arbitrum Sepolia
      return 3000; // 3 seconds
    case 11155111: // Ethereum Sepolia
      return 12000; // 12 seconds
    default:
      return 5000; // 5 seconds default
  }
}

/**
 * Calculate total cost quote for a chain
 */
export async function calculateCostQuote(chain: ChainConfig) {
  const gasSponsorCostUsd = await estimateGasCost(chain);
  const bridgeCostUsd = calculateBridgeCost('1000000'); // 1 PYUSD as reference
  const estLatencyMs = estimateLatency(chain.chainId);
  const totalCostUsd = gasSponsorCostUsd + bridgeCostUsd;

  return {
    chainId: chain.chainId,
    chainName: chain.name,
    gasSponsorCostUsd,
    estLatencyMs,
    bridgeCostUsd,
    totalCostUsd,
    updatedAt: new Date(),
  };
}
