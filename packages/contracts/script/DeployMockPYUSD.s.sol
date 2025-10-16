// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockPYUSD} from "../src/mocks/MockPYUSD.sol";

contract DeployMockPYUSDScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        console2.log("Deploying MockPYUSD...");
        MockPYUSD pyusd = new MockPYUSD();
        
        console2.log("MockPYUSD deployed at:", address(pyusd));
        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("MockPYUSD:", address(pyusd));
        console2.log("Decimals:", pyusd.decimals());
        console2.log("");
        console2.log("Add to your .env file:");
        string memory envKey = block.chainid == 421614 
            ? "PYUSD_ARBSEPOLIA" 
            : "PYUSD_SEPOLIA";
        console2.log(string.concat("  ", envKey, "=", vm.toString(address(pyusd))));
        console2.log("");
        console2.log("Mint tokens for testing:");
        console2.log("  cast send", vm.toString(address(pyusd)), '"faucet(uint256)" 1000000000 --rpc-url <RPC>');

        vm.stopBroadcast();
    }
}

