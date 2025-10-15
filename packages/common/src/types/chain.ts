import type { Address, Hex } from 'viem';

/**
 * Chain configuration loaded at runtime from chains.config.json
 */
export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  pyusdAddress: Address;
  permit2Address: Address;
  entryPointAddress: Address;
  bundlerRpc: string;
  explorerUrl: string;
  contracts: {
    merchantRegistry: Address;
    invoice: Address;
    checkout: Address;
    paymaster: Address;
    bridgeEscrow: Address;
    accountFactory: Address;
  };
}

/**
 * Raw chain config from JSON before env resolution
 */
export interface ChainConfigRaw {
  name: string;
  chainId: number;
  rpcUrlEnv: string;
  pyusdAddressEnv: string;
  permit2AddressEnv: string;
  entryPointAddressEnv: string;
  bundlerRpcEnv: string;
  explorerUrl: string;
  contracts: {
    merchantRegistryEnv: string;
    invoiceEnv: string;
    checkoutEnv: string;
    paymasterEnv: string;
    bridgeEscrowEnv: string;
    accountFactoryEnv: string;
  };
}

/**
 * Root config file structure
 */
export interface ConfigFile {
  chains: ChainConfigRaw[];
  ui: {
    appName: string;
    currency: string;
  };
}

