// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPermit2 {
    struct PermitTransferFrom {
        address token;
        uint256 amount;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

interface IMerchantRegistry {
    function isActive(address merchant) external view returns (bool);
    function payoutOf(address merchant) external view returns (address);
}

/// @title Checkout
/// @notice Settlement contract for PyPay invoices with Permit2 support
/// @dev Handles PYUSD transfers from payer to merchant with gasless capability
contract Checkout {
    /// ============ ERRORS ============

    error InactiveMerchant();
    error InvoiceAlreadyPaid();
    error InvoiceExpired();
    error InvalidAmount();
    error InvalidChainId();
    error TransferFailed();
    error InvalidPayout();

    /// ============ EVENTS ============

    event Settled(
        bytes32 indexed receiptId,
        bytes32 indexed invoiceId,
        address indexed payer,
        address merchant,
        uint256 amount,
        uint256 chainId,
        bytes32 txHash
    );

    /// ============ STRUCTS ============

    struct InvoiceTuple {
        bytes32 invoiceId;
        address merchant;
        uint256 amount;
        uint64 expiry;
        uint256 chainId;
        bytes32 memoHash;
    }

    /// ============ IMMUTABLES ============

    IERC20 public immutable PYUSD;
    IPermit2 public immutable PERMIT2;
    IMerchantRegistry public immutable REGISTRY;

    /// ============ STORAGE ============

    /// @notice Tracks paid invoices
    mapping(bytes32 => bool) public paid;

    /// ============ CONSTRUCTOR ============

    constructor(address _pyusd, address _permit2, address _registry) {
        require(_pyusd != address(0), "Invalid PYUSD");
        require(_permit2 != address(0), "Invalid Permit2");
        require(_registry != address(0), "Invalid Registry");

        PYUSD = IERC20(_pyusd);
        PERMIT2 = IPermit2(_permit2);
        REGISTRY = IMerchantRegistry(_registry);
    }

    /// ============ SETTLEMENT ============

    /// @notice Settle an invoice payment
    /// @param invoice Invoice tuple containing payment details
    /// @param payer Payer address (smart account)
    /// @param permitData Optional Permit2 permit data (empty for direct transfer)
    /// @return receiptId Receipt ID for this payment
    function settle(InvoiceTuple calldata invoice, address payer, bytes calldata permitData)
        external
        returns (bytes32 receiptId)
    {
        // Validate merchant is active
        if (!REGISTRY.isActive(invoice.merchant)) revert InactiveMerchant();

        // Validate invoice not already paid
        if (paid[invoice.invoiceId]) revert InvoiceAlreadyPaid();

        // Validate expiry
        if (block.timestamp > invoice.expiry) revert InvoiceExpired();

        // Validate amount
        if (invoice.amount == 0) revert InvalidAmount();

        // Validate chain ID
        if (invoice.chainId != block.chainid) revert InvalidChainId();

        // Get merchant payout address
        address payoutAddress = REGISTRY.payoutOf(invoice.merchant);
        if (payoutAddress == address(0)) revert InvalidPayout();

        // Mark as paid
        paid[invoice.invoiceId] = true;

        // Process payment
        if (permitData.length > 0) {
            // Use Permit2 for gasless approval
            _settleWithPermit2(payer, payoutAddress, invoice.amount, permitData);
        } else {
            // Direct transferFrom (requires prior approval)
            _settleDirect(payer, payoutAddress, invoice.amount);
        }

        // Generate receipt ID
        receiptId = keccak256(abi.encode(invoice.invoiceId, payer, block.number));

        // Emit settlement event
        emit Settled(
            receiptId,
            invoice.invoiceId,
            payer,
            invoice.merchant,
            invoice.amount,
            invoice.chainId,
            blockhash(block.number - 1)
        );

        return receiptId;
    }

    /// @notice Settle payment using Permit2
    function _settleWithPermit2(
        address payer,
        address payoutAddress,
        uint256 amount,
        bytes calldata permitData
    ) internal {
        // Decode Permit2 signature
        IPermit2.PermitTransferFrom memory permit =
            IPermit2.PermitTransferFrom({token: address(PYUSD), amount: amount});

        IPermit2.SignatureTransferDetails memory transferDetails =
            IPermit2.SignatureTransferDetails({to: payoutAddress, requestedAmount: amount});

        try PERMIT2.permitTransferFrom(permit, transferDetails, payer, permitData) {}
        catch {
            revert TransferFailed();
        }
    }

    /// @notice Settle payment using direct transferFrom
    function _settleDirect(address payer, address payoutAddress, uint256 amount) internal {
        bool success = PYUSD.transferFrom(payer, payoutAddress, amount);
        if (!success) revert TransferFailed();
    }

    /// ============ VIEW FUNCTIONS ============

    /// @notice Check if an invoice has been paid
    /// @param invoiceId Invoice ID
    /// @return True if paid
    function isPaid(bytes32 invoiceId) external view returns (bool) {
        return paid[invoiceId];
    }
}

