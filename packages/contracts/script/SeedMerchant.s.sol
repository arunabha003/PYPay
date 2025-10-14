// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script} from "@forge-std/Script.sol";
import {console2} from "@forge-std/console2.sol";
import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";

/// @notice Script to seed test merchant
contract SeedMerchantScript is Script {
    function run() public {
        address registryAddress = vm.envAddress("REGISTRY");
        address merchantAddress = vm.envAddress("TEST_MERCHANT");
        address payoutAddress = vm.envAddress("TEST_MERCHANT_PAYOUT");
        uint16 feeBps = uint16(vm.envOr("TEST_MERCHANT_FEE_BPS", uint256(0)));

        uint256 ownerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        MerchantRegistry registry = MerchantRegistry(registryAddress);

        vm.startBroadcast(ownerPrivateKey);

        console2.log("Registering test merchant...");
        console2.log("Merchant:", merchantAddress);
        console2.log("Payout:", payoutAddress);
        console2.log("Fee BPS:", feeBps);

        registry.registerMerchant(merchantAddress, payoutAddress, feeBps);

        console2.log("Test merchant registered successfully!");

        vm.stopBroadcast();
    }
}

