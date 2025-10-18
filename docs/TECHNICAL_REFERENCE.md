# 📚 Technical Reference

Complete technical documentation for PyPay architecture, contracts, APIs, and implementation details.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Smart Contracts](#smart-contracts)
3. [Off-Chain Services](#off-chain-services)
4. [Frontend Architecture](#frontend-architecture)
5. [Authentication Flow](#authentication-flow)
6. [Payment Flow](#payment-flow)
7. [Bridge Flow](#bridge-flow)
8. [Cost Calculation](#cost-calculation)
9. [API Reference](#api-reference)
10. [Database Schema](#database-schema)
11. [Security Model](#security-model)
12. [Configuration](#configuration)

---

## 1. System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    User Layer (Browser)                       │
│  ┌─────────────────┐              ┌──────────────────────┐  │
│  │ Merchant Portal │              │  Buyer Checkout      │  │
│  │  - Dashboard    │              │  - Passkey Login     │  │
│  │  - Invoice Mgmt │              │  - Chain Selection   │  │
│  │  - CSV Export   │              │  - Payment Flow      │  │
│  └─────────────────┘              └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────────┐
        │                 │                     │
┌───────▼─────────┐ ┌────▼──────────┐  ┌──────▼───────────┐
│    Indexer      │ │    Relayer    │  │  Cost Engine     │
│                 │ │               │  │                  │
│  - Event Watch  │ │  - WebAuthn   │  │  - Gas Quotes    │
│  - Persist DB   │ │  - Session    │  │  - Bridge Cost   │
│  - Read APIs    │ │  - Bundler    │  │  - 15s Refresh   │
└────────┬────────┘ └───────┬───────┘  └────────┬─────────┘
         │                  │                   │
         └──────────────────┼───────────────────┘
                            │
         ┌──────────────────┴────────────────────┐
         │                                       │
┌────────▼─────────────┐              ┌─────────▼──────────────┐
│  Arbitrum Sepolia    │              │  Ethereum Sepolia      │
│                      │              │                        │
│  Smart Contracts:    │              │  Smart Contracts:      │
│  - MerchantRegistry  │              │  - MerchantRegistry    │
│  - Invoice           │              │  - Invoice             │
│  - Checkout          │              │  - Checkout            │
│  - BridgeEscrow      │◄────────────►│  - BridgeEscrow        │
│  - TapKitPaymaster   │   Bridge     │  - TapKitPaymaster     │
│  - AccountFactory    │   Coord.     │  - AccountFactory      │
│  - TapKitAccount(s)  │              │  - TapKitAccount(s)    │
└──────────────────────┘              └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Tech Stack |
|-----------|---------------|------------|
| **Merchant Portal** | Invoice creation, dashboard | Next.js, React |
| **Buyer Checkout** | Payment UI, authentication | Next.js, WebAuthn |
| **Indexer** | Event watching, read APIs | Fastify, Prisma, Viem |
| **Relayer** | Gasless txs, bridge coordination | Fastify, Viem |
| **Cost Engine** | Real-time cost calculation | Node.js, Viem |
| **Smart Contracts** | On-chain logic, settlement | Solidity 0.8.27 |

---

## 2. Smart Contracts

### Core Contracts

#### 2.1 MerchantRegistry.sol

**Purpose:** Manage merchant registrations and status.

**State:**
```solidity
struct Merchant {
    address payout;  // Where funds are sent
    uint16 feeBps;   // Platform fee (0-1000 = 0-10%)
    bool active;     // Can create invoices
}

mapping(address => Merchant) public merchants;
```

**Key Functions:**
```solidity
function registerMerchant(
    address merchant,
    address payout,
    uint16 feeBps
) external onlyOwner;

function setActive(address merchant, bool active) external onlyOwner;

function isActive(address merchant) external view returns (bool);
```

**Events:**
```solidity
event MerchantRegistered(address indexed merchant, address payout, uint16 feeBps);
event MerchantStatus(address indexed merchant, bool active);
event MerchantUpdated(address indexed merchant, address newPayout, uint16 newFeeBps);
```

---

#### 2.2 Invoice.sol

**Purpose:** Create and manage payment invoices.

**State:**
```solidity
struct InvoiceData {
    address merchant;
    uint256 amount;
    uint64 expiry;
    bytes32 memoHash;
    uint256 chainId;
}

mapping(bytes32 => InvoiceData) public invoices;
mapping(bytes32 => bool) public exists;
mapping(bytes32 => bool) public cancelled;
```

**Key Functions:**
```solidity
function createInvoice(
    address merchant,
    uint256 amount,
    uint64 expiry,
    bytes32 memoHash,
    uint256 chainId,
    bytes32 salt
) external returns (bytes32 invoiceId);

function cancelInvoice(bytes32 invoiceId) external;

function isValid(bytes32 invoiceId) external view returns (bool);
```

**Invoice ID Calculation:**
```solidity
invoiceId = keccak256(abi.encode(
    merchant,
    amount,
    expiry,
    memoHash,
    chainId,
    salt
));
```

---

#### 2.3 Checkout.sol

**Purpose:** Settle payments and emit receipts.

**State:**
```solidity
IERC20 public immutable PYUSD;
address public immutable PERMIT2;
MerchantRegistry public immutable REGISTRY;

mapping(bytes32 => bool) public paid;
```

**Key Functions:**
```solidity
struct InvoiceTuple {
    bytes32 invoiceId;
    address merchant;
    uint256 amount;
    uint64 expiry;
    uint256 chainId;
    bytes32 memoHash;
}

function settle(
    InvoiceTuple calldata invoice,
    address payer,
    bytes calldata permit2Data
) external returns (bytes32 receiptId);
```

**Validation Steps:**
1. Check merchant is active
2. Check invoice not already paid
3. Check expiry > block.timestamp
4. Check chainId == block.chainid
5. Check amount > 0
6. Process Permit2 or require approval
7. Transfer PYUSD to merchant payout
8. Mark as paid, emit Settled event

---

#### 2.4 BridgeEscrow.sol

**Purpose:** Hold PYUSD for inventory-based bridging.

**State:**
```solidity
IERC20 public immutable PYUSD;
address public owner; // Relayer

mapping(bytes32 => bool) public lockProcessed;
mapping(bytes32 => bool) public releaseProcessed;
mapping(bytes32 => uint256) public lockedAmounts;
```

**Key Functions:**
```solidity
function lock(bytes32 ref, uint256 amount) external;

function release(
    bytes32 ref,
    address to,
    uint256 amount
) external onlyOwner;

function depositInventory(uint256 amount) external;
function withdrawInventory(address to, uint256 amount) external onlyOwner;
```

**Bridge Ref Format:**
```solidity
ref = keccak256(abi.encode(
    srcChainId,
    dstChainId,
    payer,
    amount,
    nonce
));
```

---

### Account Abstraction Contracts

#### 2.5 TapKitAccount.sol

**Purpose:** ERC-4337 smart account with session key support.

**Inheritance:**
- `ERC4337` (Solady)
- `ERC1271` (Signature validation)

**State:**
```solidity
address public owner;
address public guardian;

struct SessionKey {
    uint48 validUntil;
    uint8 policyId;
    bool active;
}

mapping(bytes32 => SessionKey) public sessionKeys;
```

**Key Functions:**
```solidity
function enableSessionKey(
    bytes32 pubKeyHash,
    uint48 validUntil,
    uint8 policyId,
    bytes calldata guardianSignature
) external;

function disableSessionKey(bytes32 pubKeyHash) external;

function _validateUserOpSignature(
    PackedUserOperation calldata userOp
) internal override returns (uint256 validationData);
```

**Session Key Validation:**
```solidity
1. Extract pubkey from signature
2. Hash pubkey → pubKeyHash
3. Check sessionKeys[pubKeyHash].active
4. Check block.timestamp <= validUntil
5. Validate signature with session key
6. Enforce policy constraints
```

---

#### 2.6 TapKitAccountFactory.sol

**Purpose:** Deploy smart accounts deterministically.

**Key Functions:**
```solidity
function createAccount(
    address owner,
    address guardian,
    uint256 salt
) external returns (address account);

function getAddress(
    address owner,
    address guardian,
    uint256 salt
) external view returns (address);
```

**CREATE2 Address Calculation:**
```solidity
address = CREATE2(
    deployer: factory,
    salt: keccak256(abi.encode(owner, guardian, salt)),
    initCode: abi.encodePacked(
        type(TapKitAccount).creationCode,
        abi.encode(entryPoint, owner, guardian)
    )
);
```

---

#### 2.7 TapKitPaymaster.sol

**Purpose:** Sponsor gas for valid PYUSD payments.

**State:**
```solidity
address public immutable CHECKOUT;
MerchantRegistry public immutable REGISTRY;
IERC20 public immutable PYUSD;
uint256 public maxAmountPerTx;
```

**Validation Logic:**
```solidity
function validatePaymasterUserOp(
    PackedUserOperation calldata userOp,
    bytes32,
    uint256
) external override returns (bytes memory context, uint256 validationData) {
    // 1. Extract target from callData
    // 2. Verify target == CHECKOUT
    // 3. Decode InvoiceTuple from callData
    // 4. Validate:
    //    - merchant is active
    //    - amount > 0 && amount <= maxAmountPerTx
    //    - expiry > now
    //    - token is PYUSD
    // 5. Return success or revert
}
```

**Policy Checks:**
- ✅ Target must be Checkout contract
- ✅ Function must be `settle(...)`
- ✅ Merchant must be active
- ✅ Invoice not expired
- ✅ Amount within limits
- ✅ Token must be PYUSD

---

## 3. Off-Chain Services

### 3.1 Indexer

**Tech:** Fastify + Prisma + Viem

**Event Watchers:**

```typescript
// Watch all configured chains
for (const chain of chains) {
  const client = createPublicClient({
    chain: toViemChain(chain),
    transport: http(chain.rpcUrl),
  });
  
  // Watch MerchantRegistry events
  client.watchEvent({
    address: chain.contracts.merchantRegistry,
    events: ['MerchantRegistered', 'MerchantStatus', 'MerchantUpdated'],
    onLogs: async (logs) => {
      for (const log of logs) {
        await persistMerchant(log);
      }
    },
  });
  
  // Watch Invoice events
  client.watchEvent({
    address: chain.contracts.invoice,
    events: ['InvoiceCreated', 'InvoiceCancelled'],
    onLogs: async (logs) => {
      for (const log of logs) {
        await persistInvoice(log);
      }
    },
  });
  
  // Watch Checkout events (Settled)
  client.watchEvent({
    address: chain.contracts.checkout,
    events: ['Settled'],
    onLogs: async (logs) => {
      for (const log of logs) {
        await persistReceipt(log);
      }
    },
  });
  
  // Watch BridgeEscrow events
  client.watchEvent({
    address: chain.contracts.bridgeEscrow,
    events: ['Locked', 'Released'],
    onLogs: async (logs) => {
      for (const log of logs) {
        await persistBridge(log);
      }
    },
  });
}
```

**Persistence Logic:**

```typescript
async function persistInvoice(log: Log) {
  const { merchant, amount, expiry, memoHash, invoiceId } = decodeEventLog({
    abi: InvoiceABI,
    data: log.data,
    topics: log.topics,
  });
  
  await prisma.invoice.upsert({
    where: { id: invoiceId },
    create: {
      id: invoiceId,
      merchant,
      amount: amount.toString(),
      chainId: log.chainId,
      expiry: Number(expiry),
      memoHash,
      status: 'unpaid',
    },
    update: {},
  });
}
```

---

### 3.2 Relayer

**Tech:** Fastify + Viem + HMAC Auth

**Key Endpoints:**

#### POST /session/attest

**Purpose:** Sign session key attestation for smart account.

```typescript
app.post('/session/attest', async (req, reply) => {
  const { userId, smartAccount, sessionPubKey, validUntil, policyId } = req.body;
  
  // 1. Verify user owns this account (check passkey session)
  const session = await verifyUserSession(req.headers.authorization);
  if (session.userId !== userId) throw new Error('Unauthorized');
  
  // 2. Verify smart account belongs to user
  const expectedAccount = factory.getAddress(session.owner, guardian, 0);
  if (expectedAccount !== smartAccount) throw new Error('Invalid account');
  
  // 3. Sign attestation with guardian key
  const message = solidityPackedKeccak256(
    ['address', 'bytes32', 'uint48', 'uint8'],
    [smartAccount, keccak256(sessionPubKey), validUntil, policyId]
  );
  
  const signature = await guardianWallet.signMessage(message);
  
  return { attestation: { smartAccount, sessionPubKey, validUntil, policyId }, signature };
});
```

#### POST /relay/settle

**Purpose:** Gasless fallback for settlement.

```typescript
app.post('/relay/settle', async (req, reply) => {
  // 1. Verify HMAC
  verifyHMAC(req.headers['x-hmac'], req.body);
  
  // 2. Validate invoice
  const { invoiceTuple, payer, permit2Data } = req.body;
  const invoice = await indexer.getInvoice(invoiceTuple.invoiceId);
  if (!invoice || invoice.status !== 'unpaid') throw new Error('Invalid invoice');
  
  // 3. Build UserOp
  const userOp = {
    sender: payer,
    nonce: await entryPoint.getNonce(payer, 0),
    callData: encodeFunctionData({
      abi: CheckoutABI,
      functionName: 'settle',
      args: [invoiceTuple, payer, permit2Data],
    }),
    paymasterAndData: encodePaymasterData(paymaster),
    // ... gas limits
  };
  
  // 4. Submit to bundler
  const txHash = await bundler.sendUserOperation(userOp);
  
  return { txHash };
});
```

#### Bridge Coordinator

```typescript
// Monitor BridgeEscrow.Locked events
client.watchEvent({
  address: bridgeEscrow,
  event: 'Locked',
  onLogs: async (logs) => {
    for (const log of logs) {
      const { ref, payer, amount } = log.args;
      
      // Update DB
      await prisma.bridge.update({
        where: { ref },
        data: { status: 'locked', lockTxHash: log.transactionHash },
      });
      
      // Get destination chain
      const bridge = await prisma.bridge.findUnique({ where: { ref } });
      const dstChain = chains.find(c => c.chainId === bridge.dstChainId);
      
      // Call release on destination
      const dstEscrow = getBridgeEscrow(dstChain);
      const tx = await dstEscrow.write.release([ref, payer, amount], {
        account: relayerWallet,
      });
      
      // Update DB
      await prisma.bridge.update({
        where: { ref },
        data: { status: 'released', releaseTxHash: tx },
      });
    }
  },
});
```

---

### 3.3 Cost Engine

**Tech:** Node.js + Viem

**Quote Calculation:**

```typescript
async function updateQuotes() {
  for (const chain of chains) {
    // 1. Get current gas price
    const feeData = await client.estimateFees();
    const baseFee = feeData.maxFeePerGas;
    
    // 2. Estimate gas for settle call
    const gasEstimate = await client.estimateContractGas({
      address: chain.contracts.checkout,
      abi: CheckoutABI,
      functionName: 'settle',
      args: [mockInvoiceTuple, mockPayer, '0x'],
    });
    
    // 3. Calculate cost in USD
    const ethPriceUsd = Number(process.env.ETH_USD_PRICE);
    const gasCostEth = (gasEstimate * baseFee) / 1e18;
    const gasSponsorCostUsd = gasCostEth * ethPriceUsd;
    
    // 4. Calculate bridge cost (if applicable)
    const inventoryFeeBps = Number(process.env.INVENTORY_FEE_BPS);
    const bridgeCostUsd = (amount * inventoryFeeBps / 10000) * 1; // PYUSD ~= $1
    
    // 5. Estimate latency
    const estLatencyMs = chain.name.includes('Arbitrum') ? 2000 : 12000;
    
    // 6. Store quote
    await prisma.costQuote.upsert({
      where: { chainId: chain.chainId },
      create: {
        chainId: chain.chainId,
        gasSponsorCostUsd,
        estLatencyMs,
        bridgeCostUsd,
        totalCostUsd: gasSponsorCostUsd + bridgeCostUsd,
        updatedAt: new Date(),
      },
      update: {
        gasSponsorCostUsd,
        estLatencyMs,
        bridgeCostUsd,
        totalCostUsd: gasSponsorCostUsd + bridgeCostUsd,
        updatedAt: new Date(),
      },
    });
  }
}

// Run every 15 seconds
setInterval(updateQuotes, 15000);
```

---

## 4. Frontend Architecture

### Technology Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **State:** React hooks + Context
- **Blockchain:** Viem + Wagmi
- **Auth:** WebAuthn (native API)

### Key Libraries

```typescript
// lib/passkey.ts - WebAuthn implementation
// lib/sessionKey.ts - Ephemeral key generation
// lib/smartAccount.ts - Account derivation
// lib/bundler.ts - UserOp submission
```

### Page Structure

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Landing page
├── merchant/
│   ├── page.tsx            # Dashboard
│   ├── invoices/
│   │   └── new/
│   │       └── page.tsx    # Create invoice
│   └── onboard/
│       └── page.tsx        # Merchant onboarding
├── checkout/
│   └── [invoiceId]/
│       └── page.tsx        # Buyer checkout flow
├── receipt/
│   └── [receiptId]/
│       └── page.tsx        # Receipt display
├── bridge/
│   └── [ref]/
│       └── page.tsx        # Bridge status
└── diagnostics/
    └── page.tsx            # System diagnostics
```

---

## 5. Authentication Flow

### Sequence Diagram

```
Buyer                 Frontend              Relayer              Blockchain
  │                      │                     │                      │
  │  1. Visit /checkout  │                     │                      │
  │─────────────────────>│                     │                      │
  │                      │                     │                      │
  │  2. Click "Login"    │                     │                      │
  │─────────────────────>│                     │                      │
  │                      │                     │                      │
  │  3. WebAuthn prompt  │                     │                      │
  │<─────────────────────│                     │                      │
  │                      │                     │                      │
  │  4. Biometric auth   │                     │                      │
  │─────────────────────>│                     │                      │
  │                      │                     │                      │
  │                      │  5. Verify assertion│                      │
  │                      │────────────────────>│                      │
  │                      │                     │                      │
  │                      │  6. JWT session     │                      │
  │                      │<────────────────────│                      │
  │                      │                     │                      │
  │                      │  7. Generate session│                      │
  │                      │     key (secp256k1) │                      │
  │                      │                     │                      │
  │                      │  8. Request attest  │                      │
  │                      │────────────────────>│                      │
  │                      │                     │                      │
  │                      │  9. Sign attestation│                      │
  │                      │<────────────────────│                      │
  │                      │                     │                      │
  │                      │ 10. enableSessionKey│                      │
  │                      │────────────────────────────────────────────>│
  │                      │                     │                      │
  │  11. Authenticated   │                     │                      │
  │<─────────────────────│                     │                      │
```

### Implementation

**Step 1-4: Passkey Authentication**

```typescript
// lib/passkey.ts
export async function authenticatePasskey(credentialId: string) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [{
        type: 'public-key',
        id: base64ToBuffer(credentialId),
      }],
      userVerification: 'required',
    },
  });
  
  return assertion;
}
```

**Step 5-6: Server-Side Validation**

```typescript
// relayer: POST /auth/verify
export async function verifyAssertion(assertion: AuthenticatorAssertionResponse) {
  // 1. Verify signature
  const verified = crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    assertion.signature,
    clientDataHash
  );
  
  if (!verified) throw new Error('Invalid signature');
  
  // 2. Generate JWT
  const token = jwt.sign(
    { userId, credentialId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  return { token };
}
```

**Step 7-9: Session Key Setup**

```typescript
// lib/sessionKey.ts
export function generateSessionKey() {
  const privateKey = generatePrivateKey();
  const publicKey = privateKeyToAccount(privateKey).address;
  
  // Store in sessionStorage with TTL
  sessionStorage.setItem('pypay_session_key', JSON.stringify({
    privateKey,
    publicKey,
    validUntil: Date.now() + 30 * 60 * 1000, // 30 minutes
  }));
  
  return { privateKey, publicKey };
}

export async function enableSessionKey(account: Address, sessionKey: Hex) {
  // Get guardian attestation
  const { attestation, signature } = await fetch('/api/session/attest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getJWT()}` },
    body: JSON.stringify({
      userId: getUserId(),
      smartAccount: account,
      sessionPubKey: sessionKey,
      validUntil: Math.floor(Date.now() / 1000) + 30 * 60,
      policyId: 1,
    }),
  }).then(r => r.json());
  
  // Build UserOp to enable session key
  const userOp = {
    sender: account,
    callData: encodeFunctionData({
      abi: AccountABI,
      functionName: 'enableSessionKey',
      args: [keccak256(sessionKey), attestation.validUntil, attestation.policyId, signature],
    }),
    // ... rest of UserOp
  };
  
  // Submit via bundler
  const txHash = await bundler.sendUserOperation(userOp);
  await waitForTransaction(txHash);
}
```

---

## 6. Payment Flow

### Sequence Diagram

```
Buyer         Frontend        Indexer       Relayer      Paymaster    Checkout     Merchant
  │               │               │             │             │            │            │
  │ 1. Load       │               │             │             │            │            │
  │   invoice     │  2. GET       │             │             │            │            │
  │──────────────>│──────────────>│             │             │            │            │
  │               │  3. Invoice   │             │             │            │            │
  │               │<──────────────│             │             │            │            │
  │               │               │             │             │            │            │
  │ 4. Select     │  5. GET quotes│             │             │            │            │
  │   cheapest    │──────────────>│             │             │            │            │
  │   chain       │  6. Quotes    │             │             │            │            │
  │──────────────>│<──────────────│             │             │            │            │
  │               │               │             │             │            │            │
  │ 7. Click Pay  │               │             │             │            │            │
  │──────────────>│               │             │             │            │            │
  │               │  8. Build     │             │             │            │            │
  │               │     UserOp    │             │             │            │            │
  │               │               │             │             │            │            │
  │               │  9. Sign with │             │             │            │            │
  │               │     session   │             │             │            │            │
  │               │     key       │             │             │            │            │
  │               │               │             │             │            │            │
  │               │               │10. Submit   │             │            │            │
  │               │               │   UserOp    │             │            │            │
  │               │               │────────────>│             │            │            │
  │               │               │             │11. Validate │            │            │
  │               │               │             │   invoice   │            │            │
  │               │               │             │────────────>│            │            │
  │               │               │             │12. Sponsor  │            │            │
  │               │               │             │<────────────│            │            │
  │               │               │             │             │            │            │
  │               │               │             │13. Execute  │            │            │
  │               │               │             │   settle    │            │            │
  │               │               │             │────────────────────────>│            │
  │               │               │             │             │            │14. Transfer│
  │               │               │             │             │            │   PYUSD    │
  │               │               │             │             │            │───────────>│
  │               │               │             │             │            │            │
  │               │               │             │15. Receipt  │            │            │
  │               │<──────────────────────────────────────────────────────│            │
  │ 16. Success!  │               │             │             │            │            │
  │<──────────────│               │             │             │            │            │
```

---

## 7. Bridge Flow

### Sequence Diagram

```
Buyer      Frontend      Relayer     Escrow(Src)    Escrow(Dst)    Merchant
  │            │            │              │              │             │
  │ 1. Need    │            │              │              │             │
  │   bridge   │            │              │              │             │
  │───────────>│            │              │              │             │
  │            │ 2. Quote   │              │              │             │
  │            │───────────>│              │              │             │
  │            │ 3. Cost +  │              │              │             │
  │            │    ref     │              │              │             │
  │            │<───────────│              │              │             │
  │            │            │              │              │             │
  │ 4. Approve │            │              │              │             │
  │───────────>│            │              │              │             │
  │            │ 5. lock()  │              │              │             │
  │            │────────────────────────────>│             │             │
  │            │            │              │              │             │
  │            │            │ 6. Watch     │              │             │
  │            │            │<──────────────Locked event  │             │
  │            │            │              │              │             │
  │            │            │ 7. release() │              │             │
  │            │            │──────────────────────────────>│            │
  │            │            │              │              │             │
  │            │ 8. Poll    │              │              │             │
  │            │   status   │              │              │             │
  │            │───────────>│              │              │             │
  │            │ 9. Released│              │              │             │
  │            │<───────────│              │              │             │
  │            │            │              │              │             │
  │10. Continue│            │              │              │             │
  │   payment  │            │              │              │             │
  │───────────>│─────────────────────────────────────settle────────────>│
```

---

## 8. Cost Calculation

### Formula

```typescript
// Per chain
gasSponsorCost = gasUnits * gasPrice * ethPriceUsd
bridgeCost = (needsBridge ? amount * inventoryFeeBps / 10000 : 0)
totalCost = gasSponsorCost + bridgeCost

// Example
Chain: Arbitrum Sepolia
Gas: 200,000 units
Gas Price: 0.1 gwei
ETH/USD: $2,000
Inventory Fee: 30 bps (0.3%)
Amount: 100 PYUSD

gasSponsorCost = 200000 * 0.1e-9 * 2000 = $0.04
bridgeCost = 100 * 0.003 = $0.30
totalCost = $0.34
```

### Cheapest-Chain Selection

```typescript
const options = chains.map(chain => {
  const quote = quotes.find(q => q.chainId === chain.chainId);
  const balance = balances.get(chain.chainId);
  const needsBridge = balance < invoice.amount;
  
  return {
    chainId: chain.chainId,
    name: chain.name,
    gasCost: quote.gasSponsorCostUsd,
    bridgeCost: needsBridge ? quote.bridgeCostUsd : 0,
    latency: quote.estLatencyMs,
    totalCost: quote.gasSponsorCostUsd + (needsBridge ? quote.bridgeCostUsd : 0),
    needsBridge,
  };
});

// Sort by total cost ascending
options.sort((a, b) => a.totalCost - b.totalCost);

// Default select cheapest
const recommended = options[0];
```

---

## 9. API Reference

### Indexer APIs

#### GET /health

**Response:**
```json
{
  "status": "ok",
  "chains": [
    { "chainId": 421614, "connected": true, "blockNumber": 12345678 },
    { "chainId": 11155111, "connected": true, "blockNumber": 9876543 }
  ]
}
```

#### GET /invoice/:id

**Response:**
```json
{
  "id": "0xabc...",
  "merchant": "0x123...",
  "amount": "100000000",
  "chainId": 421614,
  "expiry": 1704067200,
  "memoHash": "0xdef...",
  "status": "unpaid",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### GET /merchant/:addr/invoices

**Query Params:**
- `chainId` (optional) - Filter by chain
- `status` (optional) - `paid` | `unpaid`

**Response:**
```json
{
  "invoices": [
    {
      "id": "0xabc...",
      "amount": "100000000",
      "status": "paid",
      "createdAt": "2024-01-01T00:00:00Z",
      "paidAt": "2024-01-01T00:05:00Z"
    }
  ],
  "total": 1
}
```

#### GET /merchant/:addr/receipts.csv

**Response:** CSV file
```csv
Invoice ID,Amount,Payer,Chain,Tx Hash,Timestamp
0xabc...,100.00,0x456...,421614,0x789...,2024-01-01 00:05:00
```

#### GET /costs/quotes

**Response:**
```json
{
  "quotes": [
    {
      "chainId": 421614,
      "gasSponsorCostUsd": 0.04,
      "estLatencyMs": 2000,
      "bridgeCostUsd": 0.30,
      "totalCostUsd": 0.34,
      "updatedAt": "2024-01-01T00:00:00Z"
    },
    {
      "chainId": 11155111,
      "gasSponsorCostUsd": 0.15,
      "estLatencyMs": 12000,
      "bridgeCostUsd": 0.30,
      "totalCostUsd": 0.45,
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Relayer APIs

#### POST /session/attest

**Headers:**
- `Authorization: Bearer <JWT>`

**Body:**
```json
{
  "userId": "user_123",
  "smartAccount": "0x...",
  "sessionPubKey": "0x...",
  "validUntil": 1704067200,
  "policyId": 1
}
```

**Response:**
```json
{
  "attestation": {
    "smartAccount": "0x...",
    "sessionPubKey": "0x...",
    "validUntil": 1704067200,
    "policyId": 1
  },
  "signature": "0x..."
}
```

#### POST /relay/settle

**Headers:**
- `X-HMAC: <signature>`

**Body:**
```json
{
  "invoiceTuple": {
    "invoiceId": "0x...",
    "merchant": "0x...",
    "amount": "100000000",
    "expiry": 1704067200,
    "chainId": 421614,
    "memoHash": "0x..."
  },
  "payer": "0x...",
  "permit2Data": "0x..."
}
```

**Response:**
```json
{
  "txHash": "0x...",
  "userOpHash": "0x..."
}
```

#### POST /bridge/quote

**Body:**
```json
{
  "srcChainId": 421614,
  "dstChainId": 11155111,
  "amount": "100000000"
}
```

**Response:**
```json
{
  "ref": "0xbridge...",
  "bridgeCostUsd": 0.30,
  "etaMs": 120000,
  "inventory": {
    "available": "5000000000",
    "sufficient": true
  }
}
```

#### GET /bridge/:ref

**Response:**
```json
{
  "ref": "0xbridge...",
  "status": "released",
  "srcChainId": 421614,
  "dstChainId": 11155111,
  "payer": "0x...",
  "amount": "100000000",
  "lockTxHash": "0x...",
  "releaseTxHash": "0x...",
  "createdAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:02:00Z"
}
```

---

## 10. Database Schema

```prisma
model Merchant {
  address       String    @id
  payoutAddress String
  feeBps        Int
  active        Boolean
  chainId       Int
  createdAt     DateTime  @default(now())
  invoices      Invoice[]
  
  @@index([chainId])
}

model Invoice {
  id          String    @id
  merchant    String
  amount      String
  chainId     Int
  expiry      Int
  memoHash    String
  status      String    // 'unpaid' | 'paid' | 'cancelled'
  createdAt   DateTime  @default(now())
  paidAt      DateTime?
  txHash      String?
  receipts    Receipt[]
  merchantRel Merchant  @relation(fields: [merchant, chainId], references: [address, chainId])
  
  @@index([merchant, chainId])
  @@index([status])
}

model Receipt {
  id        String   @id
  invoiceId String
  payer     String
  merchant  String
  amount    String
  chainId   Int
  txHash    String
  blockTime Int
  createdAt DateTime @default(now())
  invoice   Invoice  @relation(fields: [invoiceId], references: [id])
  
  @@index([merchant, chainId])
  @@index([payer])
}

model Bridge {
  ref           String   @id
  srcChainId    Int
  dstChainId    Int
  payer         String
  amount        String
  status        String   // 'pending' | 'locked' | 'released' | 'failed'
  lockTxHash    String?
  releaseTxHash String?
  createdAt     DateTime @default(now())
  completedAt   DateTime?
  
  @@index([payer])
  @@index([status])
}

model CostQuote {
  chainId           Int      @id
  gasSponsorCostUsd Float
  estLatencyMs      Int
  bridgeCostUsd     Float
  totalCostUsd      Float
  updatedAt         DateTime @default(now())
}

model User {
  id            String   @id @default(uuid())
  credentialId  String   @unique
  publicKey     Bytes
  smartAccount  String?
  createdAt     DateTime @default(now())
  lastLoginAt   DateTime @default(now())
}
```

---

## 11. Security Model

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Phishing** | Passkeys are domain-bound (WebAuthn) |
| **Replay attacks** | Session keys time-bound, nonce tracking |
| **Unauthorized spending** | Policy validation in paymaster |
| **Front-running** | UserOps private mempools (bundlers) |
| **Reentrancy** | Guards on all state changes |
| **Bridge inventory drain** | Owner-only release, balance checks |
| **DoS attacks** | Rate limiting, HMAC auth |
| **Invalid invoices** | Multi-layer validation (paymaster, checkout) |

### Access Control

```
Contract Owner (Deployer)
  ├── Can register/deactivate merchants
  ├── Can update merchant fees
  ├── Can pause contracts (emergency)
  └── Can withdraw paymaster stake

Merchant
  ├── Can create invoices
  ├── Can cancel own invoices
  └── Receives payments to payout address

Guardian (Relayer Server)
  ├── Can sign session attestations
  ├── Cannot move user funds directly
  └── Validates WebAuthn assertions

Session Key (User's Browser)
  ├── Time-bounded (30 min default)
  ├── Policy-restricted (Checkout only, PYUSD only)
  ├── Can be disabled by user/guardian
  └── Cannot execute arbitrary calls

Paymaster
  ├── Validates invoice constraints
  ├── Sponsors gas only for valid payments
  └── Cannot be drained by malicious UserOps
```

### Best Practices Implemented

- ✅ **Fail-fast validation** - Check all constraints early
- ✅ **Minimal trust** - Guardian can't move funds
- ✅ **Defense in depth** - Multiple validation layers
- ✅ **Audit trail** - All events indexed
- ✅ **Rate limiting** - Per-user and per-merchant
- ✅ **Secure defaults** - Short session TTL, max amounts
- ✅ **Monitoring** - Diagnostics page, structured logs

---

## 12. Configuration

### Environment Variables

**Required:**
```env
# Chain RPCs
ARBITRUM_SEPOLIA_RPC=
ETHEREUM_SEPOLIA_RPC=

# Token addresses
PYUSD_ARBSEPOLIA=
PYUSD_SEPOLIA=

# Private keys
DEPLOYER_PRIVATE_KEY=
RELAYER_PRIVATE_KEY=
GUARDIAN_PRIVATE_KEY=

# Contract addresses (after deployment)
REGISTRY_ARBSEPOLIA=
CHECKOUT_ARBSEPOLIA=
PAYMASTER_ARBSEPOLIA=
# ... etc for all contracts

# Database
DATABASE_URL=

# Relayer
HMAC_SECRET=
```

**Optional:**
```env
# Ports
INDEXER_PORT=3001
RELAYER_PORT=3002
COST_ENGINE_PORT=3003
WEB_PORT=3000

# Cost estimation
ETH_USD_PRICE=2000
INVENTORY_FEE_BPS=30

# Bundler (use public if not set)
BUNDLER_RPC_ARBSEPOLIA=
BUNDLER_RPC_SEPOLIA=

# Logging
LOG_LEVEL=info
```

### chains.config.json

```json
{
  "chains": [
    {
      "name": "Arbitrum Sepolia",
      "chainId": 421614,
      "rpcUrlEnv": "ARBITRUM_SEPOLIA_RPC",
      "pyusdAddressEnv": "PYUSD_ARBSEPOLIA",
      "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      "entryPointAddress": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      "contracts": {
        "merchantRegistry": "${REGISTRY_ARBSEPOLIA}",
        "invoice": "${INVOICE_ARBSEPOLIA}",
        "checkout": "${CHECKOUT_ARBSEPOLIA}",
        "paymaster": "${PAYMASTER_ARBSEPOLIA}",
        "bridgeEscrow": "${BRIDGE_ESCROW_ARBSEPOLIA}",
        "accountFactory": "${ACCOUNT_FACTORY_ARBSEPOLIA}"
      },
      "bundlerRpcEnv": "BUNDLER_RPC_ARBSEPOLIA",
      "explorerUrl": "https://sepolia.arbiscan.io"
    },
    {
      "name": "Ethereum Sepolia",
      "chainId": 11155111,
      "rpcUrlEnv": "ETHEREUM_SEPOLIA_RPC",
      "pyusdAddressEnv": "PYUSD_SEPOLIA",
      "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      "entryPointAddress": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      "contracts": {
        "merchantRegistry": "${REGISTRY_SEPOLIA}",
        "invoice": "${INVOICE_SEPOLIA}",
        "checkout": "${CHECKOUT_SEPOLIA}",
        "paymaster": "${PAYMASTER_SEPOLIA}",
        "bridgeEscrow": "${BRIDGE_ESCROW_SEPOLIA}",
        "accountFactory": "${ACCOUNT_FACTORY_SEPOLIA}"
      },
      "bundlerRpcEnv": "BUNDLER_RPC_SEPOLIA",
      "explorerUrl": "https://sepolia.etherscan.io"
    }
  ]
}
```

---

## 📚 Additional Resources

- **ERC-4337 Spec:** https://eips.ethereum.org/EIPS/eip-4337
- **WebAuthn Guide:** https://webauthn.guide/
- **Permit2 Docs:** https://docs.uniswap.org/contracts/permit2/overview
- **Foundry Book:** https://book.getfoundry.sh/
- **Viem Docs:** https://viem.sh/

---

**🎉 You now have complete technical knowledge of the PyPay system!**

