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
      rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'https://arb-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl',
      bundlerRpc: process.env.NEXT_PUBLIC_BUNDLER_RPC_ARBSEPOLIA || 'https://public.pimlico.io/v2/421614/rpc',
      explorerUrl: 'https://sepolia.arbiscan.io',
      pyusdAddress: (process.env.NEXT_PUBLIC_PYUSD_ARBSEPOLIA || '0x637A1259C6afd7E3AdF63993cA7E58BB438aB1B1') as Address,
      permit2Address: (process.env.NEXT_PUBLIC_PERMIT2_ARBSEPOLIA || '0x000000000022D473030F116dDEE9F6B43aC78BA3') as Address,
      entryPointAddress: (process.env.NEXT_PUBLIC_ENTRYPOINT_ARBSEPOLIA || '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as Address,
      contracts: {
        merchantRegistry: (process.env.NEXT_PUBLIC_REGISTRY_ARBSEPOLIA || '0xB65901d4D41D6389827B2c23d6C92b29991865D9') as Address,
        invoice: (process.env.NEXT_PUBLIC_INVOICE_ARBSEPOLIA || '0x7c3ACA4B28be70C15bb4C3A8a93CE7dF64713ED0') as Address,
        checkout: (process.env.NEXT_PUBLIC_CHECKOUT_ARBSEPOLIA || '0x96AD79AB348336cFA881C9e0E582d25968799485') as Address,
        paymaster: (process.env.NEXT_PUBLIC_PAYMASTER_ARBSEPOLIA || '0xC54bBF5A6FC2D72A25985eba2eb385b3340c29a6') as Address,
        bridgeEscrow: (process.env.NEXT_PUBLIC_BRIDGE_ESCROW_ARBSEPOLIA || '0xC531d4D522Bb9DAFcCdED9d155C09502Cf0385B6') as Address,
        accountFactory: (process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ARBSEPOLIA || '0x19da58bD831E2A54De8716aCa2B1bb27dA450cB9') as Address,
      },
    },
    {
      name: 'Ethereum Sepolia',
      chainId: 11155111,
      rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC || 'https://eth-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl',
      bundlerRpc: process.env.NEXT_PUBLIC_BUNDLER_RPC_SEPOLIA || 'https://public.pimlico.io/v2/11155111/rpc',
      explorerUrl: 'https://sepolia.etherscan.io',
      pyusdAddress: (process.env.NEXT_PUBLIC_PYUSD_SEPOLIA || '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9') as Address,
      permit2Address: (process.env.NEXT_PUBLIC_PERMIT2_SEPOLIA || '0x000000000022D473030F116dDEE9F6B43aC78BA3') as Address,
      entryPointAddress: (process.env.NEXT_PUBLIC_ENTRYPOINT_SEPOLIA || '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as Address,
      contracts: {
        merchantRegistry: (process.env.NEXT_PUBLIC_REGISTRY_SEPOLIA || '0xa47749699925e9187906f5A0361D5073397279b3') as Address,
        invoice: (process.env.NEXT_PUBLIC_INVOICE_SEPOLIA || '0x48935538CEbdb57b7B75D2476DC6C9b3A1cceDD6') as Address,
        checkout: (process.env.NEXT_PUBLIC_CHECKOUT_SEPOLIA || '0xF57690CD5f91257E76C9f636de9B1243c4a0fD8e') as Address,
        paymaster: (process.env.NEXT_PUBLIC_PAYMASTER_SEPOLIA || '0xe6257bd26941cB6C3B977Fe2b2859aE7180396a4') as Address,
        bridgeEscrow: (process.env.NEXT_PUBLIC_BRIDGE_ESCROW_SEPOLIA || '0xfE5D99899A40C9bF4189bebFF7bd23CB2d7eFDE9') as Address,
        accountFactory: (process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_SEPOLIA || '0x15FfbD328C9A0280027E04503A3F15b6bdea91e5') as Address,
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

