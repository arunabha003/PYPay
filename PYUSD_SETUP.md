# PYUSD Setup Guide for Testing

## 🎯 Problem
The forked testnets don't have PYUSD tokens deployed, so we need to deploy mock PYUSD for testing the full payment flow.

## ✅ Solution: Mock PYUSD Deployed

### Deployed Addresses

**Arbitrum Sepolia (port 8545):**
```
MockPYUSD: 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05
```

**Ethereum Sepolia (port 8546):**
```
MockPYUSD: 0x8A96dc4588EFadCa7d05c143A86708A896638e59
```

---

## 🚀 Quick Start

### 1. Get PYUSD Tokens (Faucet)

Anyone can mint up to 10,000 PYUSD per call:

```bash
# Arbitrum Sepolia
cast send 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 \
  "faucet(uint256)" 1000000000 \
  --rpc-url http://localhost:8545 \
  --private-key YOUR_PRIVATE_KEY

# Ethereum Sepolia
cast send 0x8A96dc4588EFadCa7d05c143A86708A896638e59 \
  "faucet(uint256)" 1000000000 \
  --rpc-url http://localhost:8546 \
  --private-key YOUR_PRIVATE_KEY
```

**Amount:** `1000000000` = 1,000 PYUSD (6 decimals)

### 2. Check Balance

```bash
# Arbitrum Sepolia
cast call 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 \
  "balanceOf(address)(uint256)" YOUR_ADDRESS \
  --rpc-url http://localhost:8545

# Ethereum Sepolia
cast call 0x8A96dc4588EFadCa7d05c143A86708A896638e59 \
  "balanceOf(address)(uint256)" YOUR_ADDRESS \
  --rpc-url http://localhost:8546
```

---

## 🔧 Update Configuration

### Update .env (or export as environment variables)

```bash
# Add these to your .env file
PYUSD_ARBSEPOLIA=0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05
PYUSD_SEPOLIA=0x8A96dc4588EFadCa7d05c143A86708A896638e59
```

### Update chains.config.json

If using the config loader, it will automatically pick up the env variables.

---

## 💳 Test Accounts with PYUSD

### Anvil Account #0 (Deployer)
- **Address:** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Private Key:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Balance:** 1,000 PYUSD ✅

### Other Anvil Accounts
```bash
# Anvil provides 10 test accounts
# Account #1
Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
PK: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Account #2  
Address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
PK: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

Mint PYUSD to any account using the faucet!

---

## 🧪 Test Payment Flow

### Step 1: Approve PYUSD to Permit2

First, you need Permit2 deployed. The canonical address is:
- Arbitrum Sepolia: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- Ethereum Sepolia: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

```bash
# Approve Permit2 to spend PYUSD
cast send 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 \
  "approve(address,uint256)" \
  0x000000000022D473030F116dDEE9F6B43aC78BA3 \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url http://localhost:8545 \
  --private-key YOUR_PRIVATE_KEY
```

### Step 2: Create Invoice

```bash
cd packages/contracts

# Create invoice for 10 PYUSD
cast send 0xA589fee47fe9F28390b6fC68DD28bD0A96591416 \
  "createInvoice(address,uint256,uint64,bytes32,uint256,bytes32)" \
  0x15d34aaf54267db7d7c367839aaf71a00a2c6a65 \
  10000000 \
  $(($(date +%s) + 3600)) \
  0x$(echo -n "Test payment" | sha256sum | cut -d' ' -f1) \
  421614 \
  0x$(openssl rand -hex 32) \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Step 3: Pay Invoice (via Checkout)

This requires building the proper Permit2 signature. For now, you can test with a direct transfer approach or use the frontend checkout flow.

---

## 📊 MockPYUSD Features

### Functions

- **`faucet(uint256 amount)`** - Mint PYUSD to yourself (max 10,000 per call)
- **`mint(address to, uint256 amount)`** - Mint to any address (no limit)
- **`burn(uint256 amount)`** - Burn your PYUSD
- **`transfer(address to, uint256 amount)`** - Standard ERC20 transfer
- **`approve(address spender, uint256 amount)`** - Standard ERC20 approve
- **`balanceOf(address account)`** - Check balance

### Properties

- **Decimals:** 6 (same as real PYUSD)
- **Symbol:** PYUSD
- **Name:** PayPal USD (Mock)
- **Max Faucet:** 10,000 PYUSD per call

---

## 🔄 Redeploy if Needed

If you restart Anvil, you'll need to redeploy:

```bash
cd packages/contracts

# Deploy to both chains
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
forge script script/DeployMockPYUSD.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast

DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
forge script script/DeployMockPYUSD.s.sol \
  --rpc-url http://localhost:8546 \
  --broadcast

# Update .env with new addresses
# Mint tokens again
```

---

## ✅ Verification

Check everything is working:

```bash
# 1. Check MockPYUSD is deployed
cast code 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 --rpc-url http://localhost:8545

# 2. Check decimals
cast call 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 "decimals()(uint8)" --rpc-url http://localhost:8545

# 3. Check symbol
cast call 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 "symbol()(string)" --rpc-url http://localhost:8545

# 4. Check your balance
cast call 0xabbB307CDAc48E1fa9c9046df1eD2Ccc031A8D05 \
  "balanceOf(address)(uint256)" YOUR_ADDRESS \
  --rpc-url http://localhost:8545
```

---

## 🎯 Now You Can Test

With PYUSD deployed:
- ✅ Create invoices
- ✅ Approve Permit2
- ✅ Make payments via Checkout
- ✅ Test bridge flow
- ✅ Test gasless payments

The frontend checkout flow will now work end-to-end!

