import type { ChainConfig } from '@pypay/common';
import type { Address } from 'viem';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    if (typeof window !== 'undefined') {
      // On the client, envs are statically inlined at build; don't hard-throw here
      console.error(`Missing env at runtime (client): ${name}`);
      return '';
    }
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function getEnv(name: string, fallback: string = ''): string {
  return process.env[name] || fallback;
}

// Load chains configuration
export function getChains(): ChainConfig[] {
  // In production, this would load from chains.config.json
  // For now, we'll use environment variables
  return [
    {
      name: 'Arbitrum Sepolia',
      chainId: 421614,
      rpcUrl: getEnv('NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC', 'http://localhost:8545'),
      bundlerRpc: getEnv('NEXT_PUBLIC_BUNDLER_RPC_ARBSEPOLIA'),
      explorerUrl: 'https://sepolia.arbiscan.io',
      pyusdAddress: getEnv('NEXT_PUBLIC_PYUSD_ARBSEPOLIA') as Address,
      permit2Address: getEnv('NEXT_PUBLIC_PERMIT2_ARBSEPOLIA') as Address,
      entryPointAddress: getEnv('NEXT_PUBLIC_ENTRYPOINT_ARBSEPOLIA') as Address,
      contracts: {
        merchantRegistry: getEnv('NEXT_PUBLIC_REGISTRY_ARBSEPOLIA') as Address,
        invoice: getEnv('NEXT_PUBLIC_INVOICE_ARBSEPOLIA') as Address,
        checkout: getEnv('NEXT_PUBLIC_CHECKOUT_ARBSEPOLIA') as Address,
        paymaster: getEnv('NEXT_PUBLIC_PAYMASTER_ARBSEPOLIA') as Address,
        bridgeEscrow: getEnv('NEXT_PUBLIC_BRIDGE_ESCROW_ARBSEPOLIA') as Address,
        accountFactory: getEnv('NEXT_PUBLIC_ACCOUNT_FACTORY_ARBSEPOLIA') as Address,
      },
    },
    {
      name: 'Ethereum Sepolia',
      chainId: 11155111,
      rpcUrl: getEnv('NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC', 'http://localhost:8546'),
      bundlerRpc: getEnv('NEXT_PUBLIC_BUNDLER_RPC_SEPOLIA'),
      explorerUrl: 'https://sepolia.etherscan.io',
      pyusdAddress: getEnv('NEXT_PUBLIC_PYUSD_SEPOLIA') as Address,
      permit2Address: getEnv('NEXT_PUBLIC_PERMIT2_SEPOLIA') as Address,
      entryPointAddress: getEnv('NEXT_PUBLIC_ENTRYPOINT_SEPOLIA') as Address,
      contracts: {
        merchantRegistry: getEnv('NEXT_PUBLIC_REGISTRY_SEPOLIA') as Address,
        invoice: getEnv('NEXT_PUBLIC_INVOICE_SEPOLIA') as Address,
        checkout: getEnv('NEXT_PUBLIC_CHECKOUT_SEPOLIA') as Address,
        paymaster: getEnv('NEXT_PUBLIC_PAYMASTER_SEPOLIA') as Address,
        bridgeEscrow: getEnv('NEXT_PUBLIC_BRIDGE_ESCROW_SEPOLIA') as Address,
        accountFactory: getEnv('NEXT_PUBLIC_ACCOUNT_FACTORY_SEPOLIA') as Address,
      },
    },
  ];
}

export function getChainById(chainId: number): ChainConfig | undefined {
  return getChains().find((c) => c.chainId === chainId);
}

export function getIndexerUrl(): string {
  return getEnv('NEXT_PUBLIC_INDEXER_URL', 'http://localhost:3001');
}

export function getRelayerUrl(): string {
  return getEnv('NEXT_PUBLIC_RELAYER_URL', 'http://localhost:3002');
}

