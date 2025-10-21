// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IAccount {
    function execute(address target, uint256 value, bytes calldata data) external;
}

/// @notice Approve BridgeEscrow contract to spend PYUSD from Smart Account
/// @dev Works with both Arbitrum Sepolia and Ethereum Sepolia
contract ApproveBridge is Script {
    function run() external {
        // Get chain suffix for env var lookup
        string memory suffix = _chainSuffix();
        console2.log("Chain detected:", suffix);
        
        // Read addresses from env with chain suffix
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        string memory accountKey = string.concat("SMART_ACCOUNT_", suffix);
        string memory pyusdKey = string.concat("PYUSD_", suffix);
        
        address smartAccount = vm.envAddress(accountKey);
        address pyusd = vm.envAddress(pyusdKey);
        address bridgeEscrow = 0x07150543b2F1fda0de261E80f6C1e75EE6046aDf; // Same on both chains
        
        require(smartAccount != address(0), "Smart account address not set");
        require(pyusd != address(0), "PYUSD address not set");
        
        console2.log("\n=== Approval Configuration ===");
        console2.log("Smart Account:", smartAccount);
        console2.log("PYUSD Token:", pyusd);
        console2.log("BridgeEscrow Contract:", bridgeEscrow);
        
        // Check current allowance
        uint256 currentAllowance = IERC20(pyusd).allowance(smartAccount, bridgeEscrow);
        console2.log("\nCurrent allowance:", currentAllowance);
        
        if (currentAllowance == type(uint256).max) {
            console2.log("Already approved! No action needed.");
            return;
        }
        
        // Encode approve call for max uint256
        bytes memory approveData = abi.encodeWithSelector(
            IERC20.approve.selector,
            bridgeEscrow,
            type(uint256).max
        );
        
        console2.log("\nExecuting approval...");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Execute through smart account
        IAccount(smartAccount).execute(pyusd, 0, approveData);
        
        vm.stopBroadcast();
        
        // Verify approval
        uint256 newAllowance = IERC20(pyusd).allowance(smartAccount, bridgeEscrow);
        console2.log("\n=== Approval Successful ===");
        console2.log("New allowance:", newAllowance);
        console2.log("Max uint256:", type(uint256).max);
        
        require(newAllowance == type(uint256).max, "Approval verification failed");
        console2.log("\nBridgeEscrow can now spend PYUSD from Smart Account!");
    }
    
    function _chainSuffix() internal view returns (string memory) {
        if (block.chainid == 421614) return "ARBSEPOLIA";
        if (block.chainid == 11155111) return "SEPOLIA";
        revert("Unsupported chain");
    }
}
