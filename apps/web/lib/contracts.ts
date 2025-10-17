import { createPublicClient, createWalletClient, http, type Address, type Hash, encodeAbiParameters, keccak256, toHex, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainById } from './config';

// ABIs
const MERCHANT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerMerchant',
    inputs: [
      { name: 'merchant', type: 'address' },
      { name: 'payout', type: 'address' },
      { name: 'feeBps', type: 'uint16' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getMerchant',
    inputs: [{ name: 'merchant', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'payoutAddress', type: 'address' },
          { name: 'feeBps', type: 'uint16' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'MerchantRegistered',
    inputs: [
      { indexed: true, name: 'merchant', type: 'address' },
      { indexed: false, name: 'payout', type: 'address' },
      { indexed: false, name: 'feeBps', type: 'uint16' },
    ],
  },
] as const;

const INVOICE_ABI = [
  {
    type: 'function',
    name: 'createInvoice',
    inputs: [
      { name: 'merchant', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
      { name: 'memoHash', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'id', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getInvoice',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'id', type: 'bytes32' },
          { name: 'merchant', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiry', type: 'uint64' },
          { name: 'memoHash', type: 'bytes32' },
          { name: 'chainId', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'InvoiceCreated',
    inputs: [
      { indexed: true, name: 'id', type: 'bytes32' },
      { indexed: true, name: 'merchant', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'expiry', type: 'uint64' },
      { indexed: false, name: 'chainId', type: 'uint256' },
      { indexed: false, name: 'memoHash', type: 'bytes32' },
    ],
  },
] as const;

// Create clients for a specific chain
export function createChainClients(chainId: number, privateKey?: `0x${string}`) {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(`Chain ${chainId} not configured`);
  }

  const publicClient = createPublicClient({
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

  let walletClient;
  if (privateKey) {
    const account = privateKeyToAccount(privateKey);
    walletClient = createWalletClient({
      account,
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
  }

  return { publicClient, walletClient, chain };
}

// Get merchant info
export async function getMerchant(chainId: number, merchantAddress: Address) {
  const { publicClient, chain } = createChainClients(chainId);

  try {
    const result = await publicClient.readContract({
      address: chain.contracts.merchantRegistry as Address,
      abi: MERCHANT_REGISTRY_ABI,
      functionName: 'getMerchant',
      args: [merchantAddress],
    });

    const [payoutAddress, feeBps, active] = result as unknown as [
      `0x${string}`,
      number,
      boolean,
    ];

    return { payoutAddress, feeBps, active };
  } catch (error) {
    console.error('Failed to get merchant:', error);
    return null;
  }
}

// Create invoice on-chain
export async function createInvoice(
  chainId: number,
  merchant: Address,
  amount: bigint,
  expiryMinutes: number,
  memo: string,
  privateKey: `0x${string}`
) {
  const { publicClient, walletClient, chain } = createChainClients(chainId, privateKey);

  if (!walletClient) {
    throw new Error('Wallet client not initialized');
  }

  // Calculate expiry timestamp
  const expiry = BigInt(Math.floor(Date.now() / 1000) + expiryMinutes * 60);

  // Hash the memo
  const memoHash = keccak256(toHex(memo));

  // Generate a unique salt
  const salt = keccak256(toHex(`${Date.now()}-${Math.random()}-${merchant}-${amount}`));

  // Call createInvoice
  const hash = await walletClient.writeContract({
    address: chain.contracts.invoice as Address,
    abi: INVOICE_ABI,
    functionName: 'createInvoice',
    args: [
      merchant,
      amount,
      expiry,
      memoHash,
      BigInt(chainId),
      salt,
    ],
  });

  // Wait for transaction confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log('Transaction succeeded:', {
    hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    logsCount: receipt.logs.length,
    contractAddress: chain.contracts.invoice,
  });

  // Parse all logs to find InvoiceCreated event
  const logs = receipt.logs;
  let invoiceId: `0x${string}` | null = null;

  for (const log of logs) {
    console.log('Processing log:', {
      address: log.address,
      topics: log.topics,
    });
    
    try {
      const decoded = decodeEventLog({
        abi: INVOICE_ABI,
        topics: log.topics,
        data: log.data,
      });
      
      console.log('Decoded event:', decoded);
      
      // Check if this is the InvoiceCreated event
      if (decoded.eventName === 'InvoiceCreated') {
        invoiceId = decoded.args.id as `0x${string}`;
        console.log('Found InvoiceCreated event, id:', invoiceId);
        break;
      }
    } catch (error) {
      // This log doesn't match our ABI, skip it
      console.log('Log does not match INVOICE_ABI');
      continue;
    }
  }

  if (!invoiceId) {
    // Safely stringify objects containing BigInt values
    const safeStringify = (obj: unknown) =>
      JSON.stringify(
        obj,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      );

    console.error('Transaction receipt:', safeStringify(receipt));
    throw new Error('InvoiceCreated event not found in transaction logs. Check if the transaction succeeded.');
  }

  return {
    invoiceId,
    txHash: hash,
    blockNumber: receipt.blockNumber,
  };
}

// Get invoice from blockchain
export async function getInvoice(chainId: number, invoiceId: `0x${string}`) {
  const { publicClient, chain } = createChainClients(chainId);

  try {
    const result: any = await publicClient.readContract({
      address: chain.contracts.invoice as Address,
      abi: INVOICE_ABI,
      functionName: 'getInvoice',
      args: [invoiceId],
    });

    const [id, merchant, amount, expiry, memoHash, chainId] = result as unknown as [
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      `0x${string}`,
      bigint,
    ];

    return { id, merchant, amount, expiry, memoHash, chainId };
  } catch (error) {
    console.error('Failed to get invoice:', error);
    return null;
  }
}

