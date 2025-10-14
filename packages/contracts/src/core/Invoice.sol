// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

interface IMerchantRegistry {
    function isActive(address merchant) external view returns (bool);
}

/// @title Invoice
/// @notice Invoice creation and management for PyPay payments
/// @dev Invoices are uniquely identified and validated before payment
contract Invoice {
    /// ============ ERRORS ============

    error InactiveMerchant();
    error InvoiceAlreadyExists();
    error InvoiceNotFound();
    error UnauthorizedCancellation();
    error InvoiceAlreadyCancelled();

    /// ============ EVENTS ============

    event InvoiceCreated(
        bytes32 indexed id,
        address indexed merchant,
        uint256 amount,
        uint64 expiry,
        uint256 chainId,
        bytes32 memoHash
    );
    event InvoiceCancelled(bytes32 indexed id);

    /// ============ STRUCTS ============

    struct InvoiceData {
        bytes32 id;
        address merchant;
        uint256 amount;
        uint64 expiry;
        bytes32 memoHash;
        uint256 chainId;
    }

    /// ============ STORAGE ============

    /// @notice Merchant registry reference
    IMerchantRegistry public immutable registry;

    /// @notice Invoice existence mapping
    mapping(bytes32 => bool) public exists;

    /// @notice Invoice cancellation mapping
    mapping(bytes32 => bool) public cancelled;

    /// @notice Invoice data storage
    mapping(bytes32 => InvoiceData) public invoices;

    /// ============ CONSTRUCTOR ============

    constructor(address _registry) {
        require(_registry != address(0), "Invalid registry");
        registry = IMerchantRegistry(_registry);
    }

    /// ============ INVOICE MANAGEMENT ============

    /// @notice Create a new invoice
    /// @param merchant Merchant address
    /// @param amount Payment amount in PYUSD (6 decimals)
    /// @param expiry Expiration timestamp
    /// @param memoHash Hash of the invoice memo
    /// @param chainId Chain ID for this invoice
    /// @param salt Unique salt for ID generation
    /// @return id Invoice ID
    function createInvoice(
        address merchant,
        uint256 amount,
        uint64 expiry,
        bytes32 memoHash,
        uint256 chainId,
        bytes32 salt
    ) external returns (bytes32 id) {
        // Validate merchant is active
        if (!registry.isActive(merchant)) revert InactiveMerchant();

        // Generate invoice ID
        id = keccak256(abi.encode(merchant, amount, chainId, salt));

        // Validate invoice doesn't exist
        if (exists[id]) revert InvoiceAlreadyExists();

        // Store invoice
        exists[id] = true;
        invoices[id] = InvoiceData({
            id: id,
            merchant: merchant,
            amount: amount,
            expiry: expiry,
            memoHash: memoHash,
            chainId: chainId
        });

        emit InvoiceCreated(id, merchant, amount, expiry, chainId, memoHash);

        return id;
    }

    /// @notice Cancel an invoice (merchant only)
    /// @param id Invoice ID
    function cancelInvoice(bytes32 id) external {
        if (!exists[id]) revert InvoiceNotFound();
        if (cancelled[id]) revert InvoiceAlreadyCancelled();

        InvoiceData memory invoice = invoices[id];

        // Only merchant can cancel
        if (msg.sender != invoice.merchant) revert UnauthorizedCancellation();

        cancelled[id] = true;

        emit InvoiceCancelled(id);
    }

    /// ============ VIEW FUNCTIONS ============

    /// @notice Get invoice data
    /// @param id Invoice ID
    /// @return Invoice data
    function getInvoice(bytes32 id) external view returns (InvoiceData memory) {
        if (!exists[id]) revert InvoiceNotFound();
        return invoices[id];
    }

    /// @notice Check if invoice is valid (exists, not cancelled, not expired)
    /// @param id Invoice ID
    /// @return True if valid
    function isValid(bytes32 id) external view returns (bool) {
        if (!exists[id] || cancelled[id]) return false;
        return block.timestamp <= invoices[id].expiry;
    }

    /// @notice Get invoice merchant
    /// @param id Invoice ID
    /// @return Merchant address
    function merchantOf(bytes32 id) external view returns (address) {
        return invoices[id].merchant;
    }

    /// @notice Get invoice amount
    /// @param id Invoice ID
    /// @return Amount
    function amountOf(bytes32 id) external view returns (uint256) {
        return invoices[id].amount;
    }

    /// @notice Get invoice expiry
    /// @param id Invoice ID
    /// @return Expiry timestamp
    function expiryOf(bytes32 id) external view returns (uint64) {
        return invoices[id].expiry;
    }
}

