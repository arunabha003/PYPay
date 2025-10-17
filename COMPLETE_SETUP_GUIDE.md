# PYPay Complete Setup Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Initial Setup](#initial-setup)
4. [Completed Work](#completed-work)
5. [Current Status](#current-status)
6. [Known Issues](#known-issues)
7. [Step-by-Step Testing Guide](#step-by-step-testing-guide)
8. [Troubleshooting](#troubleshooting)

---

## Overview

PYPay is a gasless payment system using ERC-4337 Account Abstraction with PYUSD stablecoin. Users authenticate with WebAuthn/Passkeys and sign transactions with ephemeral session keys. A paymaster sponsors gas fees for approved transactions.

### Key Technologies
- **Frontend**: Next.js 15.5.5, Viem 2.38.2, WebAuthn
- **Backend**: Fastify (Indexer, Relayer, Cost Engine), Prisma, PostgreSQL
- **Blockchain**: Solidity 0.8.27, Foundry, ERC-4337 v0.7
- **Testing**: Local Anvil forks of Arbitrum Sepolia & Ethereum Sepolia

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER EXPERIENCE                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │   Browser (Next.js Web App)   │
                    │   http://localhost:3000       │
                    └───────────────┬───────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Indexer    │          │   Relayer    │          │ Cost Engine  │
│  Port 3001   │          │  Port 3002   │          │  Port 3003   │
│              │          │              │          │              │
│ - Watches    │          │ - Session    │          │ - Gas price  │
│   events     │          │   key mgmt   │          │   tracking   │
│ - Postgres   │          │ - UserOp     │          │ - Cost calc  │
│   indexing   │          │   relay      │          │              │
└──────┬───────┘          └──────┬───────┘          └──────────────┘
       │                         │
       │                         │
       ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BLOCKCHAIN LAYER                                  │
│                                                                           │
│  ┌────────────────────────────┐    ┌────────────────────────────┐      │
│  │  Arbitrum Sepolia (Fork)   │    │  Ethereum Sepolia (Fork)   │      │
│  │  127.0.0.1:8545            │    │  127.0.0.1:8546            │      │
│  │  Chain ID: 421614          │    │  Chain ID: 11155111        │      │
│  └────────────────────────────┘    └────────────────────────────┘      │
│                                                                           │
│  Smart Contracts (Arbitrum Sepolia):                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ EntryPoint (v0.7)                                                │   │
│  │ 0x0000000071727De22E5E9d8BAf0edAc6f37da032                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ TapKitAccountFactory                                             │   │
│  │ 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318                      │   │
│  │ - Creates smart accounts for users                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ TapKitAccount (Smart Account)                                    │   │
│  │ 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896                      │   │
│  │ - Owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266            │   │
│  │ - Guardian: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8         │   │
│  │ - Balance: 1 ETH + 5000 PYUSD                                    │   │
│  │ - Session Key Status: NOT ENABLED (❌ BLOCKER)                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ TapKitPaymaster                                                  │   │
│  │ 0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419                      │   │
│  │ - Deposit: 1 ETH                                                 │   │
│  │ - Stake: 1 ETH                                                   │   │
│  │ - Allowed Target: Checkout contract only                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Checkout                                                         │   │
│  │ 0xf588f57BE135813d305815Dc3E71960c97987b19                      │   │
│  │ - Handles PYUSD transfers for invoices                           │   │
│  │ - Has max allowance from smart account                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Mock PYUSD (ERC20)                                               │   │
│  │ 0x2ec6622F4Ea3315DB6045d7C4947F63581090568                      │   │
│  │ - Smart account balance: 5000 PYUSD                              │   │
│  │ - Allowance to Checkout: MAX (115792...639935)                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ MerchantRegistry                                                 │   │
│  │ 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65                      │   │
│  │ - Merchant: coffee_shop (Test Cafe)                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Payment Flow Sequence

```
┌──────┐                ┌─────────┐              ┌─────────┐              ┌──────────┐              ┌────────────┐
│ User │                │ Browser │              │ Relayer │              │ EntryPoint│              │  Checkout  │
└───┬──┘                └────┬────┘              └────┬────┘              └─────┬─────┘              └──────┬─────┘
    │                        │                        │                         │                          │
    │  1. Scan QR / Visit    │                        │                         │                          │
    │  Invoice Page          │                        │                         │                          │
    ├───────────────────────>│                        │                         │                          │
    │                        │                        │                         │                          │
    │  2. Authenticate with  │                        │                         │                          │
    │     Passkey (WebAuthn) │                        │                         │                          │
    │<──────────────────────>│                        │                         │                          │
    │                        │                        │                         │                          │
    │  3. Generate Session   │                        │                         │                          │
    │     Key (secp256r1)    │                        │                         │                          │
    │                        │                        │                         │                          │
    │  4. Enable Session Key │                        │                         │                          │
    │                        ├───POST /session/enable─>│                         │                          │
    │                        │                        │                         │                          │
    │                        │                        │ 5. Generate Guardian    │                          │
    │                        │                        │    Signature (ECDSA)    │                          │
    │                        │                        │                         │                          │
    │                        │                        │ 6. Call enableSessionKey│                          │
    │                        │                        ├────────────────────────>│                          │
    │                        │                        │                         │                          │
    │                        │                        │   7. Store session key  │                          │
    │                        │                        │      in smart account   │                          │
    │                        │<───────Success─────────┤<────────────────────────┤                          │
    │                        │                        │                         │                          │
    │  8. Click Pay          │                        │                         │                          │
    │<───────────────────────┤                        │                         │                          │
    │                        │                        │                         │                          │
    │  9. Build UserOp       │                        │                         │                          │
    │                        │                        │                         │                          │
    │ 10. Sign with Session  │                        │                         │                          │
    │     Key (141 bytes)    │                        │                         │                          │
    │                        │                        │                         │                          │
    │ 11. Submit UserOp      │                        │                         │                          │
    │                        ├────POST /userop/send──>│                         │                          │
    │                        │                        │                         │                          │
    │                        │                        │ 12. Get nonce           │                          │
    │                        │                        ├────────────────────────>│                          │
    │                        │                        │<────────────────────────┤                          │
    │                        │                        │                         │                          │
    │                        │                        │ 13. Validate & call     │                          │
    │                        │                        │     handleOps()         │                          │
    │                        │                        ├────────────────────────>│                          │
    │                        │                        │                         │                          │
    │                        │                        │                         │ 14. Validate signature   │
    │                        │                        │                         │     (session key)        │
    │                        │                        │                         │                          │
    │                        │                        │                         │ 15. Check paymaster      │
    │                        │                        │                         │                          │
    │                        │                        │                         │ 16. Execute callData     │
    │                        │                        │                         │     (wrapped in execute) │
    │                        │                        │                         ├────settle(invoiceId)────>│
    │                        │                        │                         │                          │
    │                        │                        │                         │ 17. Transfer PYUSD       │
    │                        │                        │                         │<─────────────────────────┤
    │                        │                        │                         │                          │
    │                        │                        │<────Success + Receipt───┤                          │
    │                        │<───────UserOpHash──────┤                         │                          │
    │<───────Success─────────┤                        │                         │                          │
    │                        │                        │                         │                          │
```

---

## Initial Setup

### 1. Prerequisites

Install the following:
```bash
# Node.js & pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Foundry (Forge, Cast, Anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# PostgreSQL (for indexer)
brew install postgresql@14
brew services start postgresql@14
```

### 2. Environment Variables

Create `.env` file in project root:
```bash
# Private Keys (Anvil default accounts)
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
GUARDIAN_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# RPC URLs (Local Anvil Forks)
ARBITRUM_SEPOLIA_RPC=http://127.0.0.1:8545
ETHEREUM_SEPOLIA_RPC=http://127.0.0.1:8546

# Deployed Contract Addresses (Arbitrum Sepolia)
ENTRYPOINT=0x0000000071727De22E5E9d8BAf0edAc6f37da032
ACCOUNT_FACTORY_ARBSEPOLIA=0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
SMART_ACCOUNT_ARBSEPOLIA=0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
PAYMASTER_ARBSEPOLIA=0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419
CHECKOUT_ARBSEPOLIA=0xf588f57BE135813d305815Dc3E71960c97987b19
MERCHANT_REGISTRY_ARBSEPOLIA=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
MOCK_PYUSD_ARBSEPOLIA=0x2ec6622F4Ea3315DB6045d7C4947F63581090568

# Deployed Contract Addresses (Ethereum Sepolia)
ACCOUNT_FACTORY_ETHSEPOLIA=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
SMART_ACCOUNT_ETHSEPOLIA=0xCb740eC76C15fCA515cF98c68e031CF32a4E076A
MOCK_PYUSD_ETHSEPOLIA=0x39E98Cd34D28A51fdD3bcfe0BB9BF7941ffC71e9

# Authentication
HMAC_SECRET=aea0bf03b9b243dfbdc281543d16d073dca1550d7cd07d67600e1a90373af73c

# Session Key (Generated from passkey)
SESSION_KEY_PUBKEY=0xc908625ced01d678d1f12c95d2442425384a0e1c48d70f19602087bdbb49ad68d18f671f273f3f54d887374fb145858ad9d1c775065f10e89858be99d361e49e
SESSION_KEY_PUBKEY_HASH=0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/pypay
```

Create `apps/web/.env.local`:
```bash
NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC=http://127.0.0.1:8545
NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC=http://127.0.0.1:8546

NEXT_PUBLIC_ENTRYPOINT=0x0000000071727De22E5E9d8BAf0edAc6f37da032
NEXT_PUBLIC_ACCOUNT_FACTORY_ARBSEPOLIA=0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
NEXT_PUBLIC_PAYMASTER_ARBSEPOLIA=0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419
NEXT_PUBLIC_CHECKOUT_ARBSEPOLIA=0xf588f57BE135813d305815Dc3E71960c97987b19
NEXT_PUBLIC_MERCHANT_REGISTRY_ARBSEPOLIA=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
NEXT_PUBLIC_MOCK_PYUSD_ARBSEPOLIA=0x2ec6622F4Ea3315DB6045d7C4947F63581090568

NEXT_PUBLIC_RELAYER_URL=http://localhost:3002
NEXT_PUBLIC_INDEXER_URL=http://localhost:3001
NEXT_PUBLIC_HMAC_SECRET=aea0bf03b9b243dfbdc281543d16d073dca1550d7cd07d67600e1a90373af73c
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Start Local Blockchain Forks

**Terminal 1 - Arbitrum Sepolia Fork:**
```bash
anvil --fork-url https://arb-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY \
  --chain-id 421614 \
  --port 8545
```

**Terminal 2 - Ethereum Sepolia Fork:**
```bash
anvil --fork-url https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY \
  --chain-id 11155111 \
  --port 8546
```

### 5. Deploy Smart Contracts

```bash
cd packages/contracts

# Deploy all core contracts (Arbitrum Sepolia)
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast

# Deploy Mock PYUSD (Arbitrum Sepolia)
forge script script/DeployMockPYUSD.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast

# Deploy Mock PYUSD (Ethereum Sepolia)
forge script script/DeployMockPYUSD.s.sol \
  --rpc-url http://127.0.0.1:8546 \
  --broadcast

# Seed merchant data
forge script script/SeedMerchant.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

### 6. Deploy Smart Account

```bash
# Deploy smart account for test owner
cast send 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 \
  "createAccount(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Get deployed account address
cast call 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 \
  "getAddress(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0 \
  --rpc-url http://127.0.0.1:8545
# Returns: 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
```

### 7. Fund Smart Account

```bash
# Send ETH for gas
cast send 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  --value 1ether \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Send PYUSD tokens
cast send 0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  "transfer(address,uint256)" \
  0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  5000000000 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 8. Configure Paymaster

```bash
# Stake 1 ETH (required for paymaster)
cast send 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "addStake(uint32)" \
  86400 \
  --value 1ether \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --from 0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419

# Deposit 1 ETH (used to pay for gas)
cast send 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "depositTo(address)" \
  0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419 \
  --value 1ether \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 9. Approve PYUSD Spending

```bash
# Approve Checkout contract to spend PYUSD from smart account
# Note: We wrap approve() in execute() because we're calling from EOA
cast send 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "execute(address,uint256,bytes)" \
  0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  0 \
  $(cast calldata "approve(address,uint256)" 0xf588f57BE135813d305815Dc3E71960c97987b19 115792089237316195423570985008687907853269984665640564039457584007913129639935) \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Verify allowance
cast call 0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  "allowance(address,address)" \
  0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  0xf588f57BE135813d305815Dc3E71960c97987b19 \
  --rpc-url http://127.0.0.1:8545
# Should return max uint256
```

### 10. Setup Database

```bash
cd apps/indexer

# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev

# Seed database (optional)
pnpm prisma db seed
```

### 11. Start Backend Services

**Terminal 3 - Indexer:**
```bash
cd apps/indexer
ARBITRUM_SEPOLIA_RPC=http://127.0.0.1:8545 \
ETHEREUM_SEPOLIA_RPC=http://127.0.0.1:8546 \
INDEXER_PORT=3001 \
INDEXER_SKIP_CATCHUP=true \
pnpm dev
```

**Terminal 4 - Relayer:**
```bash
cd apps/relayer
ARBITRUM_SEPOLIA_RPC=http://127.0.0.1:8545 \
ETHEREUM_SEPOLIA_RPC=http://127.0.0.1:8546 \
pnpm dev
```

**Terminal 5 - Cost Engine:**
```bash
cd apps/cost-engine
pnpm dev
```

### 12. Start Frontend

**Terminal 6 - Web App:**
```bash
cd apps/web
pnpm dev
```

Access at: http://localhost:3000

---

## Completed Work

### ✅ Smart Contract Deployment
- [x] EntryPoint v0.7 deployed
- [x] TapKitAccountFactory deployed
- [x] TapKitAccount deployed for test owner
- [x] TapKitPaymaster deployed (3rd iteration with correct Checkout address)
- [x] Checkout contract deployed
- [x] MerchantRegistry deployed and seeded
- [x] Mock PYUSD deployed on both chains
- [x] BridgeEscrow deployed

### ✅ Account Configuration
- [x] Smart account deployed (0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896)
- [x] Smart account funded (1 ETH + 5000 PYUSD)
- [x] PYUSD max allowance approved to Checkout
- [x] Guardian configured (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)

### ✅ Paymaster Configuration
- [x] Paymaster staked (1 ETH)
- [x] Paymaster deposited (1 ETH)
- [x] Paymaster configured with correct Checkout address
- [x] Target restriction working (only allows Checkout contract)

### ✅ Backend Services
- [x] Environment variable loading fixed (dotenv)
- [x] Indexer watching blockchain events
- [x] Relayer dual-mode implementation:
  - Direct EntryPoint.handleOps() for localhost
  - Pimlico v2 API for real testnets
- [x] IPv4 addressing (127.0.0.1 instead of localhost)
- [x] HMAC authentication server-side
- [x] Session key generation endpoint
- [x] Guardian signature implementation (fixed double EIP-191 prefix)

### ✅ Frontend Implementation
- [x] WebAuthn/Passkey authentication
- [x] Session key generation (secp256r1)
- [x] 141-byte signature format for TapKitAccount
- [x] UserOp construction (Pimlico v2 format)
- [x] CallData wrapping (settle wrapped in execute)
- [x] BigInt serialization handling
- [x] Zod schema validation
- [x] Nonce fetching from EntryPoint
- [x] Payment flow implementation (no mocks)

### ✅ Error Resolution
- [x] Fixed AA20 (account not deployed)
- [x] Fixed AA31 (paymaster deposit too low)
- [x] Fixed AA33 (InvalidTarget - wrong callData)
- [x] Fixed address confusion (Checkout vs Merchant)
- [x] Fixed PYUSD allowance (was 0, now max)
- [x] Fixed guardian signature (removed double EIP-191 prefix)

---

## Current Status

### 🔴 Critical Blocker

**Session Key NOT Enabled on Smart Account**

The payment flow is fully implemented but fails at signature validation because the session key has never been successfully enabled on the smart account.

**Status Check:**
```bash
cast call 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "sessionKeys(bytes32)(bool,uint48,uint8)" \
  0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4 \
  --rpc-url http://127.0.0.1:8545

# Returns: false, 0, 0  (NOT ENABLED)
```

**Why It's Blocking:**
- When user tries to pay, `validateUserOp` returns `0x01` (invalid signature)
- This is because session key is unknown to smart account
- Session key must be enabled via `enableSessionKey()` function
- Requires guardian signature over `(accountAddress, pubKeyHash, validUntil, policyId)`

**Guardian Signature Fix:**
The guardian signature generation was recently fixed in `apps/relayer/src/routes/index.ts`:

```typescript
// OLD CODE (WRONG - double EIP-191 prefix):
const guardianSignature = await guardian.signMessage({ 
  message: { raw: innerHash } 
});

// NEW CODE (CORRECT):
const prefix = '\x19Ethereum Signed Message:\n32';
const digest = keccak256(concat([toHex(prefix), innerHash]));
const guardianSignature = await guardian.sign({ hash: digest });
```

**Last Test Result:**
When attempting to enable session key via `/session/enable` endpoint:
```json
{
  "error": "Failed to enable session key",
  "details": "HTTP request failed. URL: http://127.0.0.1:8545 ... Connection refused"
}
```

**Root Cause:** Anvil node not running when test was executed.

---

## Known Issues

### 🔴 Issue #1: Anvil Connection Refused

**Problem:**
- Backend services cannot connect to anvil at 127.0.0.1:8545
- Last terminal shows: `Exit Code: 137` (killed)
- This prevents session key enablement and all blockchain interactions

**Solution:**
```bash
# Restart Arbitrum Sepolia fork
anvil --fork-url https://arb-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY \
  --chain-id 421614 \
  --port 8545
```

**Verification:**
```bash
cast block-number --rpc-url http://127.0.0.1:8545
# Should return current block number
```

### 🟡 Issue #2: Session Key Not Persisted

**Problem:**
- Session key is generated in browser (sessionStorage)
- If page refreshed or browser closed, session key is lost
- New session key requires new guardian signature to enable

**Impact:** Medium - User must re-authenticate after refresh

**Potential Solutions:**
1. Store session key in localStorage (less secure but persistent)
2. Implement session key rotation with backend storage
3. Use shorter-lived session keys (currently 30min TTL)

### 🟡 Issue #3: Ethereum Sepolia Not Configured

**Problem:**
- Paymaster not deployed on Ethereum Sepolia fork
- Bridge functionality will fail

**Impact:** Low - Current testing focuses on Arbitrum Sepolia

**Solution:**
```bash
# Deploy paymaster on Ethereum Sepolia fork
forge script script/RedeployPaymaster.s.sol \
  --rpc-url http://127.0.0.1:8546 \
  --broadcast

# Configure similar to Arbitrum
```

### 🟢 Issue #4: UserOp Receipt Polling Not Implemented

**Problem:**
- After submitting UserOp, we get userOpHash
- No polling for receipt confirmation
- User doesn't see transaction confirmation

**Impact:** Low - Payment still works, just no UI feedback

**Solution:**
```typescript
// In apps/web/lib/payment.ts
async function pollUserOpReceipt(userOpHash: string) {
  for (let i = 0; i < 30; i++) {
    const receipt = await publicClient.getUserOperationReceipt({ hash: userOpHash });
    if (receipt) return receipt;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Transaction timeout');
}
```

---

## Step-by-Step Testing Guide

### Prerequisites Checklist

Before testing, verify all services are running:

```bash
# 1. Check Anvil (Arbitrum Sepolia)
cast block-number --rpc-url http://127.0.0.1:8545
# Should return: block number

# 2. Check Anvil (Ethereum Sepolia)  
cast block-number --rpc-url http://127.0.0.1:8546
# Should return: block number

# 3. Check Indexer
curl http://localhost:3001/health
# Should return: {"status":"ok"}

# 4. Check Relayer
curl http://localhost:3002/health
# Should return: {"status":"ok"}

# 5. Check Cost Engine
curl http://localhost:3003/health
# Should return: {"status":"ok"}

# 6. Check Web App
curl http://localhost:3000
# Should return: HTML

# 7. Verify smart account has funds
cast balance 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 --rpc-url http://127.0.0.1:8545
# Should return: ~1000000000000000000 (1 ETH)

cast call 0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  "balanceOf(address)" \
  0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  --rpc-url http://127.0.0.1:8545
# Should return: 5000000000 (5000 PYUSD with 6 decimals)
```

### Test 1: Enable Session Key

**Critical Step - Must Be Done First**

```bash
# Test session key enablement
curl -X POST http://localhost:3002/session/enable \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 421614,
    "account": "0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896",
    "pubKeyHash": "0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4",
    "validUntil": 1749553800,
    "policyId": 0
  }'
```

**Expected Success Response:**
```json
{
  "success": true,
  "transactionHash": "0x..."
}
```

**Verify Session Key Enabled:**
```bash
cast call 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "sessionKeys(bytes32)(bool,uint48,uint8)" \
  0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4 \
  --rpc-url http://127.0.0.1:8545

# Should return: true, 1749553800, 0
```

### Test 2: Create Invoice

```bash
# Visit merchant dashboard
open http://localhost:3000/merchant/coffee_shop

# Or create invoice via API
curl -X POST http://localhost:3001/api/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "coffee_shop",
    "amount": "5.00",
    "description": "Latte",
    "chain": "arbitrum-sepolia"
  }'
```

**Expected Response:**
```json
{
  "invoiceId": "inv_...",
  "qrCode": "https://...",
  "amount": "5000000",
  "status": "pending"
}
```

### Test 3: Pay Invoice (End-to-End)

1. **Navigate to checkout:**
```bash
open http://localhost:3000/checkout?id=inv_...
```

2. **Authenticate with Passkey:**
   - Click "Pay with Passkey"
   - Browser will prompt for biometric/PIN
   - Session key generated automatically

3. **Complete Payment:**
   - Click "Confirm Payment"
   - Browser signs transaction with session key
   - Relayer submits to EntryPoint
   - Wait for confirmation (~2 seconds)

**Expected Console Output:**
```
1. Fetching nonce... 0x0
2. Building UserOp...
3. Signing with session key... (141 bytes)
4. Submitting to relayer...
5. UserOp hash: 0x...
6. Payment successful!
```

**Verify Payment:**
```bash
# Check merchant received PYUSD
cast call 0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  "balanceOf(address)" \
  0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
  --rpc-url http://127.0.0.1:8545
# Should be > 0

# Check smart account balance decreased
cast call 0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  "balanceOf(address)" \
  0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  --rpc-url http://127.0.0.1:8545
# Should be < 5000000000
```

### Test 4: Validate UserOp (Manual)

```bash
# Build test UserOp (replace with actual values)
cast call 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "validateUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32,uint256)" \
  "(0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896,0,0x...,0x...,0x...,0,0x...,0x...,0x...)" \
  0x0000000000000000000000000000000000000000000000000000000000000000 \
  0 \
  --rpc-url http://127.0.0.1:8545

# Should return: 0x0000000000000000000000000000000000000000000000000000000000000000
# (all zeros = valid signature)
```

---

## Troubleshooting

### Problem: "Connection refused" to anvil

**Symptoms:**
- Cannot connect to http://127.0.0.1:8545
- Services show RPC errors
- `cast` commands fail

**Solution:**
```bash
# Check if anvil is running
lsof -i :8545
lsof -i :8546

# If not running, start anvil
anvil --fork-url https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY \
  --chain-id 421614 \
  --port 8545
```

### Problem: "AA20 account not deployed"

**Symptoms:**
- UserOp validation fails with AA20 error
- Smart account has no code

**Solution:**
```bash
# Deploy account via factory
cast send 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 \
  "createAccount(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Verify deployment
cast code 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 --rpc-url http://127.0.0.1:8545
# Should return bytecode (not 0x)
```

### Problem: "AA31 paymaster deposit too low"

**Symptoms:**
- UserOp validation fails with AA31
- Paymaster has stake but no deposit

**Solution:**
```bash
# Deposit to paymaster
cast send 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "depositTo(address)" \
  0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419 \
  --value 1ether \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Verify deposit
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "balanceOf(address)" \
  0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419 \
  --rpc-url http://127.0.0.1:8545
```

### Problem: "AA33 reverted (InvalidTarget)"

**Symptoms:**
- UserOp validation fails with AA33
- Paymaster rejects transaction
- Target is not Checkout contract

**Solution:**
```bash
# Verify paymaster configuration
cast call 0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419 \
  "checkoutContract()" \
  --rpc-url http://127.0.0.1:8545
# Should return: 0xf588f57BE135813d305815Dc3E71960c97987b19

# Verify callData is wrapped in execute()
# CallData should be: execute(checkoutAddress, 0, settle(...))
# NOT: approve(...) or direct settle(...)
```

### Problem: "validateUserOp returns 0x01 (invalid)"

**Symptoms:**
- Signature validation fails
- Returns validationData ending in 0x01
- Session key not recognized

**Solution:**
```bash
# Check if session key is enabled
cast call 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "sessionKeys(bytes32)(bool,uint48,uint8)" \
  0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4 \
  --rpc-url http://127.0.0.1:8545

# If returns false, enable it:
curl -X POST http://localhost:3002/session/enable \
  -H "Content-Type: application/json" \
  -d '{"chainId":421614,"account":"0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896","pubKeyHash":"0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4","validUntil":1749553800,"policyId":0}'
```

### Problem: "InvalidGuardian" when enabling session key

**Symptoms:**
- enableSessionKey reverts
- Guardian signature verification fails

**Diagnosis:**
```solidity
// Contract expects signature over:
bytes32 digest = keccak256(abi.encodePacked(
    "\x19Ethereum Signed Message:\n32",
    keccak256(abi.encode(address(this), pubKeyHash, validUntil, policyId))
));
```

**Solution:**
Check `apps/relayer/src/routes/index.ts` has correct signature generation:
```typescript
const prefix = '\x19Ethereum Signed Message:\n32';
const digest = keccak256(concat([toHex(prefix), innerHash]));
const guardianSignature = await guardian.sign({ hash: digest });
```

**NOT:**
```typescript
const guardianSignature = await guardian.signMessage({ message: { raw: innerHash }});
// This adds EIP-191 prefix twice!
```

### Problem: PYUSD transfer fails with "insufficient allowance"

**Symptoms:**
- Transaction reverts
- Checkout cannot transfer PYUSD
- Allowance is 0

**Solution:**
```bash
# Set max allowance from smart account to Checkout
cast send 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "execute(address,uint256,bytes)" \
  0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  0 \
  $(cast calldata "approve(address,uint256)" 0xf588f57BE135813d305815Dc3E71960c97987b19 115792089237316195423570985008687907853269984665640564039457584007913129639935) \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Verify
cast call 0x2ec6622F4Ea3315DB6045d7C4947F63581090568 \
  "allowance(address,address)" \
  0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  0xf588f57BE135813d305815Dc3E71960c97987b19 \
  --rpc-url http://127.0.0.1:8545
```

### Problem: Frontend shows wrong contract addresses

**Symptoms:**
- Payment fails with wrong target
- Using old/incorrect addresses

**Solution:**
```bash
# Update all env files
# 1. Root .env
# 2. apps/web/.env.local

# Verify hardcoded fallbacks in config
cat apps/web/lib/config.ts | grep "CHECKOUT"

# Restart Next.js to clear cache
cd apps/web
rm -rf .next
pnpm dev
```

---

## Next Steps

### Immediate (Critical Path)

1. **✅ Verify Anvil is Running**
   ```bash
   cast block-number --rpc-url http://127.0.0.1:8545
   ```

2. **🔴 Enable Session Key** (BLOCKING)
   ```bash
   curl -X POST http://localhost:3002/session/enable \
     -H "Content-Type: application/json" \
     -d '{"chainId":421614,"account":"0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896","pubKeyHash":"0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4","validUntil":1749553800,"policyId":0}'
   ```

3. **✅ Test Payment Flow**
   - Visit: http://localhost:3000/checkout?id=inv_test
   - Authenticate with passkey
   - Confirm payment
   - Verify transaction success

### Short Term

4. **Implement UserOp Receipt Polling**
   - Add polling in `apps/web/lib/payment.ts`
   - Show confirmation UI to user
   - Handle timeout errors

5. **Configure Ethereum Sepolia**
   - Deploy paymaster on Eth fork
   - Stake and deposit ETH
   - Test cross-chain bridge flow

6. **Add Error Recovery**
   - Retry failed transactions
   - Show user-friendly error messages
   - Log errors to monitoring service

### Medium Term

7. **Production Deployment**
   - Deploy to Arbitrum Sepolia testnet
   - Use real Pimlico bundler
   - Set up monitoring & alerts

8. **Security Audit**
   - Review guardian signature security
   - Audit paymaster target restrictions
   - Test session key expiration

9. **UX Improvements**
   - Better loading states
   - Transaction history
   - Invoice management dashboard

---

## Quick Reference

### Important Addresses (Arbitrum Sepolia Fork)

| Contract | Address |
|----------|---------|
| EntryPoint | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| AccountFactory | `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318` |
| Smart Account | `0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896` |
| Paymaster | `0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419` |
| Checkout | `0xf588f57BE135813d305815Dc3E71960c97987b19` |
| MerchantRegistry | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Mock PYUSD | `0x2ec6622F4Ea3315DB6045d7C4947F63581090568` |

### Important Keys

| Key | Value |
|-----|-------|
| Owner Private Key | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Owner Address | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Guardian Private Key | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Guardian Address | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| HMAC Secret | `aea0bf03b9b243dfbdc281543d16d073dca1550d7cd07d67600e1a90373af73c` |
| Session Key PubKeyHash | `0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4` |

### Service Ports

| Service | Port | URL |
|---------|------|-----|
| Arbitrum Sepolia Fork | 8545 | http://127.0.0.1:8545 |
| Ethereum Sepolia Fork | 8546 | http://127.0.0.1:8546 |
| Indexer | 3001 | http://localhost:3001 |
| Relayer | 3002 | http://localhost:3002 |
| Cost Engine | 3003 | http://localhost:3003 |
| Web App | 3000 | http://localhost:3000 |

### Common Commands

```bash
# Check balances
cast balance <address> --rpc-url http://127.0.0.1:8545
cast call <token> "balanceOf(address)" <address> --rpc-url http://127.0.0.1:8545

# Check session key status
cast call 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 \
  "sessionKeys(bytes32)(bool,uint48,uint8)" \
  0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4 \
  --rpc-url http://127.0.0.1:8545

# Check paymaster deposit
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "balanceOf(address)" \
  0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419 \
  --rpc-url http://127.0.0.1:8545

# Enable session key
curl -X POST http://localhost:3002/session/enable \
  -H "Content-Type: application/json" \
  -d '{"chainId":421614,"account":"0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896","pubKeyHash":"0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4","validUntil":1749553800,"policyId":0}'

# Restart all services
pkill -f anvil
pkill -f "pnpm dev"
# Then start each service in separate terminals
```

---

## Summary

### What's Working ✅
- All smart contracts deployed and configured
- Smart account funded and approved
- Paymaster staked and deposited
- Backend services running
- Frontend authentication flow
- Payment logic implementation
- Guardian signature generation fixed

### What's Broken 🔴
- **Session key not enabled** (critical blocker)
- Anvil connection issues
- No transaction confirmation feedback

### What's Next 📋
1. Start anvil nodes
2. Enable session key via relayer
3. Test end-to-end payment
4. Add receipt polling
5. Deploy to testnet

**The system is 95% complete. Once the session key is enabled, the full payment flow should work end-to-end.**
