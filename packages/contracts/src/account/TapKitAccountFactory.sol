// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {TapKitAccount} from "./TapKitAccount.sol";
import {LibClone} from "@solady/src/utils/LibClone.sol";

/// @title TapKitAccountFactory
/// @notice Factory for deploying deterministic TapKitAccount instances via CREATE2
/// @dev Uses minimal proxy pattern (ERC-1167) for gas efficiency
contract TapKitAccountFactory {
    /// ============ EVENTS ============

    event AccountCreated(
        address indexed account, address indexed owner, address indexed guardian, uint256 salt
    );

    /// ============ IMMUTABLES ============

    /// @notice Implementation contract address
    address public immutable accountImplementation;

    /// @notice EntryPoint address
    address public immutable entryPoint;

    /// ============ CONSTRUCTOR ============

    /// @param _entryPoint ERC-4337 EntryPoint address
    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        entryPoint = _entryPoint;
        
        // Deploy implementation
        accountImplementation = address(new TapKitAccount());
    }

    /// ============ ACCOUNT CREATION ============

    /// @notice Create a new TapKitAccount or return existing one
    /// @param owner The owner address
    /// @param guardian The guardian address for session key management
    /// @param salt Salt for deterministic address generation
    /// @return account The account address
    function createAccount(address owner, address guardian, uint256 salt)
        external
        returns (address account)
    {
        require(owner != address(0), "Invalid owner");
        require(guardian != address(0), "Invalid guardian");

        // Compute deterministic address
        account = getAddress(owner, guardian, salt);

        // Check if already deployed
        if (account.code.length == 0) {
            // Deploy minimal proxy
            account = LibClone.cloneDeterministic(
                accountImplementation, _getSalt(owner, guardian, salt)
            );

            // Initialize
            TapKitAccount(payable(account)).initialize(owner, guardian);

            emit AccountCreated(account, owner, guardian, salt);
        }

        return account;
    }

    /// @notice Get the counterfactual address of an account
    /// @param owner The owner address
    /// @param guardian The guardian address
    /// @param salt Salt for deterministic address generation
    /// @return The predicted account address
    function getAddress(address owner, address guardian, uint256 salt)
        public
        view
        returns (address)
    {
        return LibClone.predictDeterministicAddress(
            accountImplementation, _getSalt(owner, guardian, salt), address(this)
        );
    }

    /// @notice Generate salt for CREATE2
    function _getSalt(address owner, address guardian, uint256 salt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(owner, guardian, salt));
    }

    /// @notice Add stake to EntryPoint (for factory reputation)
    function addStake(uint32 unstakeDelaySec) external payable {
        (bool success,) = entryPoint.call{value: msg.value}(
            abi.encodeWithSignature("addStake(uint32)", unstakeDelaySec)
        );
        require(success, "Stake failed");
    }
}

