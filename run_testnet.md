cd packages/contracts

[ -f .env ] || ln -s ../../.env .env


export ARBITRUM_SEPOLIA_RPC=https://arb-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl
export SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl
export DEPLOYER_PRIVATE_KEY=0x361ead28996cd9eec0811785bc7e94342ec8eb3156f73303a8706f2cb70cd9b9
export PAYMASTER_OWNER_PRIVATE_KEY=0x361ead28996cd9eec0811785bc7e94342ec8eb3156f73303a8706f2cb70cd9b9
export ENTRYPOINT=0x0000000071727De22E5E9d8BAf0edAc6f37da032


forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv


forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv


forge script script/StakePaymaster.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast

forge script script/StakePaymaster.s.sol --rpc-url $SEPOLIA_RPC --broadcast



export PAYMASTER_ARBSEPOLIA=0xC54bBF5A6FC2D72A25985eba2eb385b3340c29a6
export PAYMASTER_SEPOLIA=0xe6257bd26941cB6C3B977Fe2b2859aE7180396a4

cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_ARBSEPOLIA \
  --value 0.02ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY


cast send $ENTRYPOINT \
  "depositTo(address)" \
  $PAYMASTER_SEPOLIA \
  --value 0.02ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

forge script script/CreateStandaloneAccount.s.sol:CreateStandaloneAccount \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv

forge script script/CreateStandaloneAccount.s.sol:CreateStandaloneAccount \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv


export SMART_ACCOUNT_ARBSEPOLIA=0xc5603937d2056a05A7E71D39f2E58cEf18C3271a
export SMART_ACCOUNT_SEPOLIA=0xe2c55e352C5AfE9acF2AEbF9f48d631672658002
export OWNER=0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814
export GUARDIAN=0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814



cast send $SMART_ACCOUNT_ARBSEPOLIA \
  --value 0.1ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

cast send $SMART_ACCOUNT_SEPOLIA \
  --value 0.1ether \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

export PYUSD_SEPOLIA=0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9
export PYUSD_ARBSEPOLIA=0x637A1259C6afd7E3AdF63993cA7E58BB438aB1B1

cast send $PYUSD_ARBSEPOLIA \
  "transfer(address,uint256)" \
  $SMART_ACCOUNT_ARBSEPOLIA \
  1000000 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY



forge script script/ApproveCheckout.s.sol:ApproveCheckout \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv

forge script script/ApproveCheckout.s.sol:ApproveCheckout \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv


forge script script/ApproveBridge.s.sol:ApproveBridge \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  -vvvv

forge script script/ApproveBridge.s.sol:ApproveBridge \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  -vvvv


forge script script/SeedMerchant.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast

forge script script/SeedMerchant.s.sol --rpc-url $SEPOLIA_RPC --broadcast



export RELAYER_ADDRESS=0x28ea4eF61ac4cca3ed6a64dBb5b2D4be1aDC9814

forge script script/FundBridgeInventory.s.sol --rpc-url  $ARBITRUM_SEPOLIA_RPC --broadcast

forge script script/FundBridgeInventory.s.sol --rpc-url $SEPOLIA_RPC --broadcast


cd apps/indexer
ARBITRUM_SEPOLIA_RPC=https://arb-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl
ETHEREUM_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/xiJw6cj_7U8PXLSncrSON78PWDXP4Dkl INDEXER_PORT=3001 INDEXER_SKIP_CATCHUP=true pnpm dev
