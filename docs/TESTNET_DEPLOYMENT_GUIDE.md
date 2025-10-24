# Testnet Deployment Script (sanitized)

This script deploys the PYPay system to testnet (Arbitrum Sepolia and Ethereum Sepolia) for testing purposes.

## Notes

- This file contains commands to deploy and configure the complete system on testnet.
- All hardcoded secrets and addresses have been replaced with dummy placeholders or environment variables.
- Run these commands in a bash shell. Export the real values into `.env` and your environment.
- This is for testnet deployment before testing - use real testnet RPC URLs and testnet private keys.

**Before running any commands, export the required variables with your actual testnet values:**

```bash
cd packages/contracts

[ -f .env ] || ln -s ../../.env .env

export ARBITRUM_SEPOLIA_RPC=<YOUR_ARBITRUM_SEPOLIA_RPC_URL>
export SEPOLIA_RPC=<YOUR_ETHEREUM_SEPOLIA_RPC_URL>
export DEPLOYER_PRIVATE_KEY=<YOUR_TESTNET_DEPLOYER_PRIVATE_KEY>
export PAYMASTER_OWNER_PRIVATE_KEY=<YOUR_TESTNET_PAYMASTER_OWNER_PRIVATE_KEY>
export ENTRYPOINT=<ENTRYPOINT_ADDRESS>
```


## Deploy Core Contracts

### Deploy all core contracts to Arbitrum Sepolia
```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv
```

### Deploy all core contracts to Ethereum Sepolia
```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

## Stake Paymaster

### Stake paymaster on Arbitrum Sepolia (1 ETH for reputation)
```bash
forge script script/StakePaymaster.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
```

### Stake paymaster on Ethereum Sepolia (1 ETH for reputation)
```bash
forge script script/StakePaymaster.s.sol --rpc-url $SEPOLIA_RPC --broadcast
```

### Save deployed paymaster addresses
```bash
export PAYMASTER_ARBSEPOLIA=<DEPLOYED_PAYMASTER_ARBSEPOLIA_ADDRESS>
export PAYMASTER_SEPOLIA=<DEPLOYED_PAYMASTER_SEPOLIA_ADDRESS>
```

## Deposit ETH to Paymaster

### Deposit 0.02 ETH to paymaster on Arbitrum Sepolia (operational funds for gas)
```bash
cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_ARBSEPOLIA \
  --value 0.02ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Deposit 0.02 ETH to paymaster on Ethereum Sepolia (operational funds for gas)
```bash
cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_SEPOLIA \
  --value 0.02ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Create Smart Accounts

### Create smart account on Arbitrum Sepolia
```bash
forge script script/CreateStandaloneAccount.s.sol:CreateStandaloneAccount \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

### Create smart account on Ethereum Sepolia
```bash
forge script script/CreateStandaloneAccount.s.sol:CreateStandaloneAccount \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

### Save created smart account addresses
```bash
export SMART_ACCOUNT_ARBSEPOLIA=<CREATED_SMART_ACCOUNT_ARBSEPOLIA_ADDRESS>
export SMART_ACCOUNT_SEPOLIA=<CREATED_SMART_ACCOUNT_SEPOLIA_ADDRESS>
export OWNER=<SMART_ACCOUNT_OWNER_ADDRESS>
export GUARDIAN=<SMART_ACCOUNT_GUARDIAN_ADDRESS>
```



## Fund Smart Accounts

### Fund smart account with 0.1 ETH on Arbitrum Sepolia
```bash
cast send $SMART_ACCOUNT_ARBSEPOLIA \
  --value 0.1ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Fund smart account with 0.1 ETH on Ethereum Sepolia
```bash
cast send $SMART_ACCOUNT_SEPOLIA \
  --value 0.1ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Save PYUSD Token Addresses

```bash
export PYUSD_SEPOLIA=<DEPLOYED_PYUSD_SEPOLIA_ADDRESS>
export PYUSD_ARBSEPOLIA=<DEPLOYED_PYUSD_ARBSEPOLIA_ADDRESS>
```

## Transfer PYUSD to Smart Account

### Transfer 10,000,000 PYUSD to smart account on Arbitrum Sepolia
```bash
cast send $PYUSD_ARBSEPOLIA \
  "transfer(address,uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  10000000 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```



## Approve Contracts

### Approve Checkout to spend PYUSD from smart account on Arbitrum Sepolia
```bash
forge script script/ApproveCheckout.s.sol:ApproveCheckout \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

### Approve Checkout to spend PYUSD from smart account on Ethereum Sepolia
```bash
forge script script/ApproveCheckout.s.sol:ApproveCheckout \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

### Approve BridgeEscrow to spend PYUSD from smart account on Arbitrum Sepolia
```bash
forge script script/ApproveBridge.s.sol:ApproveBridge \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

### Approve BridgeEscrow to spend PYUSD from smart account on Ethereum Sepolia
```bash
forge script script/ApproveBridge.s.sol:ApproveBridge \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv
```

## Register Test Merchants

### Register test merchant on Arbitrum Sepolia
```bash
forge script script/SeedMerchant.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
```

### Register test merchant on Ethereum Sepolia
```bash
forge script script/SeedMerchant.s.sol --rpc-url $SEPOLIA_RPC --broadcast
```

### Save relayer address
```bash
export RELAYER_ADDRESS=<RELAYER_ADDRESS>
```

## Fund Bridge Inventory (Skip this if you're testing the bridging flow)

### Fund BridgeEscrow on Arbitrum Sepolia with inventory
```bash
forge script script/FundBridgeInventory.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
```

### Fund BridgeEscrow on Ethereum Sepolia with inventory
```bash
forge script script/FundBridgeInventory.s.sol --rpc-url $SEPOLIA_RPC --broadcast
```

## Start Services

### Start Indexer service (watches blockchain events)
```bash
cd apps/indexer
ARBITRUM_SEPOLIA_RPC=$ARBITRUM_SEPOLIA_RPC ETHEREUM_SEPOLIA_RPC=$SEPOLIA_RPC INDEXER_PORT=3001 INDEXER_SKIP_CATCHUP=true pnpm dev
```

### Start Relayer service (handles UserOps and session keys)
```bash
cd apps/relayer
pnpm dev
# Health: http://localhost:3002/health
```

### Start Cost Engine service (tracks gas prices)
```bash
cd apps/cost-engine
pnpm dev
```

### Start Web frontend
```bash
cd apps/web
pnpm dev
# Open: http://localhost:3000
```
