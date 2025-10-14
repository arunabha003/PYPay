// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import "@solady/src/auth/Ownable.sol";

/// @title MerchantRegistry
/// @notice Registry of verified merchants authorized to receive PYUSD payments
/// @dev Owner-controlled registry with merchant activation and fee configuration
contract MerchantRegistry is Ownable {
    /// ============ ERRORS ============

    error MerchantAlreadyRegistered();
    error MerchantNotRegistered();
    error InvalidAddress();
    error InvalidFeeBps();

    /// ============ EVENTS ============

    event MerchantRegistered(address indexed merchant, address indexed payout, uint16 feeBps);
    event MerchantStatus(address indexed merchant, bool active);
    event MerchantUpdated(address indexed merchant, address indexed payout, uint16 feeBps);

    /// ============ STRUCTS ============

    struct Merchant {
        bool active;
        address payout;
        uint16 feeBps;
    }

    /// ============ STORAGE ============

    /// @notice Merchant configurations
    mapping(address => Merchant) public merchants;

    /// @notice Maximum fee in basis points (10% = 1000 bps)
    uint16 public constant MAX_FEE_BPS = 1000;

    /// ============ CONSTRUCTOR ============

    constructor(address _owner) payable {
        require(_owner != address(0), "Invalid owner");
        _initializeOwner(_owner);
    }

    /// ============ REGISTRATION ============

    /// @notice Register a new merchant
    /// @param merchant Merchant address
    /// @param payout Payout address for receiving funds
    /// @param feeBps Fee in basis points (0-1000)
    function registerMerchant(address merchant, address payout, uint16 feeBps)
        external
        onlyOwner
    {
        if (merchant == address(0) || payout == address(0)) revert InvalidAddress();
        if (feeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        if (merchants[merchant].payout != address(0)) revert MerchantAlreadyRegistered();

        merchants[merchant] = Merchant({active: true, payout: payout, feeBps: feeBps});

        emit MerchantRegistered(merchant, payout, feeBps);
        emit MerchantStatus(merchant, true);
    }

    /// @notice Set merchant active status
    /// @param merchant Merchant address
    /// @param active Active status
    function setActive(address merchant, bool active) external onlyOwner {
        if (merchants[merchant].payout == address(0)) revert MerchantNotRegistered();

        merchants[merchant].active = active;

        emit MerchantStatus(merchant, active);
    }

    /// @notice Update merchant configuration
    /// @param merchant Merchant address
    /// @param payout New payout address
    /// @param feeBps New fee in basis points
    function updateMerchant(address merchant, address payout, uint16 feeBps) external onlyOwner {
        if (payout == address(0)) revert InvalidAddress();
        if (feeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        if (merchants[merchant].payout == address(0)) revert MerchantNotRegistered();

        merchants[merchant].payout = payout;
        merchants[merchant].feeBps = feeBps;

        emit MerchantUpdated(merchant, payout, feeBps);
    }

    /// ============ VIEW FUNCTIONS ============

    /// @notice Check if merchant is active
    /// @param merchant Merchant address
    /// @return True if merchant is active
    function isActive(address merchant) external view returns (bool) {
        return merchants[merchant].active;
    }

    /// @notice Get payout address for merchant
    /// @param merchant Merchant address
    /// @return Payout address
    function payoutOf(address merchant) external view returns (address) {
        return merchants[merchant].payout;
    }

    /// @notice Get fee for merchant
    /// @param merchant Merchant address
    /// @return Fee in basis points
    function feeOf(address merchant) external view returns (uint16) {
        return merchants[merchant].feeBps;
    }

    /// @notice Get full merchant configuration
    /// @param merchant Merchant address
    /// @return Merchant configuration
    function getMerchant(address merchant) external view returns (Merchant memory) {
        return merchants[merchant];
    }
}

