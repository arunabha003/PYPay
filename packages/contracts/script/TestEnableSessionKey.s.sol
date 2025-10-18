// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/account/TapKitAccount.sol";

/**
 * @title TestEnableSessionKey
 * @notice Test enabling session key directly
 */
contract TestEnableSessionKey is Script {
    function run() external {
        // From relayer logs
        address smartAccount = 0xB8F4Ae6bf15a05171A25cFcD1D0C64b056D50577;
        bytes32 pubKeyHash = 0x758e328e1cb6244a161e5c25419a3e1a9688bf7304efdf4a1776dc87350627ab;
        uint48 validUntil = 1760793499;
        uint8 policyId = 1;
        bytes memory guardianSignature = hex"c991905109d9a377f2088e981ba1e4ecaeafc7cecd763560d691aac7808ab82b7c4b0eed4dfe09d1206b168151f011b4be03770445dc3cc7cdf7465f47e89f511b";
        
        console2.log("Attempting to enable session key...");
        console2.log("Smart Account:", smartAccount);
        
        TapKitAccount account = TapKitAccount(payable(smartAccount));
        
        // Try to call enableSessionKey
        try account.enableSessionKey(pubKeyHash, validUntil, policyId, guardianSignature) {
            console2.log("[SUCCESS] Session key enabled!");
        } catch Error(string memory reason) {
            console2.log("[ERROR] Revert reason:", reason);
        } catch (bytes memory lowLevelData) {
            console2.log("[ERROR] Low-level revert:");
            console2.logBytes(lowLevelData);
            
            // Try to decode as custom error
            if (lowLevelData.length == 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(lowLevelData, 32))
                }
                console2.log("Error selector:");
                console2.logBytes4(selector);
                
                if (selector == 0xa6c1146b) {
                    console2.log("This is InvalidGuardian() error");
                }
            }
        }
    }
}
