// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import "forge-std/Script.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IBridgeEscrow {
    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

/// @title FundBridgeInventory
/// @notice Mints PYUSD to BridgeEscrow and transfers ownership to relayer
contract FundBridgeInventory is Script {
    /// @notice Get the chain-specific suffix for environment variables
    function _chainSuffix() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 421614) return "ARBSEPOLIA";
        if (chainId == 11155111) return "SEPOLIA";
        if (chainId == 31337) return "ARBSEPOLIA"; // Anvil fork defaults to Arbitrum
        revert(string.concat("Unsupported chain ID: ", vm.toString(chainId)));
    }

    function run() external {
        // Detect chain and compose env var names
        string memory suffix = _chainSuffix();
        
        string memory pyusdKey = string.concat("PYUSD_", suffix);
        string memory bridgeEscrowKey = string.concat("BRIDGE_ESCROW_", suffix);
        
        address pyusd = vm.envAddress(pyusdKey);
        address bridgeEscrow = vm.envAddress(bridgeEscrowKey);
        
        // Relayer and keys are chain-agnostic
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 relayerPrivateKey = vm.envUint("RELAYER_PRIVATE_KEY");
        address relayer = vm.addr(relayerPrivateKey);
        
        console.log("Chain:", suffix);
        console.log("PYUSD:", pyusd);
        console.log("BridgeEscrow:", bridgeEscrow);
        console.log("Relayer:", relayer);
        
        // Start broadcasting as deployer (current owner)
        vm.startBroadcast(deployerPrivateKey);
        
        // Check current owner
        address currentOwner = IBridgeEscrow(bridgeEscrow).owner();
        console.log("Current owner:", currentOwner);
        
        // Transfer ownership to relayer
        IBridgeEscrow(bridgeEscrow).transferOwnership(relayer);
        console.log("Ownership transferred to relayer");

        // Transfer 10 PYUSD from deployer to BridgeEscrow (real PYUSD, not minted)
        uint256 inventoryAmount = 10 * 1e6; // 10 PYUSD (6 decimals)
        
        // Check deployer balance first
        address deployer = vm.addr(deployerPrivateKey);
        uint256 deployerBalance = IERC20(pyusd).balanceOf(deployer);
        console.log("Deployer PYUSD balance:", deployerBalance);
        require(deployerBalance >= inventoryAmount, "Insufficient PYUSD balance");
        
        // Transfer PYUSD to BridgeEscrow
        bool success = IERC20(pyusd).transfer(bridgeEscrow, inventoryAmount);
        require(success, "Transfer failed");
        console.log("Transferred PYUSD to BridgeEscrow:", inventoryAmount);
        
        uint256 balance = IERC20(pyusd).balanceOf(bridgeEscrow);
        console.log("BridgeEscrow PYUSD balance:", balance);
        
        vm.stopBroadcast();
    }
}
