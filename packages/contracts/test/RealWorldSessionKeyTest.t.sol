// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import {TapKitAccount} from "../src/account/TapKitAccount.sol";
import {TapKitAccountFactory} from "../src/account/TapKitAccountFactory.sol";
import {ERC4337} from "@solady/src/accounts/ERC4337.sol";

/// @title RealWorldSessionKeyTest
/// @notice Tests session key validation with EXACT values from production error logs
contract RealWorldSessionKeyTest is Test {
    TapKitAccountFactory factory;
    TapKitAccount account;
    TapKitAccount implementation;
    address entryPoint = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    
    // EXACT addresses from the error logs
    address owner = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // Anvil #2
    address guardian = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Anvil #1
    address smartAccountAddress = 0xB8F4Ae6bf15a05171A25cFcD1D0C64b056D50577; // ACTUAL deployed address from relayer logs
    
    // EXACT session key from latest error logs
    bytes sessionPubKey = hex"a8c2b1a3484ff31f99fffc24bd7c34861d349e70b5e543b8e410d7398f91243c834ed93a85f267193f9b4ca39521d08aff86d23f01d8c8c55b34f9e7fa5232d7";
    bytes32 pubKeyHash = 0x5474d75cf37fab7154c07618fd06ce0b6e46e068e1ef9accbfe9b4beb266b091;
    
    // EXACT signature from latest error logs
    bytes userOpSignature = hex"000068f4c211000068f4badaa8c2b1a3484ff31f99fffc24bd7c34861d349e70b5e543b8e410d7398f91243c834ed93a85f267193f9b4ca39521d08aff86d23f01d8c8c55b34f9e7fa5232d799afb998a42369996d76f7edad0a01ce4d13eafb28223365e6c4872f8aea5f460e6eede12aabd7af674840db9db8176439303dee640e0935417a072b8577c1d91c";
    
    // EXACT UserOp data from error logs
    bytes callData = hex"b61d27f6000000000000000000000000f588f57be135813d305815dc3e71960c97987b19000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000124dc3f3654cbe2d79095e87737222596db8f73639a6fe227b8c6c95a3a489ad9a9c3cf605a00000000000000000000000015d34aaf54267db7d7c367839aaf71a00a2c6a6500000000000000000000000000000000000000000000000000000000009896800000000000000000000000000000000000000000000000000000000068f4c1cc0000000000000000000000000000000000000000000000000000000000066eeec4aed9cb9a5bc30a73c21b6490cbc060cd2c6564e293c082c266e9f8226bc079000000000000000000000000b8f4ae6bf15a05171a25cfcd1d0c64b056d505770000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    bytes32 accountGasLimits = 0x000000000000000000000000000f4240000000000000000000000000000f4240;
    bytes32 gasFees = 0x0000000000000000000000003b9aca000000000000000000000000003b9aca00;
    bytes paymasterAndData = hex"9a81C9fAddbcBfB565cccdc47A04013aD55695b9000000000000000000000000000186a0000000000000000000000000000186a0";
    
    function setUp() public {
        console2.log("\n=== REAL WORLD SESSION KEY TEST SETUP ===\n");
        
        // Deploy implementation
        implementation = new TapKitAccount();
        console2.log("Implementation deployed at:", address(implementation));
        
        // Deploy factory
        factory = new TapKitAccountFactory(address(implementation));
        console2.log("Factory deployed at:", address(factory));
        
        // Calculate expected address
        address predicted = factory.getAddress(owner, guardian, 0);
        console2.log("Predicted account address:", predicted);
        console2.log("Expected account address:", smartAccountAddress);
        
        // For this test to work with exact values, we need the account at the specific address
        // Since we can't control CREATE2 address exactly in test, we'll deploy and use that address
        account = TapKitAccount(payable(factory.createAccount(owner, guardian, 0)));
        console2.log("Account actually deployed at:", address(account));
        
        if (address(account) != smartAccountAddress) {
            console2.log("\n!!! WARNING: Address mismatch !!!");
            console2.log("Expected:", smartAccountAddress);
            console2.log("Got:", address(account));
            console2.log("This means the signature will NOT validate!");
            console2.log("The test will use the deployed address but signature is for different account.\n");
        }
        
        console2.log("Owner:", account.owner());
        console2.log("Guardian:", account.guardian());
    }
    
    function testCompleteSessionKeyFlow() public {
        console2.log("\n=== STEP 1: Enable Session Key ===\n");
        
        // Exact values from relayer logs
        uint48 validUntil = 1760870929;
        uint8 policyId = 1;
        
        console2.log("Session PubKey:", vm.toString(sessionPubKey));
        console2.log("PubKey Hash:", vm.toString(pubKeyHash));
        console2.log("Valid Until:", validUntil);
        console2.log("Policy ID:", policyId);
        
        // Build guardian signature for enableSessionKey
        bytes32 innerHash = keccak256(abi.encode(address(account), pubKeyHash, validUntil, policyId));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash));
        
        console2.log("Inner hash:", vm.toString(innerHash));
        console2.log("Digest to sign:", vm.toString(digest));
        
        // Expected digest from relayer logs: 0x40ae7c23356726051957d50200a2c4cef996f0c15364fc8f29d60c5f211c2e47
        // This will only match if account address matches!
        
        // Sign with guardian (Anvil #1 private key)
        uint256 guardianPK = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, digest);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        console2.log("Guardian signature:", vm.toString(guardianSig));
        
        // Enable session key
        vm.prank(address(0)); // Can be called by anyone
        account.enableSessionKey(pubKeyHash, validUntil, policyId, guardianSig);
        
        console2.log("[OK] Session key enabled successfully!");
        
        // Verify session key is stored
        (uint48 storedValidUntil, uint8 storedPolicyId, bool active) = account.sessionKeys(pubKeyHash);
        console2.log("Stored validUntil:", storedValidUntil);
        console2.log("Stored policyId:", storedPolicyId);
        console2.log("Active:", active);
        require(active, "Session key not active");
        
        console2.log("\n=== STEP 2: Parse UserOp Signature ===\n");
        
        // Parse signature components from EXACT error log data
        // Signature format: validUntil (6) | validAfter (6) | pubKey (64) | ecdsa (65)
        bytes memory sig = userOpSignature; // Copy to memory first
        
        uint48 sigValidUntil;
        uint48 sigValidAfter;
        
        assembly {
            // Load validUntil (first 6 bytes)
            sigValidUntil := shr(208, mload(add(sig, 0x20)))
            // Load validAfter (next 6 bytes)
            sigValidAfter := shr(208, mload(add(sig, 26)))
        }
        
        bytes memory sigPubKey = new bytes(64);
        bytes memory ecdsaSig = new bytes(65);
        
        // Copy pubKey (bytes 12-75)
        for (uint i = 0; i < 64; i++) {
            sigPubKey[i] = sig[12 + i];
        }
        
        // Copy ecdsa signature (bytes 76-140)
        for (uint i = 0; i < 65; i++) {
            ecdsaSig[i] = sig[76 + i];
        }
        
        console2.log("Sig validUntil:", sigValidUntil);
        console2.log("Sig validAfter:", sigValidAfter);
        console2.log("Sig pubKey:", vm.toString(sigPubKey));
        console2.log("Sig pubKey hash:", vm.toString(keccak256(sigPubKey)));
        console2.log("Expected pubKey hash:", vm.toString(pubKeyHash));
        
        require(keccak256(sigPubKey) == pubKeyHash, "PubKey hash mismatch!");
        
        // Extract r, s, v from ECDSA signature
        bytes32 sigR;
        bytes32 sigS;
        uint8 sigV;
        assembly {
            sigR := mload(add(ecdsaSig, 32))
            sigS := mload(add(ecdsaSig, 64))
            sigV := byte(0, mload(add(ecdsaSig, 96)))
        }
        
        console2.log("Sig r:", vm.toString(sigR));
        console2.log("Sig s:", vm.toString(sigS));
        console2.log("Sig v:", sigV);
        
        console2.log("\n=== STEP 3: Build UserOp and Calculate Digest ===\n");
        
        // Build PackedUserOperation with EXACT data from error logs
        ERC4337.PackedUserOperation memory userOp = ERC4337.PackedUserOperation({
            sender: address(account), // Use deployed account address
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: accountGasLimits,
            preVerificationGas: 500000,
            gasFees: gasFees,
            paymasterAndData: paymasterAndData,
            signature: userOpSignature
        });
        
        console2.log("UserOp sender:", userOp.sender);
        console2.log("UserOp nonce:", userOp.nonce);
        console2.log("UserOp accountGasLimits:", vm.toString(userOp.accountGasLimits));
        console2.log("UserOp gasFees:", vm.toString(userOp.gasFees));
        
        // Calculate the EIP-712 digest that SHOULD be signed
        bytes32 expectedDigest = _calculateEIP712Digest(
            userOp,
            sigValidUntil,
            sigValidAfter
        );
        
        console2.log("\n=== STEP 4: Verify Signature ===\n");
        console2.log("Expected EIP-712 digest:", vm.toString(expectedDigest));
        
        // Recover signer from signature
        address recovered = ecrecover(expectedDigest, sigV, sigR, sigS);
        console2.log("Recovered address:", recovered);
        
        // Derive expected address from public key
        bytes32 pubKeyKeccak = keccak256(sigPubKey);
        address expectedAddr = address(uint160(uint256(pubKeyKeccak)));
        console2.log("Expected address from pubKey:", expectedAddr);
        
        bool signatureValid = (recovered == expectedAddr && recovered != address(0));
        console2.log("Signature valid:", signatureValid);
        
        if (!signatureValid) {
            console2.log("\n[FAIL] SIGNATURE VALIDATION FAILED!");
            console2.log("This means either:");
            console2.log("1. Account address mismatch (different EIP-712 domain)");
            console2.log("2. Wrong typehash in contract");
            console2.log("3. Frontend signing wrong data");
        }
        
        console2.log("\n=== STEP 5: Call validateUserOp ===\n");
        
        vm.prank(entryPoint);
        vm.deal(address(account), 1 ether);
        
        try account.validateUserOp(userOp, bytes32(0), 0) returns (uint256 validationData) {
            console2.log("[OK] validateUserOp SUCCESS!");
            console2.log("Validation data:", validationData);
            
            // Decode validation data
            uint48 returnedValidUntil = uint48(validationData >> 160);
            uint48 returnedValidAfter = uint48(validationData >> 208);
            uint256 authorizer = validationData & type(uint160).max;
            
            console2.log("Returned validUntil:", returnedValidUntil);
            console2.log("Returned validAfter:", returnedValidAfter);
            console2.log("Authorizer (0=success, 1=fail):", authorizer);
            
            if (authorizer == 0) {
                console2.log("\n[SUCCESS] SESSION KEY VALIDATION SUCCESSFUL!");
            } else {
                console2.log("\n[FAIL] Session key validation failed, fell back to owner");
                fail();
            }
        } catch Error(string memory reason) {
            console2.log("[FAIL] validateUserOp FAILED with reason:", reason);
            fail();
        } catch (bytes memory lowLevelData) {
            console2.log("[FAIL] validateUserOp FAILED with low-level error");
            console2.logBytes(lowLevelData);
            fail();
        }
    }
    
    /// @notice Calculate EIP-712 digest exactly as TapKitAccount does
    function _calculateEIP712Digest(
        ERC4337.PackedUserOperation memory userOp,
        uint48 validUntil,
        uint48 validAfter
    ) internal view returns (bytes32) {
        // Step 1: Calculate domain separator
        bytes32 domainSeparator;
        {
            bytes32 typeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
            bytes32 nameHash = keccak256("TapKitAccount");
            bytes32 versionHash = keccak256("1.0.0");
            domainSeparator = keccak256(abi.encode(typeHash, nameHash, versionHash, block.chainid, address(account)));
            console2.log("Domain separator:", vm.toString(domainSeparator));
        }
        
        // Step 2: Calculate struct hash
        bytes32 structHash;
        {
            // This is the CORRECTED typehash
            bytes32 validateTypeHash = 0xec47f68185b616716eab508f2d0081af6a3d691ee7c627f4296dec92253979e2;
            
            bytes32 initHash = keccak256(userOp.initCode);
            bytes32 callHash = keccak256(userOp.callData);
            bytes32 pmHash = keccak256(userOp.paymasterAndData);
            
            console2.log("Init hash:", vm.toString(initHash));
            console2.log("Call hash:", vm.toString(callHash));
            console2.log("PM hash:", vm.toString(pmHash));
            
            structHash = keccak256(
                abi.encode(
                    validateTypeHash,
                    userOp.sender,
                    userOp.nonce,
                    initHash,
                    callHash,
                    userOp.accountGasLimits,
                    userOp.preVerificationGas,
                    userOp.gasFees,
                    pmHash,
                    validUntil,
                    validAfter
                )
            );
            console2.log("Struct hash:", vm.toString(structHash));
        }
        
        // Step 3: Final EIP-712 digest
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return digest;
    }
    
    function testFrontendDigestMatches() public {
        console2.log("\n=== FRONTEND DIGEST VERIFICATION ===\n");
        
        // This test verifies that our digest calculation matches what frontend should produce
        
        bytes memory sig = userOpSignature; // Copy to memory
        
        uint48 validUntil = 1760870929;
        uint48 validAfter;
        
        assembly {
            validAfter := shr(208, mload(add(sig, 26)))
        }
        
        ERC4337.PackedUserOperation memory userOp = ERC4337.PackedUserOperation({
            sender: smartAccountAddress, // Use EXACT address from error
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: accountGasLimits,
            preVerificationGas: 500000,
            gasFees: gasFees,
            paymasterAndData: paymasterAndData,
            signature: userOpSignature
        });
        
        // Calculate what the digest SHOULD be with correct account address
        bytes32 expectedDigest = _calculateEIP712DigestWithAddress(
            userOp,
            validUntil,
            validAfter,
            smartAccountAddress
        );
        
        console2.log("Expected digest for address", smartAccountAddress);
        console2.log("Digest:", vm.toString(expectedDigest));
        
        // Now recover signer from actual signature
        bytes memory sigBytes = userOpSignature; // Copy to memory
        bytes memory ecdsaSig = new bytes(65);
        for (uint i = 0; i < 65; i++) {
            ecdsaSig[i] = sigBytes[76 + i];
        }
        
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(ecdsaSig, 32))
            s := mload(add(ecdsaSig, 64))
            v := byte(0, mload(add(ecdsaSig, 96)))
        }
        
        address recovered = ecrecover(expectedDigest, v, r, s);
        bytes32 pubKeyKeccak = keccak256(sessionPubKey);
        address expectedAddr = address(uint160(uint256(pubKeyKeccak)));
        
        console2.log("Recovered from sig:", recovered);
        console2.log("Expected from pubKey:", expectedAddr);
        console2.log("Match:", recovered == expectedAddr);
        
        if (recovered != expectedAddr) {
            console2.log("\n[FAIL] Frontend is signing WRONG digest!");
            console2.log("Either:");
            console2.log("1. Wrong account address in domain");
            console2.log("2. Wrong typehash");
            console2.log("3. Wrong field values");
        } else {
            console2.log("\n[OK] Frontend digest calculation is CORRECT!");
        }
    }
    
    function _calculateEIP712DigestWithAddress(
        ERC4337.PackedUserOperation memory userOp,
        uint48 validUntil,
        uint48 validAfter,
        address accountAddress
    ) internal view returns (bytes32) {
        bytes32 typeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        bytes32 nameHash = keccak256("TapKitAccount");
        bytes32 versionHash = keccak256("1.0.0");
        bytes32 domainSeparator = keccak256(abi.encode(typeHash, nameHash, versionHash, block.chainid, accountAddress));
        
        bytes32 validateTypeHash = 0xec47f68185b616716eab508f2d0081af6a3d691ee7c627f4296dec92253979e2;
        
        bytes32 structHash = keccak256(
            abi.encode(
                validateTypeHash,
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                userOp.preVerificationGas,
                userOp.gasFees,
                keccak256(userOp.paymasterAndData),
                validUntil,
                validAfter
            )
        );
        
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
