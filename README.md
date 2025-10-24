# PyPay - Passwordless Cross-Chain PYUSD Payments

PyPay is a production-ready payment gateway that enables merchants to accept PYUSD (PayPal USD) with zero user friction. Customers pay with Face ID/Touch ID passkeys, while merchants connect their existing wallets. The system automatically handles cross-chain bridging, gas sponsorship, and payment settlement.

![PyPay Architecture](docs/technical_diagram.png)

## Protocol Overview

PyPay enables passwordless, gasless PYUSD payments: customers authenticate with WebAuthn passkeys while merchants use EOA wallets. The system uses ERC‑4337 counterfactual accounts (CREATE2) plus short‑lived session keys to minimize user friction; a paymaster sponsors gas and a cost engine routes payments (direct vs bridge). For cross‑chain transfers a BridgeEscrow + relayer perform inventory‑backed lock-and-release settlement.

**Technical Implementation:** Uses EIP-4337, EIP-2612/Permit2, EIP-712, EIP-1271, and EIP-1967. Core on‑chain pieces: AccountFactory, TapKitAccount , Checkout , TapKitPaymaster, BridgeEscrow. 
Off‑chain: relayer, indexer, cost‑engine.

**Architecture:** Smart contracts include Account Factory, Checkout, Paymaster, Bridge Escrow, and Session Policy. Backend services comprise Indexer (event monitoring), Relayer (UserOp submission), and Cost Engine (gas calculations). Frontend uses Next.js merchant portal and customer checkout with WebAuthn integration.

**Tech Stack:** Solidity 0.8.28, Foundry, ERC-4337, PERMIT2, Solady, OpenZeppelin; TypeScript, Fastify, Prisma, PostgreSQL, Viem, Next.js 15, React 18, TailwindCSS, Wagmi v2, WebAuthn,Alchemy.

**Supported Chains:** Testnet (Arbitrum Sepolia, Ethereum Sepolia). 



## Documentation

- **[Technical Flow](docs/TECHNICAL_FLOW.md)** - Complete payment flow with visual diagram
- **[Technical Reference](docs/TECHNICAL_REFERENCE.md)** - Architecture and implementation details
- **[Testnet Deployment](docs/TESTNET_DEPLOYMENT_GUIDE.md)** - Step-by-step deployment guide
- **[Local Testing Guide](docs/LOCAL_TESTING_GUIDE.md)** - How to test the system locally

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Foundry
- PostgreSQL

### Setup
```bash
git clone <repository-url>
cd PYPay
pnpm install
cp env.example .env
# Configure your environment variables
```



## Testing

```bash
# Contract tests
cd packages/contracts
forge test -vvv

```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.
