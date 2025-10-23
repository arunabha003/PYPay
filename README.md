# 🚀 PyPay - Passwordless Cross-Chain PYUSD Payments

> **The Stripe of Crypto** - A production-ready payment gateway enabling merchants to accept PYUSD with zero UX friction: no wallets, no gas fees, no seed phrases, no bridging complexity.

[![Arbitrum Sepolia](https://img.shields.io/badge/Arbitrum-Sepolia-blue)](https://sepolia.arbiscan.io/)
[![Ethereum Sepolia](https://img.shields.io/badge/Ethereum-Sepolia-purple)](https://sepolia.etherscan.io/)
[![ERC-4337](https://img.shields.io/badge/ERC--4337-Account_Abstraction-green)](https://eips.ethereum.org/EIPS/eip-4337)

---

## 📚 Documentation

**Start Here:**
- **[FLOW_DIAGRAM.md](./FLOW_DIAGRAM.md)** - 🎯 **Visual flow diagram** (recommended first read!)
- **[DEPLOYED_CONTRACTS.md](./DEPLOYED_CONTRACTS.md)** - All live contract addresses
- **[docs/TECHNICAL_REFERENCE.md](./docs/TECHNICAL_REFERENCE.md)** - Architecture & API docs
- **[run.md](./run.md)** - Local development commands

---

## 🎯 What is PyPay?

PyPay is the **Stripe of crypto payments** - a complete payment gateway for PYUSD (PayPal USD stablecoin) that abstracts away all blockchain complexity.

### The Problem

Traditional crypto payments are broken:
- ❌ Users need MetaMask and must understand wallets
- ❌ Requires backing up 12-word seed phrases (75% get lost!)
- ❌ Must buy ETH just to pay gas fees
- ❌ Figuring out which chain to use
- ❌ Manually bridging assets between chains
- ❌ Repeated signature prompts for every action
- ❌ Merchants locked to single wallet addresses

### The PyPay Solution

**For Customers:**
- ✅ **Passwordless Login** - Face ID/Touch ID via WebAuthn passkeys
- ✅ **Zero Gas Fees** - ERC-4337 paymaster sponsors 100% of gas
- ✅ **Automatic Bridging** - Cross-chain payments work seamlessly
- ✅ **Smart Routing** - System picks cheapest chain automatically
- ✅ **Session Keys** - No repeated signatures during checkout
- ✅ **No Extensions** - Works in any browser

**For Merchants:**
- ✅ **Wallet Connection** - Connect MetaMask/WalletConnect (no registration!)
- ✅ **Multi-Merchant** - Each wallet = separate merchant account
- ✅ **Live Gas Costs** - See real-time fees for each chain
- ✅ **Real-Time Dashboard** - Track payments across all chains
- ✅ **Direct Payouts** - PYUSD sent directly to connected wallet

---

## 🏗️ Architecture

PyPay is built on modern crypto infrastructure:

### Smart Contracts (Solidity)
- **Account Factory** - Creates counterfactual smart accounts
- **Checkout Contract** - Processes invoice settlements with PERMIT2
- **Paymaster** - Sponsors gas fees for all transactions
- **Bridge Escrow** - Handles cross-chain PYUSD transfers
- **Session Policy** - Manages temporary transaction permissions

### Backend Services (TypeScript)
- **Indexer** - Watches blockchain events, tracks invoices
- **Relayer** - Submits UserOperations, manages session keys
- **Cost Engine** - Real-time gas cost calculations

### Frontend (Next.js 15 + TypeScript)
- **Merchant Portal** - Wallet-gated dashboard (MetaMask/WalletConnect)
- **Customer Checkout** - Passkey-gated payment flow
- **Diagnostics** - System health monitoring

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Foundry (for contracts)
- PostgreSQL (for indexer)

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/PYPay.git
cd PYPay
pnpm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your RPC URLs and private keys
```

### 3. Deploy Contracts (Testnet)
See [docs/TESTNET_DEPLOYMENT_GUIDE.md](./docs/TESTNET_DEPLOYMENT_GUIDE.md) for detailed steps.

### 4. Start Services
```bash
# Terminal 1: Indexer
cd apps/indexer
pnpm prisma generate
pnpm prisma migrate deploy
ARBITRUM_SEPOLIA_RPC=<YOUR_RPC> \
ETHEREUM_SEPOLIA_RPC=<YOUR_RPC> \
INDEXER_PORT=3001 \
INDEXER_SKIP_CATCHUP=true \
pnpm dev

# Terminal 2: Relayer
cd apps/relayer
pnpm dev

# Terminal 3: Web Frontend
cd apps/web
pnpm dev
```

### 5. Open App
- **Frontend**: http://localhost:3000
- **Merchant Portal**: http://localhost:3000/merchant
- **Diagnostics**: http://localhost:3000/diagnostics

---

## 💡 How It Works

### Merchant Flow (Wallet-Based)
1. Merchant connects wallet (MetaMask/WalletConnect)
2. Creates invoice: amount, memo, expiry, chain selection
3. Views real-time gas costs for each chain
4. Invoice is recorded on-chain
5. QR code generated for customer

### Customer Flow (Passkey-Based)
1. Customer scans QR code or clicks link
2. Authenticates with Face ID/Touch ID (no seed phrase!)
3. System checks PYUSD balance across chains
4. If balance on different chain → automatic bridge
5. Session key enables gasless transactions
6. Payment settles to merchant wallet
7. Success screen shows transaction hash(es)

### Cross-Chain Bridge Flow
1. **Lock**: PYUSD locked in BridgeEscrow on source chain
2. **Detect**: Relayer detects lock event
3. **Release**: Relayer releases PYUSD on destination chain
4. **Settle**: Settlement transaction sends PYUSD to merchant
5. Customer sees both transaction hashes

---

## 🎨 Key Innovations

### 1. Dual Authentication Model
- **Merchants**: Traditional wallet connection (MetaMask/WalletConnect)
- **Customers**: Passwordless passkeys (WebAuthn)
- No single point of failure, UX optimized for each role

### 2. Intelligent Routing
- Checks customer balance across multiple chains
- Automatically bridges if needed
- Shows real-time costs before transaction

### 3. Session Keys
- Temporary permissions for checkout session
- No repeated signature prompts
- Secure time-limited access

### 4. Gas Sponsorship
- ERC-4337 paymaster pays 100% of gas
- Customers never need ETH
- Seamless UX

### 5. Multi-Merchant Architecture
- No centralized registration
- Any wallet can create invoices
- Direct peer-to-peer settlements

---

## 🔧 Tech Stack

**Smart Contracts:**
- Solidity 0.8.28
- Foundry for development
- ERC-4337 Account Abstraction
- PERMIT2 for gasless approvals

**Backend:**
- TypeScript
- Fastify (Indexer & Relayer)
- Prisma ORM
- PostgreSQL
- Viem for blockchain interactions

**Frontend:**
- Next.js 15 (App Router)
- React 18
- TailwindCSS
- Wagmi v2 (wallet connection)
- RainbowKit (wallet UI)
- WebAuthn/Passkey API

**Infrastructure:**
- Arbitrum Sepolia (Layer 2)
- Ethereum Sepolia (Layer 1)
- Alchemy RPC endpoints

---

## 📦 Project Structure

```
PYPay/
├── packages/
│   ├── contracts/         # Solidity smart contracts
│   │   ├── src/           # Contract source code
│   │   ├── script/        # Deployment scripts
│   │   └── test/          # Contract tests
│   └── common/            # Shared TypeScript types
├── apps/
│   ├── indexer/           # Event indexer service
│   ├── relayer/           # UserOp relayer service
│   ├── cost-engine/       # Gas cost calculator
│   └── web/               # Next.js frontend
│       ├── app/           # App router pages
│       ├── lib/           # Frontend utilities
│       └── public/        # Static assets
├── docs/                  # Documentation
├── FLOW_DIAGRAM.md        # Visual flow chart
├── DEPLOYED_CONTRACTS.md  # Contract addresses
└── README.md              # This file
```

---

## 🔐 Security Features

- ✅ ERC-4337 Account Abstraction (standard)
- ✅ Session keys with time limits
- ✅ Guardian-based recovery (optional)
- ✅ PERMIT2 for secure approvals
- ✅ Paymaster stake requirements
- ✅ Bridge escrow with relayer ownership
- ✅ HMAC-secured bridge endpoints

---

## 🌐 Supported Chains

### Testnet (Current)
- Arbitrum Sepolia (421614)
- Ethereum Sepolia (11155111)

### Mainnet (Future)
- Arbitrum One
- Ethereum Mainnet
- Base
- Optimism
- Polygon

All chains with PYUSD support can be added via configuration.

---

## 📊 Live Contract Addresses

See [DEPLOYED_CONTRACTS.md](./DEPLOYED_CONTRACTS.md) for complete list of deployed contracts.

**Quick Reference:**
- **EntryPoint**: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (canonical v0.7)
- **Arbitrum PYUSD**: `0x637A1259C6afd7E3AdF63993cA7E58BB438aB1B1`
- **Ethereum PYUSD**: `0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9`
- **Indexer**: `http://localhost:3001`
- **Relayer**: `http://localhost:3002`

---

## 🧪 Testing

### Run Contract Tests
```bash
cd packages/contracts
forge test -vvv
```

### Run E2E Tests
```bash
cd apps/web
pnpm test:e2e
```

### Test Bridge Flow
```bash
# Create invoice on Ethereum Sepolia
# Fund customer account on Arbitrum Sepolia
# Complete checkout - bridge should trigger automatically
```

---

## 🛣️ Roadmap

### ✅ Phase 1: MVP (Completed)
- Merchant wallet connection
- Customer passkey authentication
- Direct payments
- Cross-chain bridging
- Gas sponsorship
- Multi-merchant support

### 🚧 Phase 2: Production (In Progress)
- Mainnet deployment
- Additional chain support
- Enhanced analytics
- Merchant API keys
- Webhook notifications

### 🔮 Phase 3: Scale
- Mobile SDK
- Plugin system (Shopify, WooCommerce)
- Recurring payments
- Batch settlements
- Advanced routing algorithms

---

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines (coming soon).

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see LICENSE file for details.

---

## 🙏 Acknowledgments

Built with:
- ERC-4337 Account Abstraction standard
- WebAuthn/Passkey standard
- PERMIT2 by Uniswap
- Viem by Paradigm
- Foundry by Paradigm

---

## 📞 Contact & Support

- **Documentation**: [FLOW_DIAGRAM.md](./FLOW_DIAGRAM.md)
- **Contract Addresses**: [DEPLOYED_CONTRACTS.md](./DEPLOYED_CONTRACTS.md)
- **Issues**: GitHub Issues
- **Discussion**: GitHub Discussions

---

**Built with ❤️ for the future of crypto payments**

---

## 🎯 For Hackathon Judges

### What Makes PyPay Special?

1. **Real Production System** - Not a demo, fully functional multi-merchant gateway
2. **Zero UX Friction** - Customers never see blockchain complexity
3. **Dual Auth Model** - Wallet for merchants, passkeys for customers
4. **True Cross-Chain** - Automatic bridging with full transparency
5. **Gas Sponsorship** - 100% gasless for end users
6. **Multi-Merchant** - No central authority, anyone can accept payments
7. **Complete Stack** - Smart contracts, backend services, frontend, all integrated

### Try It Live

1. Visit merchant portal: `http://localhost:3000/merchant`
2. Connect MetaMask
3. Create invoice
4. Scan QR code on mobile (or open link)
5. Authenticate with Face ID
6. Watch automatic bridge + settlement (if cross-chain)
7. Check transaction on block explorer

### Key Files to Review

- [FLOW_DIAGRAM.md](./FLOW_DIAGRAM.md) - Complete system flow
- [DEPLOYED_CONTRACTS.md](./DEPLOYED_CONTRACTS.md) - All contracts
- `packages/contracts/src/` - Smart contracts
- `apps/web/app/merchant/` - Merchant portal
- `apps/web/app/checkout/` - Customer checkout
- `apps/relayer/src/` - UserOp relayer
- `apps/indexer/src/` - Event indexer

---

**Last Updated**: October 23, 2025
