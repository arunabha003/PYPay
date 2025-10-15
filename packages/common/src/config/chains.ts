import fs from 'fs';
import path from 'path';
import type { ChainConfig, ChainConfigRaw, ConfigFile } from '../types/chain';
import type { Address } from 'viem';

/**
 * Loads chain configuration from chains.config.json and resolves environment variables.
 * Fails fast if any required environment variable is missing.
 * 
 * @param configPath - Path to chains.config.json (defaults to root)
 * @returns Array of resolved chain configurations
 * @throws Error if config file is missing, invalid, or env vars are not set
 */
export function loadChainConfig(configPath?: string): ChainConfig[] {
  // Resolution priority:
  // 1) explicit configPath arg
  // 2) CHAIN_CONFIG_PATH env var
  // 3) find-up from cwd to repo root for chains.config.json
  const fromArg = configPath && fs.existsSync(configPath) ? configPath : undefined;
  const fromEnv = !fromArg && process.env.CHAIN_CONFIG_PATH && fs.existsSync(process.env.CHAIN_CONFIG_PATH)
    ? process.env.CHAIN_CONFIG_PATH
    : undefined;

  const fromFindUp = !fromArg && !fromEnv ? findUpward('chains.config.json', process.cwd()) : undefined;

  const resolvedPath = (fromArg || fromEnv || fromFindUp) ?? path.join(process.cwd(), 'chains.config.json');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Chain config file not found at ${resolvedPath}. ` +
      `Ensure chains.config.json exists at the repository root or set CHAIN_CONFIG_PATH.`
    );
  }

  let configFile: ConfigFile;
  try {
    const fileContents = fs.readFileSync(resolvedPath, 'utf8');
    configFile = JSON.parse(fileContents);
  } catch (error) {
    throw new Error(
      `Failed to parse chain config file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (!configFile.chains || !Array.isArray(configFile.chains)) {
    throw new Error('Invalid chain config: "chains" must be an array');
  }

  if (configFile.chains.length === 0) {
    throw new Error('No chains configured in chains.config.json');
  }

  return configFile.chains.map((chain) => resolveChainConfig(chain));
}

/**
 * Resolves a single chain configuration by reading env vars
 */
function resolveChainConfig(raw: ChainConfigRaw): ChainConfig {
  const { name, chainId } = raw;

  const rpcUrl = getRequiredEnv(raw.rpcUrlEnv, `RPC URL for ${name}`);
  const pyusdAddress = getRequiredEnv(raw.pyusdAddressEnv, `PYUSD address for ${name}`);
  const permit2Address = getRequiredEnv(raw.permit2AddressEnv, `Permit2 address for ${name}`);
  const entryPointAddress = getRequiredEnv(raw.entryPointAddressEnv, `EntryPoint address for ${name}`);
  const bundlerRpc = getRequiredEnv(raw.bundlerRpcEnv, `Bundler RPC for ${name}`);

  const contracts = {
    merchantRegistry: getRequiredEnv(
      raw.contracts.merchantRegistryEnv,
      `MerchantRegistry address for ${name}`
    ) as Address,
    invoice: getRequiredEnv(raw.contracts.invoiceEnv, `Invoice address for ${name}`) as Address,
    checkout: getRequiredEnv(raw.contracts.checkoutEnv, `Checkout address for ${name}`) as Address,
    paymaster: getRequiredEnv(raw.contracts.paymasterEnv, `Paymaster address for ${name}`) as Address,
    bridgeEscrow: getRequiredEnv(
      raw.contracts.bridgeEscrowEnv,
      `BridgeEscrow address for ${name}`
    ) as Address,
    accountFactory: getRequiredEnv(
      raw.contracts.accountFactoryEnv,
      `AccountFactory address for ${name}`
    ) as Address,
  };

  return {
    name,
    chainId,
    rpcUrl,
    pyusdAddress: pyusdAddress as Address,
    permit2Address: permit2Address as Address,
    entryPointAddress: entryPointAddress as Address,
    bundlerRpc,
    explorerUrl: raw.explorerUrl,
    contracts,
  };
}

/**
 * Gets a required environment variable, throwing if missing
 */
function getRequiredEnv(envVar: string, description: string): string {
  const value = process.env[envVar];
  
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${envVar} (${description}). ` +
      `Check your .env file and ensure all variables from env.example are set.`
    );
  }
  
  return value.trim();
}

/**
 * Gets chain config by chain ID
 */
export function getChainById(chains: ChainConfig[], chainId: number): ChainConfig | undefined {
  return chains.find((c) => c.chainId === chainId);
}

/**
 * Validates all chain configurations
 */
export function validateChainConfigs(chains: ChainConfig[]): void {
  for (const chain of chains) {
    // Validate addresses are properly formatted
    const addressPattern = /^0x[a-fA-F0-9]{40}$/;
    
    if (!addressPattern.test(chain.pyusdAddress)) {
      throw new Error(`Invalid PYUSD address for chain ${chain.name}: ${chain.pyusdAddress}`);
    }
    
    if (!addressPattern.test(chain.permit2Address)) {
      throw new Error(`Invalid Permit2 address for chain ${chain.name}: ${chain.permit2Address}`);
    }
    
    if (!addressPattern.test(chain.entryPointAddress)) {
      throw new Error(`Invalid EntryPoint address for chain ${chain.name}: ${chain.entryPointAddress}`);
    }
    
    // Validate contract addresses
    Object.entries(chain.contracts).forEach(([key, address]) => {
      if (!addressPattern.test(address)) {
        throw new Error(`Invalid ${key} address for chain ${chain.name}: ${address}`);
      }
    });
    
    // Validate RPC URL
    if (!chain.rpcUrl.startsWith('http://') && !chain.rpcUrl.startsWith('https://')) {
      throw new Error(`Invalid RPC URL for chain ${chain.name}: ${chain.rpcUrl}`);
    }
    
    // Validate chain ID
    if (chain.chainId <= 0) {
      throw new Error(`Invalid chain ID for chain ${chain.name}: ${chain.chainId}`);
    }
  }
}

/**
 * Walks up the directory tree from a start directory to find a file.
 */
function findUpward(filename: string, startDir: string): string | undefined {
  let currentDir = startDir;
  // Safety: limit to a reasonable number of parent traversals
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(currentDir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }
  return undefined;
}

