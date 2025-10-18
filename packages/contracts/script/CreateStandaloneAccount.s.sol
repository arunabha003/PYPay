// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script} from "@forge-std/Script.sol";
import {console2} from "@forge-std/console2.sol";
import {TapKitAccountFactory} from "../src/account/TapKitAccountFactory.sol";

/// @notice Script to create a standalone TapKitAccount via factory
/// @dev Reads ACCOUNT_FACTORY, OWNER (optional), GUARDIAN_PRIVATE_KEY from env
contract CreateStandaloneAccount is Script {
    function run() external {
        // Get chain suffix for env var lookup
        string memory suffix = _chainSuffix();
        
        // Read factory address from env (e.g., ACCOUNT_FACTORY_ARBSEPOLIA)
        string memory factoryKey = string.concat("ACCOUNT_FACTORY_", suffix);
        address factoryAddress = vm.envAddress(factoryKey);
        require(factoryAddress != address(0), "Factory address not set");
        
        TapKitAccountFactory factory = TapKitAccountFactory(factoryAddress);
        
        // Get deployer private key (will create account)
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Get owner address (default to deployer if not specified)
        address owner;
        try vm.envAddress("OWNER") returns (address o) {
            owner = o;
        } catch {
            owner = deployer;
        }
        
        // Get guardian address from private key
        uint256 guardianPrivateKey = vm.envUint("GUARDIAN_PRIVATE_KEY");
        address guardian = vm.addr(guardianPrivateKey);
        
        // Salt for deterministic address (can be customized via env)
        uint256 salt = vm.envOr("ACCOUNT_SALT", uint256(0));
        
        console2.log("Creating TapKitAccount...");
        console2.log("Factory:", factoryAddress);
        console2.log("Owner:", owner);
        console2.log("Guardian:", guardian);
        console2.log("Salt:", salt);
        
        // Predict address before deployment
        address predictedAccount = factory.getAddress(owner, guardian, salt);
        console2.log("Predicted account address:", predictedAccount);
        
        // Create account
        vm.startBroadcast(deployerPrivateKey);
        
        address account = factory.createAccount(owner, guardian, salt);
        
        vm.stopBroadcast();
        
        // Verify deployment
        require(account == predictedAccount, "Address mismatch");
        require(account.code.length > 0, "Account not deployed");
        
        console2.log("\n=== Account Created Successfully ===");
        console2.log("Account address:", account);
        console2.log("Owner:", owner);
        console2.log("Guardian:", guardian);
        console2.log("\nAdd to your .env file:");
        console2.log(
            string.concat(
                "SMART_ACCOUNT_",
                _chainPrefix(),
                "=",
                vm.toString(account)
            )
        );
        
        // Verify on-chain values
        console2.log("\nVerifying on-chain values...");
        (bool success, bytes memory data) = account.staticcall(
            abi.encodeWithSignature("owner()")
        );
        if (success && data.length == 32) {
            address onChainOwner = abi.decode(data, (address));
            console2.log("On-chain owner:", onChainOwner);
            require(onChainOwner == owner, "Owner mismatch");
        }
        
        (success, data) = account.staticcall(
            abi.encodeWithSignature("guardian()")
        );
        if (success && data.length == 32) {
            address onChainGuardian = abi.decode(data, (address));
            console2.log("On-chain guardian:", onChainGuardian);
            require(onChainGuardian == guardian, "Guardian mismatch");
        }
        
        console2.log("\nAccount verified and ready to use!");
        
        // Optional: Fund the account with ETH if FUND_AMOUNT_ETH is set
        try vm.envUint("FUND_AMOUNT_ETH") returns (uint256 fundAmount) {
            if (fundAmount > 0) {
                console2.log("\nFunding account with", fundAmount, "wei ETH...");
                vm.startBroadcast(deployerPrivateKey);
                
                (bool sent,) = account.call{value: fundAmount}("");
                require(sent, "ETH transfer failed");
                
                vm.stopBroadcast();
                console2.log("Account funded with", fundAmount, "wei ETH");
            }
        } catch {
            // FUND_AMOUNT_ETH not set, skip funding
        }
    }
    
    function _chainPrefix() internal view returns (string memory) {
        if (block.chainid == 421614) return "ARBSEPOLIA";
        if (block.chainid == 11155111) return "SEPOLIA";
        if (block.chainid == 31337) return "LOCAL";
        return "UNKNOWN";
    }
    
    function _chainSuffix() internal view returns (string memory) {
        return _chainPrefix();
    }
}
