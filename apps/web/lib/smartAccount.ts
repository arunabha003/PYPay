'use client';

import {
  type Address,
  type Hex,
  createPublicClient,
  http,
  createWalletClient,
  custom,
} from 'viem';

const ACCOUNT_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createAccount',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'guardian', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAddress',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'guardian', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Get counterfactual smart account address
 */
export async function getSmartAccountAddress(
  factoryAddress: Address,
  owner: Address,
  guardian: Address,
  salt: bigint,
  rpcUrl: string
): Promise<Address> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });
  
  const address = await client.readContract({
    address: factoryAddress,
    abi: ACCOUNT_FACTORY_ABI,
    functionName: 'getAddress',
    args: [owner, guardian, salt],
  });
  
  return address;
}

/**
 * Check if smart account is deployed
 */
export async function isAccountDeployed(
  accountAddress: Address,
  rpcUrl: string
): Promise<boolean> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });
  
  const code = await client.getBytecode({ address: accountAddress });
  return code !== undefined && code !== '0x';
}

/**
 * Get or create smart account
 * Returns counterfactual address (may not be deployed yet)
 */
export async function getOrCreateSmartAccount(
  owner: Address,
  guardian: Address,
  factoryAddress: Address,
  rpcUrl: string,
  salt: bigint = 0n
): Promise<{
  address: Address;
  isDeployed: boolean;
}> {
  // Get counterfactual address
  const address = await getSmartAccountAddress(
    factoryAddress,
    owner,
    guardian,
    salt,
    rpcUrl
  );
  
  // Check if deployed
  const isDeployed = await isAccountDeployed(address, rpcUrl);
  
  // Store in localStorage
  if (typeof window !== 'undefined') {
    const passkeyUser = localStorage.getItem('passkeyUser');
    if (passkeyUser) {
      const user = JSON.parse(passkeyUser);
      user.smartAccountAddress = address;
      user.owner = owner;
      localStorage.setItem('passkeyUser', JSON.stringify(user));
    }
  }
  
  return { address, isDeployed };
}

/**
 * Get PYUSD balance for account
 */
export async function getPYUSDBalance(
  accountAddress: Address,
  pyusdAddress: Address,
  rpcUrl: string
): Promise<bigint> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });
  
  const balance = await client.readContract({
    address: pyusdAddress,
    abi: [
      {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'balanceOf',
    args: [accountAddress],
  });
  
  return balance;
}

