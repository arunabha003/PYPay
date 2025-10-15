// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script} from "@forge-std/Script.sol";
import {console2} from "@forge-std/console2.sol";
import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";

/// @notice Script to seed test merchant
contract SeedMerchantScript is Script {
    function run() public {
        // Resolve chain-specific suffix
        string memory suffix = _chainSuffix();

        // Prefer chain-suffixed env vars, fallback to generic
        address registryAddress = _envAddressPref(
            string.concat("REGISTRY_", suffix),
            "REGISTRY"
        );
        address merchantAddress = _envAddressPref(
            string.concat("TEST_MERCHANT_", suffix),
            "TEST_MERCHANT"
        );
        address payoutAddress = _envAddressPref(
            string.concat("TEST_MERCHANT_PAYOUT_", suffix),
            "TEST_MERCHANT_PAYOUT"
        );
        uint16 feeBps = uint16(
            _envUintPref(
                string.concat("TEST_MERCHANT_FEE_BPS_", suffix),
                "TEST_MERCHANT_FEE_BPS",
                0
            )
        );

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

    function _chainSuffix() internal view returns (string memory) {
        if (block.chainid == 421614) return "ARBSEPOLIA";
        if (block.chainid == 11155111) return "SEPOLIA";
        return "UNKNOWN";
    }

    function _envAddressPref(string memory primary, string memory fallbackKey)
        internal
        view
        returns (address)
    {
        // Try primary; if missing, try fallback
        try vm.envAddress(primary) returns (address a) {
            return a;
        } catch {
            return vm.envAddress(fallbackKey);
        }
    }

    function _envUintPref(string memory primary, string memory fallbackKey, uint256 defaultValue)
        internal
        view
        returns (uint256)
    {
        // Try primary; if missing, try fallback; else default
        try vm.envUint(primary) returns (uint256 v1) {
            return v1;
        } catch {
            try vm.envUint(fallbackKey) returns (uint256 v2) {
                return v2;
            } catch {
                return defaultValue;
            }
        }
    }
}

