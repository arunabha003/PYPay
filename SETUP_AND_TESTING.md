# 🧪 Complete Setup and Testing Guide

This guide walks you through **every step** to deploy, configure, and test PyPay end-to-end.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Contract Deployment](#contract-deployment)
4. [Service Configuration](#service-configuration)
5. [Running the Application](#running-the-application)
6. [End-to-End Testing](#end-to-end-testing)
7. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

### Required Tools

```bash
# Node.js and pnpm
node --version  # Should be 18+
pnpm --version  # Should be 8+

# Foundry
forge --version
cast --version
anvil --version

# Postgres (optional: use SQLite for dev)
psql --version
```

**Install Missing Tools:**

```bash
# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# pnpm
npm install -g pnpm

# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Postgres (macOS)
brew install postgresql@16
brew services start postgresql@16
```

### Get Testnet Resources

#### 1. Testnet ETH

Get free testnet ETH from faucets:

- **Arbitrum Sepolia:** https://faucet.quicknode.com/arbitrum/sepolia
- **Ethereum Sepolia:** https://sepoliafaucet.com/

You'll need ~0.5 ETH on each chain for:
- Contract deployment (~0.1 ETH)
- Paymaster staking (~0.1 ETH)
- Relayer operations (~0.3 ETH)

#### 2. RPC Endpoints

Get free RPC endpoints from any provider:

- **Alchemy:** https://www.alchemy.com/ (Recommended)
- **Infura:** https://www.infura.io/
- **QuickNode:** https://www.quicknode.com/

Create accounts and get RPC URLs for both:
- Arbitrum Sepolia (Chain ID: 421614)
- Ethereum Sepolia (Chain ID: 11155111)

#### 3. PYUSD Testnet Addresses

**Option A:** Use existing testnet PYUSD (if available)
- Check with PayPal or community for testnet addresses

**Option B:** Deploy mock PYUSD for testing

```bash
cd packages/contracts
forge create src/mocks/MockPYUSD.sol:MockPYUSD \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
  
# Repeat for Ethereum Sepolia
```

#### 4. Generate Private Keys

```bash
# Generate new wallets (NEVER use these in production!)
cast wallet new

# You'll need 3 wallets:
# - Deployer (for contract deployment)
# - Relayer (for gasless operations)
# - Guardian (for session key attestations)
```

**Fund all 3 wallets** with testnet ETH from faucets.

---

## 2. Initial Setup

### Clone and Install

```bash
git clone <your-repo-url>
cd PYPay
pnpm install
```

### Configure Environment

```bash
cp .env.example .env
```

**Edit `.env` with your values:**

```env
# ============================================
# Chain RPCs
# ============================================
ARBITRUM_SEPOLIA_RPC=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# ============================================
# PYUSD Addresses (from faucet or deployed mock)
# ============================================
PYUSD_ARBSEPOLIA=0x...
PYUSD_SEPOLIA=0x...

# ============================================
# Canonical Addresses (DO NOT CHANGE)
# ============================================
PERMIT2_ARBSEPOLIA=0x000000000022D473030F116dDEE9F6B43aC78BA3
PERMIT2_SEPOLIA=0x000000000022D473030F116dDEE9F6B43aC78BA3
ENTRYPOINT_ARBSEPOLIA=0x0000000071727De22E5E9d8BAf0edAc6f37da032
ENTRYPOINT_SEPOLIA=0x0000000071727De22E5E9d8BAf0edAc6f37da032

# ============================================
# Private Keys (from step 4 above)
# ============================================
DEPLOYER_PRIVATE_KEY=0x...
RELAYER_PRIVATE_KEY=0x...
GUARDIAN_PRIVATE_KEY=0x...

# ============================================
# Deployed Contracts (leave empty for now)
# Will be filled after deployment
# ============================================
REGISTRY_ARBSEPOLIA=
INVOICE_ARBSEPOLIA=
CHECKOUT_ARBSEPOLIA=
PAYMASTER_ARBSEPOLIA=
BRIDGE_ESCROW_ARBSEPOLIA=
ACCOUNT_FACTORY_ARBSEPOLIA=

REGISTRY_SEPOLIA=
INVOICE_SEPOLIA=
CHECKOUT_SEPOLIA=
PAYMASTER_SEPOLIA=
BRIDGE_ESCROW_SEPOLIA=
ACCOUNT_FACTORY_SEPOLIA=

# ============================================
# Database
# ============================================
DATABASE_URL=postgresql://localhost:5432/pypay
# Or use SQLite for development:
# DATABASE_URL=file:./dev.db

# ============================================
# Bundler (optional: use public bundlers)
# ============================================
BUNDLER_RPC_ARBSEPOLIA=https://api.pimlico.io/v2/arbitrum-sepolia/rpc?apikey=YOUR_KEY
BUNDLER_RPC_SEPOLIA=https://api.pimlico.io/v2/sepolia/rpc?apikey=YOUR_KEY

# ============================================
# Relayer Configuration
# ============================================
HMAC_SECRET=your-random-secret-minimum-32-chars
RELAYER_PORT=3002
INDEXER_PORT=3001
COST_ENGINE_PORT=3003
WEB_PORT=3000

# ============================================
# Cost Estimation (mock values for MVP)
# ============================================
ETH_USD_PRICE=2000
INVENTORY_FEE_BPS=30
```

### Create Database

```bash
# If using Postgres
createdb pypay

# If using SQLite, database file will be created automatically
```

---

## 3. Contract Deployment

### Step 1: Deploy to Arbitrum Sepolia

```bash
cd packages/contracts

# Set environment
export DEPLOYER_PRIVATE_KEY=0x...
export ARBITRUM_SEPOLIA_RPC=https://...

# Deploy all contracts
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  -vvvv
```

**Expected Output:**

```
== Logs ==
Deploying to chain: 421614
Deployer: 0x...

Deploying MerchantRegistry...
MerchantRegistry deployed at: 0xABC...

Deploying Invoice...
Invoice deployed at: 0xDEF...

Deploying Checkout...
Checkout deployed at: 0xGHI...

Deploying BridgeEscrow...
BridgeEscrow deployed at: 0xJKL...

Deploying TapKitAccountFactory...
TapKitAccountFactory deployed at: 0xMNO...

Deploying TapKitPaymaster...
TapKitPaymaster deployed at: 0xPQR...

✅ All contracts deployed successfully!
```

**Copy the addresses** and paste them into `.env`:

```env
REGISTRY_ARBSEPOLIA=0xABC...
INVOICE_ARBSEPOLIA=0xDEF...
CHECKOUT_ARBSEPOLIA=0xGHI...
PAYMASTER_ARBSEPOLIA=0xPQR...
BRIDGE_ESCROW_ARBSEPOLIA=0xJKL...
ACCOUNT_FACTORY_ARBSEPOLIA=0xMNO...
```

### Step 2: Deploy to Ethereum Sepolia

```bash
export ETHEREUM_SEPOLIA_RPC=https://...

forge script script/Deploy.s.sol \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  -vvvv
```

Copy the addresses to `.env` under `_SEPOLIA` variables.

### Step 3: Stake Paymasters

Paymasters need to stake ETH on the EntryPoint:

```bash
# Arbitrum Sepolia
export PAYMASTER=<PAYMASTER_ARBSEPOLIA address>
forge script script/StakePaymaster.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast

# Ethereum Sepolia
export PAYMASTER=<PAYMASTER_SEPOLIA address>
forge script script/StakePaymaster.s.sol \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --broadcast
```

### Step 4: Register Test Merchant

```bash
# Create a test merchant wallet
export MERCHANT_ADDRESS=0x... # Your test merchant address
export MERCHANT_PAYOUT=0x...  # Where merchant receives payments

forge script script/SeedMerchant.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast
```

### Step 5: Update Chain Config

Edit `chains.config.json` with deployed addresses:

```json
{
  "chains": [
    {
      "name": "Arbitrum Sepolia",
      "chainId": 421614,
      "rpcUrlEnv": "ARBITRUM_SEPOLIA_RPC",
      "contracts": {
        "merchantRegistry": "0xABC...",
        "invoice": "0xDEF...",
        "checkout": "0xGHI...",
        "paymaster": "0xPQR...",
        "bridgeEscrow": "0xJKL...",
        "accountFactory": "0xMNO..."
      }
    },
    {
      "name": "Ethereum Sepolia",
      "chainId": 11155111,
      "contracts": { /* ... Sepolia addresses ... */ }
    }
  ]
}
```

---

## 4. Service Configuration

### Initialize Database

```bash
cd apps/indexer
pnpm prisma migrate deploy
```

**Verify:**

```bash
pnpm prisma studio
# Opens GUI at http://localhost:5555
# Check that all tables exist
```

### Build All Packages

```bash
cd ../..  # Back to root
pnpm build
```

---

## 5. Running the Application

### Start All Services

```bash
pnpm dev
```

This starts 4 services in parallel:

1. **Indexer** (port 3001)
   - Watches blockchain events
   - Provides read APIs

2. **Relayer** (port 3002)
   - Handles gasless transactions
   - Coordinates bridge operations

3. **Cost Engine** (port 3003)
   - Calculates real-time costs
   - Updates quotes every 15s

4. **Web App** (port 3000)
   - Merchant portal
   - Buyer checkout

### Verify Services

**Check Diagnostics Page:**

```
http://localhost:3000/diagnostics
```

You should see:
- ✅ All chains connected
- ✅ Contract addresses loaded
- ✅ Cost quotes available
- ✅ Services healthy

**Check Individual Services:**

```bash
# Indexer health
curl http://localhost:3001/health

# Relayer health
curl http://localhost:3002/health

# Cost quotes
curl http://localhost:3001/costs/quotes
```

---

## 6. End-to-End Testing

### Automated Tests

#### Run Contract Tests

```bash
cd packages/contracts
forge test -vv

# Expected: 36 tests passed, 0 failed
```

#### Run E2E Tests

```bash
cd apps/web
pnpm test:e2e

# Or with UI for debugging
pnpm test:e2e:ui
```

### Manual Testing Flow

#### **Scenario: Complete Payment Flow**

Follow this exact sequence to test the full system.

---

#### **Part 1: Merchant Creates Invoice**

1. **Open Merchant Portal**
   ```
   http://localhost:3000/merchant
   ```

2. **Create New Invoice**
   - Click "Create Invoice"
   - Fill in details:
     - Amount: `100` (100 PYUSD)
     - Memo: `Coffee and pastry`
     - Expiry: 1 hour from now
     - Chain: `Arbitrum Sepolia`
   - Click "Create Invoice"

3. **Verify Invoice Created**
   - QR code should appear
   - Invoice ID displayed (e.g., `0xabc123...`)
   - Status shows "Unpaid"

4. **Copy Invoice URL**
   ```
   http://localhost:3000/checkout/0xabc123...
   ```

**Verify in Explorer:**
```bash
# Check transaction on Arbiscan Sepolia
# InvoiceCreated event should be emitted
```

---

#### **Part 2: Buyer Pays Invoice**

5. **Open Checkout Page**
   - Paste the invoice URL in a new incognito/private window
   - Invoice details should load:
     - Merchant address
     - Amount: 100 PYUSD
     - Memo: Coffee and pastry
     - Expiry time

6. **Authenticate with Passkey**
   - Click "Login with Passkey"
   - Browser prompts for biometric/PIN
   - Approve authentication
   
   **Expected:** Success message "Authenticated as user_xxx"

7. **View Cheapest-Chain Toggle**
   
   You should see a comparison table:
   
   ```
   Chain              Gas Cost    Bridge Cost   Latency   Total
   Arbitrum Sepolia   $0.05      $0.00         2s        $0.05  ✅ Recommended
   Ethereum Sepolia   $0.15      $0.30         12s       $0.45
   ```

8. **Select Chain**
   - Default: Arbitrum Sepolia (cheapest)
   - Try changing to Ethereum Sepolia
   - Notice bridge cost appears if needed

9. **Fund Smart Account (First Time Only)**
   
   If this is your first payment, you need PYUSD:
   
   ```bash
   # Get your smart account address from the UI
   export BUYER_ACCOUNT=0x...
   
   # Mint test PYUSD (if using mock)
   cast send $PYUSD_ARBSEPOLIA \
     "mint(address,uint256)" \
     $BUYER_ACCOUNT \
     100000000 \  # 100 PYUSD (6 decimals)
     --rpc-url $ARBITRUM_SEPOLIA_RPC \
     --private-key $DEPLOYER_PRIVATE_KEY
   
   # Verify balance
   cast call $PYUSD_ARBSEPOLIA \
     "balanceOf(address)(uint256)" \
     $BUYER_ACCOUNT \
     --rpc-url $ARBITRUM_SEPOLIA_RPC
   ```

10. **Approve PYUSD**
    - Click "Approve PYUSD"
    - Approve smart account to spend PYUSD
    - Wait for transaction confirmation

11. **Pay Invoice**
    - Click "Pay Now"
    - Loading animation appears
    - Steps shown:
      1. Building transaction ✅
      2. Signing with session key ✅
      3. Submitting to bundler ✅
      4. Waiting for confirmation...

12. **Success!**
    - Receipt displayed:
      - ✅ Payment confirmed
      - Transaction hash
      - Block explorer link
      - Receipt ID
    - Click "Download Receipt" to save PDF

---

#### **Part 3: Merchant Verifies Payment**

13. **Return to Merchant Dashboard**
    ```
    http://localhost:3000/merchant
    ```

14. **Check Invoice Status**
    - Find the invoice you created
    - Status should now be "Paid" ✅
    - Amount received: 100 PYUSD
    - Transaction hash visible

15. **Export CSV**
    - Click "Export CSV"
    - Download receipts file
    - Open in Excel/Google Sheets
    - Verify transaction details

**Verify On-Chain:**
```bash
# Check merchant received payment
cast call $PYUSD_ARBSEPOLIA \
  "balanceOf(address)(uint256)" \
  $MERCHANT_PAYOUT \
  --rpc-url $ARBITRUM_SEPOLIA_RPC

# Should show 100000000 (100 PYUSD)
```

---

#### **Part 4: Test Bridge Flow**

16. **Create Invoice on Different Chain**
    - Create new invoice on **Ethereum Sepolia**
    - Amount: 50 PYUSD

17. **Pay from Different Chain**
    - Open checkout page
    - Authenticate
    - Buyer has funds on **Arbitrum Sepolia** only
    - Select **Ethereum Sepolia** chain

18. **Bridge Flow Activated**
    - UI shows "Bridge Required"
    - Bridge cost displayed: ~$0.30
    - ETA: ~2 minutes

19. **Lock on Source Chain**
    - Click "Start Bridge"
    - Transaction submitted to lock PYUSD on Arbitrum
    - Wait for confirmation

20. **Wait for Release**
    - Progress bar shows:
      - ✅ Locked on Arbitrum Sepolia (tx: 0x...)
      - ⏳ Waiting for relayer...
      - ⏳ Releasing on Ethereum Sepolia...
    - Auto-updates every 5 seconds

21. **Bridge Complete**
    - ✅ Released on Ethereum Sepolia (tx: 0x...)
    - PYUSD now available on destination
    - "Continue to Payment" button enabled

22. **Complete Payment**
    - Click "Pay Now"
    - Payment processed on Ethereum Sepolia
    - Receipt generated

---

#### **Part 5: Test Edge Cases**

**Test Expired Invoice:**
```bash
# Create invoice with past expiry
# Try to pay
# Expected: "Invoice Expired" error
```

**Test Already Paid:**
```bash
# Try to pay same invoice twice
# Expected: "Already Paid" error
```

**Test Inactive Merchant:**
```bash
# Deactivate merchant in registry
cast send $REGISTRY_ARBSEPOLIA \
  "setActive(address,bool)" \
  $MERCHANT_ADDRESS \
  false \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

# Try to create invoice
# Expected: "Inactive Merchant" error
```

**Test Session Key Expiry:**
```bash
# Wait for session key to expire (30 minutes default)
# Try to pay
# Expected: Prompt to re-authenticate
```

---

## 7. Troubleshooting

### Common Issues

#### "RPC Connection Failed"

**Problem:** Can't connect to testnet

**Solution:**
```bash
# Test RPC connection
cast block-number --rpc-url $ARBITRUM_SEPOLIA_RPC

# If fails, check:
# 1. RPC URL is correct
# 2. API key is valid
# 3. Rate limits not exceeded
```

#### "Insufficient Funds for Gas"

**Problem:** Paymaster needs more stake

**Solution:**
```bash
# Check paymaster stake
cast call $ENTRYPOINT_ARBSEPOLIA \
  "balanceOf(address)(uint256)" \
  $PAYMASTER_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC

# Add more stake
forge script script/StakePaymaster.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast
```

#### "Contract Not Found"

**Problem:** Addresses in config don't match deployed contracts

**Solution:**
```bash
# Verify all addresses in .env match deployment
# Check chains.config.json is updated
# Restart all services: pnpm dev
```

#### "Database Connection Error"

**Problem:** Can't connect to Postgres

**Solution:**
```bash
# Check Postgres is running
pg_isready

# Create database if missing
createdb pypay

# Run migrations
cd apps/indexer
pnpm prisma migrate deploy
```

#### "Indexer Not Syncing Events"

**Problem:** No events appearing in dashboard

**Solution:**
```bash
# Check indexer logs
cd apps/indexer
pnpm dev

# Look for:
# "Watching events on Arbitrum Sepolia..."
# "Event detected: InvoiceCreated"

# If no events, check:
# 1. Contract addresses correct
# 2. RPC connection working
# 3. Events actually emitted on-chain
```

#### "Bundler Rejected UserOp"

**Problem:** Transactions not going through

**Solution:**
```bash
# Check bundler endpoint
curl $BUNDLER_RPC_ARBSEPOLIA -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_supportedEntryPoints","id":1}'

# Common causes:
# 1. Paymaster not staked
# 2. Invalid signature
# 3. Insufficient PYUSD balance
# 4. Invoice validation failed

# Check paymaster logs in relayer
```

---

## 📊 Test Checklist

Use this checklist to verify everything works:

### Contracts
- [ ] All contracts deployed to both testnets
- [ ] Paymasters staked on EntryPoint
- [ ] Test merchant registered
- [ ] PYUSD minted to test accounts

### Services
- [ ] Indexer syncing events
- [ ] Relayer responding to requests
- [ ] Cost engine generating quotes
- [ ] Web app loading

### Merchant Flow
- [ ] Create invoice
- [ ] Generate QR code
- [ ] View dashboard
- [ ] Export CSV

### Buyer Flow
- [ ] Passkey authentication
- [ ] Smart account creation
- [ ] Cheapest-chain selection
- [ ] PYUSD approval
- [ ] Gasless payment
- [ ] Receipt generation

### Bridge Flow
- [ ] Lock on source chain
- [ ] Release on destination
- [ ] Cross-chain payment

### Edge Cases
- [ ] Expired invoice rejected
- [ ] Duplicate payment rejected
- [ ] Inactive merchant rejected
- [ ] Session expiry handled

---

## 🎉 Success!

If all tests pass, you have a fully functional PyPay system!

**Next Steps:**
- Test with real users
- Monitor gas costs
- Adjust cost quotes
- Rebalance bridge inventory
- Deploy to production

---

**Need Help?** Check `TECHNICAL_REFERENCE.md` for architecture details.

