
anvil --fork-url https://arb-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl --port 8545

anvil --fork-url https://eth-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl --port 8546





cd packages/contracts

[ -f .env ] || ln -s ../../.env .env

forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast

forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8546 \
  --broadcast



forge script script/StakePaymaster.s.sol --rpc-url http://localhost:8545 --broadcast
forge script script/StakePaymaster.s.sol --rpc-url http://localhost:8546 --broadcast



forge script script/SeedMerchant.s.sol --rpc-url http://localhost:8545 --broadcast
forge script script/SeedMerchant.s.sol --rpc-url http://localhost:8546 --broadcast


forge script script/DeployMockPYUSD.s.sol --rpc-url http://localhost:8545 --broadcast
forge script script/DeployMockPYUSD.s.sol --rpc-url http://localhost:8546 --broadcast



export PYUSD_ARBSEPOLIA=0x2ec6622F4Ea3315DB6045d7C4947F63581090568
export PYUSD_SEPOLIA=0x39E98Cd34D28A51fdD3bcfe0BB9BF7941ffC71e9
export DEPLOYER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
cast send $PYUSD_ARBSEPOLIA "faucet(uint256)" 10000 \
  --rpc-url http://localhost:8545 \
  --private-key $DEPLOYER_PRIVATE_KEY

cast send $PYUSD_SEPOLIA "faucet(uint256)" 10000 \
  --rpc-url http://localhost:8546 \
  --private-key $DEPLOYER_PRIVATE_KEY





cd apps/indexer

pnpm prisma generate

pnpm prisma migrate deploy

pnpm prisma studio





cd ../..
pnpm build





cd apps/indexer
ARBITRUM_SEPOLIA_RPC=http://localhost:8545 ETHEREUM_SEPOLIA_RPC=http://localhost:8546 INDEXER_PORT=3001 INDEXER_SKIP_CATCHUP=true pnpm dev
# Health: http://localhost:3001/health


cd apps/relayer
pnpm dev
# Health: http://localhost:3002/health


cd apps/cost-engine
pnpm dev

cd apps/web
pnpm dev
# Open: http://localhost:3000





# ============================================
# 6. Test Invoice Creation
# ============================================
cd packages/contracts

# Create invoice on Arbitrum Sepolia
cast send $INVOICE_ARBSEPOLIA \
  "createInvoice(address,uint256,uint64,bytes32,uint256,bytes32)" \
  $TEST_MERCHANT_ARBSEPOLIA \
  10000000 \
  $(($(date +%s) + 3600)) \
  0x$(echo -n "Test invoice" | sha256sum | cut -d' ' -f1) \
  421614 \
  0x$(openssl rand -hex 32) \
  --rpc-url http://localhost:8545 \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify in indexer
curl "http://localhost:3001/merchant/$TEST_MERCHANT_ARBSEPOLIA/invoices" | jq

# ============================================
# 7. Mint PYUSD for Testing
# ============================================
# Mint to deployer account


# Check balance
cast call $PYUSD_ARBSEPOLIA \
  "balanceOf(address)(uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
