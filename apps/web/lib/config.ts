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
  return [
    {
      name: 'Arbitrum Sepolia',
      chainId: 421614,
      rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'http://localhost:8545',
      bundlerRpc: process.env.NEXT_PUBLIC_BUNDLER_RPC_ARBSEPOLIA || 'https://public.pimlico.io/v2/421614/rpc',
      explorerUrl: 'https://sepolia.arbiscan.io',
      pyusdAddress: (process.env.NEXT_PUBLIC_PYUSD_ARBSEPOLIA || '0x3524E03B46e05Df7c6ba9836D04DBFAB409c03d1') as Address,
      permit2Address: (process.env.NEXT_PUBLIC_PERMIT2_ARBSEPOLIA || '0x000000000022D473030F116dDEE9F6B43aC78BA3') as Address,
      entryPointAddress: (process.env.NEXT_PUBLIC_ENTRYPOINT_ARBSEPOLIA || '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as Address,
      contracts: {
        merchantRegistry: (process.env.NEXT_PUBLIC_REGISTRY_ARBSEPOLIA || '0x0e724267431C7131B53BE4F6E41310FDFE01c50f') as Address,
        invoice: (process.env.NEXT_PUBLIC_INVOICE_ARBSEPOLIA || '0xf588f57BE135813d305815Dc3E71960c97987b19') as Address,
        checkout: (process.env.NEXT_PUBLIC_CHECKOUT_ARBSEPOLIA || '0x18af4b36A524F50ba44A61C6F6CACe908c2d02EA') as Address,
        paymaster: (process.env.NEXT_PUBLIC_PAYMASTER_ARBSEPOLIA || '0x2ec6622F4Ea3315DB6045d7C4947F63581090568') as Address,
        bridgeEscrow: (process.env.NEXT_PUBLIC_BRIDGE_ESCROW_ARBSEPOLIA || '0x07150543b2F1fda0de261E80f6C1e75EE6046aDf') as Address,
        accountFactory: (process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ARBSEPOLIA || '0x9a81C9fAddbcBfB565cccdc47A04013aD55695b9') as Address,
      },
    },
    {
      name: 'Ethereum Sepolia',
      chainId: 11155111,
      rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC || 'http://localhost:8546',
      bundlerRpc: process.env.NEXT_PUBLIC_BUNDLER_RPC_SEPOLIA || 'https://public.pimlico.io/v2/11155111/rpc',
      explorerUrl: 'https://sepolia.etherscan.io',
      pyusdAddress: (process.env.NEXT_PUBLIC_PYUSD_SEPOLIA || '0x84E7E889E1352A3b692C23e7cfEc0430a1b0a4cE') as Address,
      permit2Address: (process.env.NEXT_PUBLIC_PERMIT2_SEPOLIA || '0x000000000022D473030F116dDEE9F6B43aC78BA3') as Address,
      entryPointAddress: (process.env.NEXT_PUBLIC_ENTRYPOINT_SEPOLIA || '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as Address,
      contracts: {
        merchantRegistry: (process.env.NEXT_PUBLIC_REGISTRY_SEPOLIA || '0xF162722DcbE712B07BED0B7eE8e1Ff5472065938') as Address,
        invoice: (process.env.NEXT_PUBLIC_INVOICE_SEPOLIA || '0xfc9e760FA43981D0774D9Ec8C9b14cd309D34618') as Address,
        checkout: (process.env.NEXT_PUBLIC_CHECKOUT_SEPOLIA || '0x7158b1c0A2fcBc29e4aC15308469265791fD2aE0') as Address,
        paymaster: (process.env.NEXT_PUBLIC_PAYMASTER_SEPOLIA || '0xb792cC6F4cC1514cF0fFF3e6cA559D287be2139C') as Address,
        bridgeEscrow: (process.env.NEXT_PUBLIC_BRIDGE_ESCROW_SEPOLIA || '0x77D835ac543d6Bb92d98A6D817C30dE00b8CE948') as Address,
        accountFactory: (process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_SEPOLIA || '0xE0DE6E540ca888F045Aed3Bd4326A4BB1586DB5E') as Address,
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

