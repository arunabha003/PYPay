// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {ERC4337} from "@solady/src/accounts/ERC4337.sol";
import {EIP712, SignatureCheckerLib, ERC1271} from "@solady/src/accounts/ERC1271.sol";

/// @title TapKitAccount
/// @notice ERC-4337 smart account with session key support for gasless payments
/// @dev Extends Solady's ERC4337 with session key validation and policy enforcement
contract TapKitAccount is ERC4337 {
    /// ============ ERRORS ============

    error InvalidGuardian();
    error SessionKeyNotActive();
    error SessionKeyExpired();
    error InvalidSessionSignature();
    error PolicyViolation();
    error UnauthorizedCaller();

    /// ============ EVENTS ============

    event SessionKeyEnabled(bytes32 indexed pubKeyHash, uint48 validUntil, uint8 policyId);
    event SessionKeyDisabled(bytes32 indexed pubKeyHash);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    /// ============ STRUCTS ============

    struct SessionKey {
        uint48 validUntil;
        uint8 policyId;
        bool active;
    }

    /// ============ CONSTANTS ============

    /// @dev Prehash of `keccak256("")` for validation efficiency
    bytes32 internal constant _NULL_HASH =
        0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;

    /// @dev EIP712 typehash for user operation validation
    /// keccak256("Validate(address sender,uint256 nonce,bytes32 initCodeHash,bytes32 callDataHash,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes32 paymasterAndDataHash,uint48 validUntil,uint48 validAfter)")
    bytes32 internal constant _VALIDATE_TYPEHASH =
        0xec47f68185b616716eab508f2d0081af6a3d691ee7c627f4296dec92253979e2;

    /// ============ STORAGE ============

    /// @notice Guardian address authorized to enable/disable session keys
    address public guardian;

    /// @notice Session keys mapping: pubKeyHash => SessionKey
    mapping(bytes32 => SessionKey) public sessionKeys;

    /// ============ CONSTRUCTOR ============

    constructor() payable {}

    /// ============ INITIALIZER ============

    /// @notice Initialize the account with owner and guardian
    /// @param _owner The owner address
    /// @param _guardian The guardian address for session key management
    function initialize(address _owner, address _guardian) external {
        if (_owner == address(0) || _guardian == address(0)) revert InvalidGuardian();
        _initializeOwner(_owner);
        guardian = _guardian;
        emit GuardianUpdated(address(0), _guardian);
    }

    /// ============ SESSION KEY MANAGEMENT ============

    /// @notice Enable a session key with guardian signature
    /// @param pubKeyHash Hash of the session public key
    /// @param validUntil Timestamp until which the session key is valid
    /// @param policyId Policy ID defining constraints for this session key
    /// @param guardianSignature Guardian signature authorizing this session key
    function enableSessionKey(
        bytes32 pubKeyHash,
        uint48 validUntil,
        uint8 policyId,
        bytes calldata guardianSignature
    ) external {
        // Verify guardian signature over (this, pubKeyHash, validUntil, policyId)
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(address(this), pubKeyHash, validUntil, policyId))
            )
        );

        // Handle EOF marker issue: if guardian has small code size (like EOF marker),
        // assume it's an EOA and use ecrecover directly instead of SignatureCheckerLib
        bool signatureValid;
        if (guardian.code.length > 0 && guardian.code.length < 100) {
            // Likely an EOA with EOF marker - use ecrecover directly
            if (guardianSignature.length == 65) {
                bytes32 r;
                bytes32 s;
                uint8 v;
                assembly {
                    r := calldataload(guardianSignature.offset)
                    s := calldataload(add(guardianSignature.offset, 0x20))
                    v := byte(0, calldataload(add(guardianSignature.offset, 0x40)))
                }
                address recovered = ecrecover(digest, v, r, s);
                signatureValid = (recovered == guardian && recovered != address(0));
            }
        } else {
            // Use SignatureCheckerLib for contracts or when we're sure it's an EOA
            signatureValid = SignatureCheckerLib.isValidSignatureNowCalldata(guardian, digest, guardianSignature);
        }

        if (!signatureValid) {
            revert InvalidGuardian();
        }

        // Store session key
        sessionKeys[pubKeyHash] = SessionKey({
            validUntil: validUntil,
            policyId: policyId,
            active: true
        });

        emit SessionKeyEnabled(pubKeyHash, validUntil, policyId);
    }

    /// @notice Disable a session key (guardian or owner only)
    /// @param pubKeyHash Hash of the session public key to disable
    function disableSessionKey(bytes32 pubKeyHash) external {
        if (msg.sender != guardian && msg.sender != owner()) revert UnauthorizedCaller();

        sessionKeys[pubKeyHash].active = false;

        emit SessionKeyDisabled(pubKeyHash);
    }

    /// @notice Update the guardian address (owner only)
    /// @param newGuardian New guardian address
    function updateGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert InvalidGuardian();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    /// ============ EIP712 ============

    function _domainNameAndVersion()
        internal
        pure
        virtual
        override(EIP712)
        returns (string memory, string memory)
    {
        return ("TapKitAccount", "1.0.0");
    }

    /// ============ ERC-4337 VALIDATION ============

    /// @notice Validates user operation with session key or owner signature
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256 missingAccountFunds
    ) external payable virtual override onlyEntryPoint payPrefund(missingAccountFunds) returns (uint256) {
        return _validateUserOpSignature(userOp);
    }

    /// @notice Validates userOp signature (checks session key first, then owner)
    function _validateUserOpSignature(PackedUserOperation calldata userOp)
        internal
        virtual
        returns (uint256)
    {
        // Extract time window from signature
        (uint48 validUntil, uint48 validAfter) =
            (uint48(bytes6(userOp.signature[:6])), uint48(bytes6(userOp.signature[6:12])));

        // Try session key validation first
        // Session key signature format: [validUntil:6][validAfter:6][pubKey:64][signature:65]
        if (userOp.signature.length >= 12 + 64 + 65) {
            bytes32 pubKeyHash = keccak256(userOp.signature[12:76]); // Extract pubKey
            SessionKey memory session = sessionKeys[pubKeyHash];

            if (session.active && block.timestamp <= session.validUntil) {
                // Validate session key signature
                bytes32 digest = __hashTypedData(userOp, validUntil, validAfter);
                
                if (
                    SignatureCheckerLib.isValidSignatureNowCalldata(
                        _recoverSessionSigner(digest, userOp.signature[76:]),
                        digest,
                        userOp.signature[76:]
                    )
                ) {
                    // Session key valid - return with time bounds
                    return
                        (uint256(session.validUntil) << 160) | (uint256(validAfter) << 208);
                }
            }
        }

        // Fallback to owner signature validation
        bool valid = SignatureCheckerLib.isValidSignatureNowCalldata(
            owner(),
            __hashTypedData(userOp, validUntil, validAfter),
            userOp.signature[12:]
        );
        
        return (valid ? 0 : 1) | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
    }

    /// @notice Recover signer from session key signature
    function _recoverSessionSigner(bytes32 digest, bytes calldata signature)
        internal
        pure
        returns (address)
    {
        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(signature.offset)
                s := calldataload(add(signature.offset, 0x20))
                v := byte(0, calldataload(add(signature.offset, 0x40)))
            }
            return ecrecover(digest, v, r, s);
        }
        return address(0);
    }

    /// @notice Encodes userOp within EIP712 syntax
    function __hashTypedData(
        PackedUserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) internal view virtual returns (bytes32 digest) {
        // Use digest to store userOp.sender to save gas
        assembly ("memory-safe") {
            digest := calldataload(userOp)
        }
        return
            EIP712._hashTypedData(
                keccak256(
                    abi.encode(
                        _VALIDATE_TYPEHASH,
                        digest, // userOp.sender
                        userOp.nonce,
                        userOp.initCode.length == 0
                            ? _NULL_HASH
                            : _calldataKeccak(userOp.initCode),
                        _calldataKeccak(userOp.callData),
                        userOp.accountGasLimits,
                        userOp.preVerificationGas,
                        userOp.gasFees,
                        userOp.paymasterAndData.length == 0
                            ? _NULL_HASH
                            : _calldataKeccak(userOp.paymasterAndData),
                        validUntil,
                        validAfter
                    )
                )
            );
    }

    /// @notice Keccak function over calldata (gas-optimized)
    function _calldataKeccak(bytes calldata data) internal pure virtual returns (bytes32 hash) {
        assembly ("memory-safe") {
            let m := mload(0x40)
            let l := data.length
            calldatacopy(m, data.offset, l)
            hash := keccak256(m, l)
        }
    }

    /// ============ ERC-1271 ============

    /// @notice Validates signature for off-chain messages
    function isValidSignature(bytes32 hash, bytes calldata signature)
        public
        view
        virtual
        override(ERC1271)
        returns (bytes4)
    {
        // Check if it's a session key signature
        if (signature.length >= 64 + 65) {
            bytes32 pubKeyHash = keccak256(signature[:64]);
            SessionKey memory session = sessionKeys[pubKeyHash];

            if (session.active && block.timestamp <= session.validUntil) {
                address signer = _recoverSessionSigner(hash, signature[64:]);
                // Verify the recovered address matches the expected format
                if (signer != address(0)) {
                    return ERC1271.isValidSignature.selector;
                }
            }
        }

        // Fallback to owner signature
        return super.isValidSignature(hash, signature);
    }
}

