// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script} from "@forge-std/Script.sol";
import {console2} from "@forge-std/console2.sol";
import {TapKitPaymaster} from "../src/paymaster/TapKitPaymaster.sol";

/// @notice Script to stake paymaster on EntryPoint
contract StakePaymasterScript is Script {
    function run() public {
        // Resolve chain-specific paymaster env var
        string memory suffix = _chainSuffix();
        string memory paymasterKey = string.concat("PAYMASTER_", suffix);
        address paymasterAddress = vm.envAddress(paymasterKey);
        uint256 stakeAmount = 0.01 ether;
        try vm.envUint("STAKE_AMOUNT") returns (uint256 amount) {
            stakeAmount = amount;
        } catch {
            // Use default
        }
        uint32 unstakeDelay = 86400; // 1 day default
        try vm.envUint("UNSTAKE_DELAY") returns (uint256 delay) {
            unstakeDelay = uint32(delay);
        } catch {
            // Use default
        }

        uint256 ownerPrivateKey = vm.envUint("PAYMASTER_OWNER_PRIVATE_KEY");

        TapKitPaymaster paymaster = TapKitPaymaster(payable(paymasterAddress));

        vm.startBroadcast(ownerPrivateKey);

        console2.log("Staking paymaster...");
        console2.log("Paymaster:", paymasterAddress);
        console2.log("Stake amount:", stakeAmount);
        console2.log("Unstake delay:", unstakeDelay);

        paymaster.addStake{value: stakeAmount}(unstakeDelay);

        console2.log("Paymaster staked successfully!");

        vm.stopBroadcast();
    }

    function _chainSuffix() internal view returns (string memory) {
        if (block.chainid == 421614) return "ARBSEPOLIA";
        if (block.chainid == 11155111) return "SEPOLIA";
        return "UNKNOWN";
    }
}

