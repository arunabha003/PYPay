// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import "forge-std/Script.sol";

interface IERC20 {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

interface IBridgeEscrow {
    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

/// @title FundBridgeInventory
/// @notice Mints PYUSD to BridgeEscrow and transfers ownership to relayer
contract FundBridgeInventory is Script {
    function run() external {
        // Get environment variables
        address pyusd = vm.envAddress("PYUSD_ADDRESS");
        address bridgeEscrow = vm.envAddress("BRIDGE_ESCROW_ADDRESS");
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        
        console.log("PYUSD:", pyusd);
        console.log("BridgeEscrow:", bridgeEscrow);
        console.log("Relayer:", relayer);
        
        // Start broadcasting as OWNER
        vm.startBroadcast(ownerPrivateKey);
        
        // Check current owner
        address currentOwner = IBridgeEscrow(bridgeEscrow).owner();
        console.log("Current owner:", currentOwner);
        
        // Transfer ownership to relayer
        IBridgeEscrow(bridgeEscrow).transferOwnership(relayer);
        console.log("Ownership transferred to relayer");
        
        vm.stopBroadcast();
        
        // Mint 100,000 PYUSD to BridgeEscrow (as deployer who owns MockPYUSD)
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        uint256 inventoryAmount = 100_000 * 1e6; // 100k PYUSD (6 decimals)
        IERC20(pyusd).mint(bridgeEscrow, inventoryAmount);
        console.log("Minted PYUSD to BridgeEscrow:", inventoryAmount);
        
        uint256 balance = IERC20(pyusd).balanceOf(bridgeEscrow);
        console.log("BridgeEscrow PYUSD balance:", balance);
        
        vm.stopBroadcast();
    }
}
