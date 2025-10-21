
# Start Anvil fork for Arbitrum Sepolia (port 8545)
anvil --fork-url https://arb-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl --port 8545

# Start Anvil fork for Ethereum Sepolia (port 8546)
anvil --fork-url https://eth-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl --port 8546





# Setup contracts directory and environment variables
cd packages/contracts

[ -f .env ] || ln -s ../../.env .env

export ARBITRUM_SEPOLIA_RPC=http://localhost:8545
export SEPOLIA_RPC=http://localhost:8546
export DEPLOYER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
export PAYMASTER_OWNER_PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
export ENTRYPOINT=0x0000000071727De22E5E9d8BAf0edAc6f37da032

# Deploy Mock PYUSD token to Arbitrum Sepolia
forge script script/DeployMockPYUSD.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy Mock PYUSD token to Ethereum Sepolia
forge script script/DeployMockPYUSD.s.sol --rpc-url http://localhost:8546 --broadcast


# Deploy all core contracts to Arbitrum Sepolia
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast

# Deploy all core contracts to Ethereum Sepolia
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8546 \
  --broadcast




# Save deployed PYUSD token addresses
export PYUSD_SEPOLIA=0xa5585D2EDF0f96f460D1955381267fC2cb5a430d
export PYUSD_ARBSEPOLIA=0x3524E03B46e05Df7c6ba9836D04DBFAB409c03d1


# Mint test PYUSD to deployer on Arbitrum Sepolia
cast send $PYUSD_ARBSEPOLIA "faucet(uint256)" 10000 \
  --rpc-url http://localhost:8545 \
  --private-key $DEPLOYER_PRIVATE_KEY

# Mint test PYUSD to deployer on Ethereum Sepolia
cast send $PYUSD_SEPOLIA "faucet(uint256)" 10000 \
  --rpc-url http://localhost:8546 \
  --private-key $DEPLOYER_PRIVATE_KEY


# Stake paymaster on Arbitrum Sepolia (1 ETH for reputation)
forge script script/StakePaymaster.s.sol --rpc-url http://localhost:8545 --broadcast

# Stake paymaster on Ethereum Sepolia (1 ETH for reputation)
forge script script/StakePaymaster.s.sol --rpc-url http://localhost:8546 --broadcast

# Save deployed paymaster addresses
export PAYMASTER_ARBSEPOLIA=0x2ec6622F4Ea3315DB6045d7C4947F63581090568
export PAYMASTER_SEPOLIA=0xb792cC6F4cC1514cF0fFF3e6cA559D287be2139C

# Deposit 2 ETH to paymaster on Arbitrum Sepolia (operational funds for gas)
cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_ARBSEPOLIA \
  --value 2ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY


# Deposit 2 ETH to paymaster on Ethereum Sepolia (operational funds for gas)
cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_SEPOLIA \
  --value 2ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY


# Create smart account on Arbitrum Sepolia
forge script script/CreateStandaloneAccount.s.sol:CreateStandaloneAccount \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv

# Create smart account on Ethereum Sepolia
forge script script/CreateStandaloneAccount.s.sol:CreateStandaloneAccount \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv


# Save created smart account addresses
export SMART_ACCOUNT_ARBSEPOLIA=0xF3f2F0f75175B5ed7f1247c8D1B9FE7D166EE31c
export SMART_ACCOUNT_SEPOLIA=0x67bDBAfAa09C5c172D336aAbD1ECe61b6296Ef4f
export OWNER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
export GUARDIAN=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Fund smart account with 1 ETH on Arbitrum Sepolia
cast send $SMART_ACCOUNT_ARBSEPOLIA \
  --value 1ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

# Fund smart account with 1 ETH on Ethereum Sepolia
cast send $SMART_ACCOUNT_SEPOLIA \
  --value 1ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

# Mint 5000 PYUSD to smart account on Arbitrum Sepolia
cast send $PYUSD_ARBSEPOLIA \
  "mint(address,uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  5000000000 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY




# Approve Checkout to spend PYUSD from smart account on Arbitrum Sepolia
forge script script/ApproveCheckout.s.sol:ApproveCheckout \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv

# Approve Checkout to spend PYUSD from smart account on Ethereum Sepolia
forge script script/ApproveCheckout.s.sol:ApproveCheckout \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv

# Approve BridgeEscrow to spend PYUSD from smart account on Arbitrum Sepolia
forge script script/ApproveBridge.s.sol:ApproveBridge \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv

# Approve BridgeEscrow to spend PYUSD from smart account on Ethereum Sepolia
forge script script/ApproveBridge.s.sol:ApproveBridge \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv



# === BRIDGE SETUP ===

# Fund BridgeEscrow on Arbitrum Sepolia with inventory and transfer ownership
export PYUSD_ADDRESS=0x3524E03B46e05Df7c6ba9836D04DBFAB409c03d1
export BRIDGE_ESCROW_ADDRESS=0x07150543b2F1fda0de261E80f6C1e75EE6046aDf
export RELAYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export OWNER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
forge script script/FundBridgeInventory.s.sol --rpc-url http://localhost:8545 --broadcast

# Fund BridgeEscrow on Ethereum Sepolia with inventory and transfer ownership
export PYUSD_ADDRESS=0xa5585D2EDF0f96f460D1955381267fC2cb5a430d
export BRIDGE_ESCROW_ADDRESS=0x77D835ac543d6Bb92d98A6D817C30dE00b8CE948
export RELAYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export OWNER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
forge script script/FundBridgeInventory.s.sol --rpc-url http://localhost:8546 --broadcast


# Register test merchant on Arbitrum Sepolia
forge script script/SeedMerchant.s.sol --rpc-url http://localhost:8545 --broadcast

# Register test merchant on Ethereum Sepolia
forge script script/SeedMerchant.s.sol --rpc-url http://localhost:8546 --broadcast


# Mint 5000 PYUSD to smart account on Ethereum Sepolia
cast send $PYUSD_SEPOLIA \
  "mint(address,uint256)" \
  $SMART_ACCOUNT_SEPOLIA \
  5000000000 \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY



  
# Setup Prisma database schema
cd apps/indexer

pnpm prisma generate

# Run database migrations
pnpm prisma migrate deploy

# Open Prisma Studio (database GUI)
pnpm prisma studio





# Build all packages
cd ../..
pnpm build





# Start Indexer service (watches blockchain events)
cd apps/indexer
ARBITRUM_SEPOLIA_RPC=http://localhost:8545 ETHEREUM_SEPOLIA_RPC=http://localhost:8546 INDEXER_PORT=3001 INDEXER_SKIP_CATCHUP=true pnpm dev
# Health: http://localhost:3001/health


# Start Relayer service (handles UserOps and session keys)
cd apps/relayer
pnpm dev
# Health: http://localhost:3002/health


# Start Cost Engine service (tracks gas prices)
cd apps/cost-engine
pnpm dev

# Start Web frontend
cd apps/web
pnpm dev
# Open: http://localhost:3000







# === VERIFICATION COMMANDS (Optional) ===

# Check paymaster deposit balance on Arbitrum Sepolia
cast call $ENTRYPOINT \
  "balanceOf(address)(uint256)" \
  $PAYMASTER_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC

# Check paymaster deposit balance on Ethereum Sepolia
cast call $ENTRYPOINT \
  "balanceOf(address)(uint256)" \
  $PAYMASTER_SEPOLIA \
  --rpc-url $SEPOLIA_RPC

# Check paymaster stake info on Arbitrum Sepolia
cast call $ENTRYPOINT \
  "getDepositInfo(address)((uint256,bool,uint112,uint32,uint48))" \
  $PAYMASTER_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC

# Check paymaster stake info on Ethereum Sepolia
cast call $ENTRYPOINT \
  "getDepositInfo(address)((uint256,bool,uint112,uint32,uint48))" \
  $PAYMASTER_SEPOLIA \
  --rpc-url $SEPOLIA_RPC

# Check smart account PYUSD balance on Arbitrum Sepolia
cast call $PYUSD_ARBSEPOLIA \
  "balanceOf(address)(uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC

# Check smart account PYUSD balance on Ethereum Sepolia
cast call $PYUSD_SEPOLIA \
  "balanceOf(address)(uint256)" \
  $SMART_ACCOUNT_SEPOLIA \
  --rpc-url $SEPOLIA_RPC

# Check guardian ETH balance on Arbitrum Sepolia
cast balance $GUARDIAN --rpc-url $ARBITRUM_SEPOLIA_RPC


# Save Checkout contract addresses
export CHECKOUT_SEPOLIA=0xa45Ec65FaDB8AE3b61b330906123644f1aef544c
export CHECKOUT_ARBSEPOLIA=0xf588f57BE135813d305815Dc3E71960c97987b19

# Verify PYUSD approval to Checkout on Arbitrum Sepolia
cast call $PYUSD_ARBSEPOLIA \
  "allowance(address,address)(uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  $CHECKOUT_ARBSEPOLIA \
  --rpc-url $ARBITRUM_SEPOLIA_RPC


# Verify PYUSD approval to Checkout on Ethereum Sepolia
cast call $PYUSD_SEPOLIA \
  "allowance(address,address)(uint256)" \
  $SMART_ACCOUNT_SEPOLIA \
  $CHECKOUT_SEPOLIA \
  --rpc-url $SEPOLIA_RPC




#EXTRA  
cast call 0x07150543b2F1fda0de261E80f6C1e75EE6046aDf "getAddress(address,address,uint256)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0 --rpc-url http://localhost:8545
