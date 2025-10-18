// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

/**
 * @title TestSignatureChecker
 * @notice Test Solady's SignatureCheckerLib directly
 */
contract TestSignatureChecker is Script {
    function run() external view {
        address guardian = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        bytes32 digest = 0x9eb53f7802efbf9c81dee184ad1701cb29d172890308e345302e456dc2a91c35;
        bytes memory signature = hex"c991905109d9a377f2088e981ba1e4ecaeafc7cecd763560d691aac7808ab82b7c4b0eed4dfe09d1206b168151f011b4be03770445dc3cc7cdf7465f47e89f511b";
        
        console2.log("=== Testing SignatureCheckerLib ===");
        console2.log("Guardian:", guardian);
        console2.log("Digest:");
        console2.logBytes32(digest);
        
        // Check if guardian is contract
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(guardian)
        }
        console2.log("Guardian code size:", codeSize);
        console2.log("Is EOA:", codeSize == 0);
        
        // Manual ecrecover
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        address recovered = ecrecover(digest, v, r, s);
        console2.log("Recovered via ecrecover:", recovered);
        console2.log("Match:", recovered == guardian);
        
        // Now test with actual Solady lib
        console2.log("\nCalling SignatureCheckerLib...");
        bool valid = this.testSolady(guardian, digest, signature);
        console2.log("Solady result:", valid);
    }
    
    function testSolady(address signer, bytes32 hash, bytes calldata signature) 
        external 
        view 
        returns (bool) 
    {
        return _isValidSignatureNowCalldata(signer, hash, signature);
    }
    
    // Inline Solady's logic
    function _isValidSignatureNowCalldata(address signer, bytes32 hash, bytes calldata signature)
        internal
        view
        returns (bool isValid)
    {
        if (signer == address(0)) return isValid;
        /// @solidity memory-safe-assembly
        assembly {
            let m := mload(0x40)
            for {} 1 {} {
                if iszero(extcodesize(signer)) {
                    switch signature.length
                    case 64 {
                        let vs := calldataload(add(signature.offset, 0x20))
                        mstore(0x20, add(shr(255, vs), 27)) // `v`.
                        mstore(0x40, calldataload(signature.offset)) // `r`.
                        mstore(0x60, shr(1, shl(1, vs))) // `s`.
                    }
                    case 65 {
                        mstore(0x20, byte(0, calldataload(add(signature.offset, 0x40)))) // `v`.
                        calldatacopy(0x40, signature.offset, 0x40) // `r`, `s`.
                    }
                    default { break }
                    mstore(0x00, hash)
                    let recovered := mload(staticcall(gas(), 1, 0x00, 0x80, 0x01, 0x20))
                    isValid := gt(returndatasize(), shl(96, xor(signer, recovered)))
                    mstore(0x60, 0) // Restore the zero slot.
                    mstore(0x40, m) // Restore the free memory pointer.
                    break
                }
                let f := shl(224, 0x1626ba7e)
                mstore(m, f) // `bytes4(keccak256("isValidSignature(bytes32,bytes)"))`.
                mstore(add(m, 0x04), hash)
                let d := add(m, 0x24)
                mstore(d, 0x40) // The offset of the `signature` in the calldata.
                mstore(add(m, 0x44), signature.length)
                // Copy the `signature` over.
                calldatacopy(add(m, 0x64), signature.offset, signature.length)
                isValid := staticcall(gas(), signer, m, add(signature.length, 0x64), d, 0x20)
                isValid := and(eq(mload(d), f), isValid)
                break
            }
        }
    }
}
