# Local run / dev bootstrap (sanitized)

First, set `.env` and `.env.local` with your local values (RPC URLs, private keys, addresses) before running these steps.

**Before running any commands, export the required variables with your actual values:**

## Notes

- This file contains example commands to run a complete local dev environment (forks, deploy, seed, services).
- All hardcoded secrets and addresses have been replaced with dummy placeholders or environment variables.
- Run these commands in a bash shell. Export the real values into `.env` and your environment.

## Start Anvil Forks

### Start Anvil fork for Arbitrum Sepolia (port 8545)
```bash
anvil --fork-url https://arb-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl --port 8545
```

### Start Anvil fork for Ethereum Sepolia (port 8546)
```bash
anvil --fork-url https://eth-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl --port 8546
```





## Setup Contracts Directory and Environment Variables

```bash
cd packages/contracts

[ -f .env ] || ln -s ../../.env .env

export ARBITRUM_SEPOLIA_RPC=http://localhost:8545
export SEPOLIA_RPC=http://localhost:8546
export DEPLOYER_PRIVATE_KEY=<YOUR_DEPLOYER_PRIVATE_KEY>
export PAYMASTER_OWNER_PRIVATE_KEY=<YOUR_PAYMASTER_OWNER_PRIVATE_KEY>
export ENTRYPOINT=<ENTRYPOINT_ADDRESS>
```

## Deploy Mock PYUSD Tokens

### Deploy Mock PYUSD token to Arbitrum Sepolia
```bash
forge script script/DeployMockPYUSD.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Deploy Mock PYUSD token to Ethereum Sepolia
```bash
forge script script/DeployMockPYUSD.s.sol --rpc-url http://localhost:8546 --broadcast
```

## Deploy Core Contracts

### Deploy all core contracts to Arbitrum Sepolia
```bash
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast
```

### Deploy all core contracts to Ethereum Sepolia
```bash
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8546 \
  --broadcast
```




## Save Deployed PYUSD Token Addresses

```bash
export PYUSD_SEPOLIA=<DEPLOYED_PYUSD_SEPOLIA_ADDRESS>
export PYUSD_ARBSEPOLIA=<DEPLOYED_PYUSD_ARBSEPOLIA_ADDRESS>
```

## Mint Test PYUSD to Deployer

### Mint test PYUSD to deployer on Arbitrum Sepolia
```bash
cast send $PYUSD_ARBSEPOLIA "faucet(uint256)" 10000 \
  --rpc-url http://localhost:8545 \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Mint test PYUSD to deployer on Ethereum Sepolia
```bash
cast send $PYUSD_SEPOLIA "faucet(uint256)" 10000 \
  --rpc-url http://localhost:8546 \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Stake Paymaster

### Stake paymaster on Arbitrum Sepolia (1 ETH for reputation)
```bash
forge script script/StakePaymaster.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Stake paymaster on Ethereum Sepolia (1 ETH for reputation)
```bash
forge script script/StakePaymaster.s.sol --rpc-url http://localhost:8546 --broadcast
```

### Save deployed paymaster addresses
```bash
export PAYMASTER_ARBSEPOLIA=<DEPLOYED_PAYMASTER_ARBSEPOLIA_ADDRESS>
export PAYMASTER_SEPOLIA=<DEPLOYED_PAYMASTER_SEPOLIA_ADDRESS>
```

## Deposit ETH to Paymaster

### Deposit 2 ETH to paymaster on Arbitrum Sepolia (operational funds for gas)
```bash
cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_ARBSEPOLIA \
  --value 2ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Deposit 2 ETH to paymaster on Ethereum Sepolia (operational funds for gas)
```bash
cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_SEPOLIA \
  --value 2ether \
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

### Fund smart account with 1 ETH on Arbitrum Sepolia
```bash
cast send $SMART_ACCOUNT_ARBSEPOLIA \
  --value 1ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Fund smart account with 1 ETH on Ethereum Sepolia
```bash
cast send $SMART_ACCOUNT_SEPOLIA \
  --value 1ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Mint 5000 PYUSD to smart account on Arbitrum Sepolia
```bash
cast send $PYUSD_ARBSEPOLIA \
  "mint(address,uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  5000000000 \
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



## Bridge Setup

### Fund BridgeEscrow on Arbitrum Sepolia with inventory and transfer ownership
```bash
export PYUSD_ADDRESS=<PYUSD_ARBSEPOLIA_ADDRESS>
export BRIDGE_ESCROW_ADDRESS=<BRIDGE_ESCROW_ARBSEPOLIA_ADDRESS>
export RELAYER_ADDRESS=<RELAYER_ADDRESS>
export OWNER_PRIVATE_KEY=<OWNER_PRIVATE_KEY>
forge script script/FundBridgeInventory.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Fund BridgeEscrow on Ethereum Sepolia with inventory and transfer ownership
```bash
export PYUSD_ADDRESS=<PYUSD_SEPOLIA_ADDRESS>
export BRIDGE_ESCROW_ADDRESS=<BRIDGE_ESCROW_SEPOLIA_ADDRESS>
export RELAYER_ADDRESS=<RELAYER_ADDRESS>
export OWNER_PRIVATE_KEY=<OWNER_PRIVATE_KEY>
forge script script/FundBridgeInventory.s.sol --rpc-url http://localhost:8546 --broadcast
```

## Register Test Merchants

### Register test merchant on Arbitrum Sepolia
```bash
forge script script/SeedMerchant.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Register test merchant on Ethereum Sepolia
```bash
forge script script/SeedMerchant.s.sol --rpc-url http://localhost:8546 --broadcast
```

## Mint Additional PYUSD (Skip this if you're testing the bridging flow)

### Mint 5000 PYUSD to smart account on Ethereum Sepolia
```bash
cast send $PYUSD_SEPOLIA \
  "mint(address,uint256)" \
  $SMART_ACCOUNT_SEPOLIA \
  5000000000 \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```



  
## Setup Database

### Setup Prisma database schema
```bash
cd apps/indexer

pnpm prisma generate

# Run database migrations
pnpm prisma migrate deploy

# Open Prisma Studio (database GUI)
pnpm prisma studio
```





## Build All Packages

```bash
cd ../..
pnpm build
```





## Start Services

### Start Indexer service (watches blockchain events)
```bash
cd apps/indexer
ARBITRUM_SEPOLIA_RPC=http://localhost:8545 ETHEREUM_SEPOLIA_RPC=http://localhost:8546 INDEXER_PORT=3001 INDEXER_SKIP_CATCHUP=true pnpm dev
# Health: http://localhost:3001/health
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







## Verification Commands (Optional)

### Check paymaster deposit balance on Arbitrum Sepolia
```bash
cast call $ENTRYPOINT \
  "balanceOf(address)(uint256)" \
  $PAYMASTER_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC
```

### Check paymaster deposit balance on Ethereum Sepolia
```bash
cast call $ENTRYPOINT \
  "balanceOf(address)(uint256)" \
  $PAYMASTER_SEPOLIA \
  --rpc-url $SEPOLIA_RPC
```

### Check paymaster stake info on Arbitrum Sepolia
```bash
cast call $ENTRYPOINT \
  "getDepositInfo(address)((uint256,bool,uint112,uint32,uint48))" \
  $PAYMASTER_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC
```

### Check paymaster stake info on Ethereum Sepolia
```bash
cast call $ENTRYPOINT \
  "getDepositInfo(address)((uint256,bool,uint112,uint32,uint48))" \
  $PAYMASTER_SEPOLIA \
  --rpc-url $SEPOLIA_RPC
```

### Check smart account PYUSD balance on Arbitrum Sepolia
```bash
cast call $PYUSD_ARBSEPOLIA \
  "balanceOf(address)(uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC
```

### Check smart account PYUSD balance on Ethereum Sepolia
```bash
cast call $PYUSD_SEPOLIA \
  "balanceOf(address)(uint256)" \
  $SMART_ACCOUNT_SEPOLIA \
  --rpc-url $SEPOLIA_RPC
```

### Check guardian ETH balance on Arbitrum Sepolia
```bash
cast balance $GUARDIAN --rpc-url $ARBITRUM_SEPOLIA_RPC
```


### Save Checkout contract addresses
```bash
export CHECKOUT_SEPOLIA=<DEPLOYED_CHECKOUT_SEPOLIA_ADDRESS>
export CHECKOUT_ARBSEPOLIA=<DEPLOYED_CHECKOUT_ARBSEPOLIA_ADDRESS>
```

### Verify PYUSD approval to Checkout on Arbitrum Sepolia
```bash
cast call $PYUSD_ARBSEPOLIA \
  "allowance(address,address)(uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  $CHECKOUT_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC
```

### Verify PYUSD approval to Checkout on Ethereum Sepolia
```bash
cast call $PYUSD_SEPOLIA \
  "allowance(address,address)(uint256)" \
  $SMART_ACCOUNT_SEPOLIA \
  $CHECKOUT_SEPOLIA \
  --rpc-url $SEPOLIA_RPC
```



