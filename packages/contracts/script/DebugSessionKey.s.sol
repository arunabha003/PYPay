// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/account/TapKitAccount.sol";

/**
 * @title DebugSessionKey
 * @notice Debug script to verify session key signature
 * 
 * Usage:
 *   forge script script/DebugSessionKey.s.sol --rpc-url http://localhost:8545
 */
contract DebugSessionKey is Script {
    function run() external view {
        // From relayer logs
        address smartAccount = 0xB8F4Ae6bf15a05171A25cFcD1D0C64b056D50577;
        bytes32 pubKeyHash = 0x758e328e1cb6244a161e5c25419a3e1a9688bf7304efdf4a1776dc87350627ab;
        uint48 validUntil = 1760793499;
        uint8 policyId = 1;
        bytes memory guardianSignature = hex"c991905109d9a377f2088e981ba1e4ecaeafc7cecd763560d691aac7808ab82b7c4b0eed4dfe09d1206b168151f011b4be03770445dc3cc7cdf7465f47e89f511b";
        
        console2.log("=== Debug Session Key Signature ===");
        console2.log("Smart Account:", smartAccount);
        console2.log("PubKeyHash:");
        console2.logBytes32(pubKeyHash);
        console2.log("ValidUntil:", validUntil);
        console2.log("PolicyId:", policyId);
        
        // Get guardian from contract
        TapKitAccount account = TapKitAccount(payable(smartAccount));
        address guardian = account.guardian();
        console2.log("Guardian (on-chain):", guardian);
        
        // Compute digest (same as contract)
        bytes32 innerHash = keccak256(abi.encode(address(account), pubKeyHash, validUntil, policyId));
        console2.log("Inner hash:");
        console2.logBytes32(innerHash);
        
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                innerHash
            )
        );
        console2.log("Digest:");
        console2.logBytes32(digest);
        
        // Try to recover signer
        console2.log("\nSignature:");
        console2.logBytes(guardianSignature);
        console2.log("Signature length:", guardianSignature.length);
        
        // Extract r, s, v
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(guardianSignature, 32))
            s := mload(add(guardianSignature, 64))
            v := byte(0, mload(add(guardianSignature, 96)))
        }
        
        console2.log("\nSignature components:");
        console2.log("r:");
        console2.logBytes32(r);
        console2.log("s:");
        console2.logBytes32(s);
        console2.log("v:", v);
        
        // Recover signer
        address recovered = ecrecover(digest, v, r, s);
        console2.log("\nRecovered signer:", recovered);
        console2.log("Expected guardian:", guardian);
        console2.log("Match:", recovered == guardian);
        
        if (recovered != guardian) {
            console2.log("\n[ERROR] SIGNATURE INVALID - Signer mismatch!");
            console2.log("This explains the InvalidGuardian() revert");
        } else {
            console2.log("\n[SUCCESS] Signature is valid!");
        }
    }
}
