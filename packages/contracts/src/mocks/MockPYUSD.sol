// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "solady/tokens/ERC20.sol";

/// @title MockPYUSD
/// @notice Mock PYUSD token for testing (6 decimals like real PYUSD)
contract MockPYUSD is ERC20 {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Token name
    function name() public pure override returns (string memory) {
        return "PayPal USD (Mock)";
    }

    /// @notice Token symbol
    function symbol() public pure override returns (string memory) {
        return "PYUSD";
    }

    /// @notice Token decimals (PYUSD uses 6 decimals)
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens to any address (for testing)
    /// @param to Address to mint to
    /// @param amount Amount to mint (in 6 decimal format)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Faucet - anyone can mint tokens for testing
    /// @param amount Amount to mint
    function faucet(uint256 amount) external {
        require(amount <= 10000e6, "Max 10,000 PYUSD per faucet call");
        _mint(msg.sender, amount);
    }

    /// @notice Burn tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

