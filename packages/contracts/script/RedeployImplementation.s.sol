// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {TapKitAccount} from "../src/account/TapKitAccount.sol";

/// @notice Deploy new TapKitAccount implementation
/// @dev After running this, manually upgrade your account proxy to use the new implementation
contract RedeployImplementation is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        TapKitAccount newImplementation = new TapKitAccount();
        console.log("========================================");
        console.log("New TapKitAccount Implementation deployed!");
        console.log("Address:", address(newImplementation));
        console.log("========================================");
        console.log("");
        console.log("To upgrade your existing account, call:");
        console.log("cast send <SMART_ACCOUNT> 'upgradeToAndCall(address,bytes)' <NEW_IMPL> 0x --private-key <OWNER_KEY>");

        vm.stopBroadcast();
    }
}

