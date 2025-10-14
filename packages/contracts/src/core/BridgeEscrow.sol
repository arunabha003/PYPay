// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import "@solady/src/auth/Ownable.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BridgeEscrow
/// @notice Escrow contract for inventory-based PYUSD bridging
/// @dev Locks PYUSD on source chain; relayer releases from inventory on destination chain
contract BridgeEscrow is Ownable {
    /// ============ ERRORS ============

    error InvalidAmount();
    error InvalidRef();
    error TransferFailed();
    error AlreadyProcessed();
    error InsufficientBalance();

    /// ============ EVENTS ============

    event Locked(bytes32 indexed ref, address indexed payer, uint256 amount, uint256 timestamp);
    event Released(
        bytes32 indexed ref, address indexed to, uint256 amount, uint256 timestamp
    );

    /// ============ STORAGE ============

    /// @notice PYUSD token reference
    IERC20 public immutable PYUSD;

    /// @notice Tracks processed lock references (prevents double-lock)
    mapping(bytes32 => bool) public lockProcessed;

    /// @notice Tracks processed release references (prevents double-release)
    mapping(bytes32 => bool) public releaseProcessed;

    /// @notice Tracks locked amounts by reference
    mapping(bytes32 => uint256) public lockedAmounts;

    /// ============ CONSTRUCTOR ============

    constructor(address _owner, address _pyusd) payable {
        require(_owner != address(0), "Invalid owner");
        require(_pyusd != address(0), "Invalid PYUSD");

        _initializeOwner(_owner);
        PYUSD = IERC20(_pyusd);
    }

    /// ============ LOCK OPERATIONS ============

    /// @notice Lock PYUSD for bridging
    /// @param ref Unique bridge reference
    /// @param amount Amount to lock
    function lock(bytes32 ref, uint256 amount) external {
        if (ref == bytes32(0)) revert InvalidRef();
        if (amount == 0) revert InvalidAmount();
        if (lockProcessed[ref]) revert AlreadyProcessed();

        // Mark as processed
        lockProcessed[ref] = true;
        lockedAmounts[ref] = amount;

        // Transfer PYUSD from payer to escrow
        bool success = PYUSD.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        emit Locked(ref, msg.sender, amount, block.timestamp);
    }

    /// ============ RELEASE OPERATIONS ============

    /// @notice Release PYUSD from inventory (owner only)
    /// @param ref Unique bridge reference
    /// @param to Recipient address on destination chain
    /// @param amount Amount to release
    function release(bytes32 ref, address to, uint256 amount) external onlyOwner {
        if (ref == bytes32(0)) revert InvalidRef();
        if (to == address(0)) revert InvalidAmount();
        if (amount == 0) revert InvalidAmount();
        if (releaseProcessed[ref]) revert AlreadyProcessed();

        // Check inventory balance
        uint256 balance = PYUSD.balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();

        // Mark as processed
        releaseProcessed[ref] = true;

        // Transfer PYUSD from inventory to recipient
        bool success = PYUSD.transfer(to, amount);
        if (!success) revert TransferFailed();

        emit Released(ref, to, amount, block.timestamp);
    }

    /// ============ INVENTORY MANAGEMENT ============

    /// @notice Withdraw PYUSD inventory (owner only)
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawInventory(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAmount();
        if (amount == 0) revert InvalidAmount();

        bool success = PYUSD.transfer(to, amount);
        if (!success) revert TransferFailed();
    }

    /// @notice Deposit PYUSD inventory (anyone can add)
    /// @param amount Amount to deposit
    function depositInventory(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();

        bool success = PYUSD.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
    }

    /// ============ VIEW FUNCTIONS ============

    /// @notice Get current inventory balance
    /// @return Current PYUSD balance
    function inventoryBalance() external view returns (uint256) {
        return PYUSD.balanceOf(address(this));
    }

    /// @notice Check if lock has been processed
    /// @param ref Bridge reference
    /// @return True if processed
    function isLockProcessed(bytes32 ref) external view returns (bool) {
        return lockProcessed[ref];
    }

    /// @notice Check if release has been processed
    /// @param ref Bridge reference
    /// @return True if processed
    function isReleaseProcessed(bytes32 ref) external view returns (bool) {
        return releaseProcessed[ref];
    }

    /// @notice Get locked amount for reference
    /// @param ref Bridge reference
    /// @return Locked amount
    function getLockedAmount(bytes32 ref) external view returns (uint256) {
        return lockedAmounts[ref];
    }
}

