// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import "@solady/src/auth/Ownable.sol";

/// @title TapKitPaymaster
/// @notice ERC-4337 Paymaster that sponsors gas for valid PyPay settle transactions
/// @dev Policy-based validation: only sponsors Checkout.settle for active merchants with valid invoices
contract TapKitPaymaster is Ownable {
    /// ============ ERRORS ============

    error InvalidCaller();
    error InvalidTarget();
    error InvalidFunction();
    error InactiveMerchant();
    error InvoiceAlreadyPaid();
    error InvoiceExpired();
    error InvalidAmount();
    error InvalidToken();

    /// ============ EVENTS ============

    event PaymasterSponsored(address indexed sender, bytes32 indexed invoiceId, uint256 amount);

    /// ============ CONSTANTS ============

    /// @dev The canonical ERC4337 EntryPoint contract (0.7)
    address internal constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    /// @dev Prehash of `keccak256("")` for validation efficiency
    bytes32 internal constant _NULL_HASH =
        0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;

    /// @dev Function selector for Checkout.settle
    bytes4 internal constant SETTLE_SELECTOR = bytes4(keccak256("settle((bytes32,address,uint256,uint64,uint256,bytes32),address,bytes)"));

    /// ============ STRUCTS ============

    /// @dev The packed ERC4337 userOp struct (0.7)
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    /// @dev Invoice tuple structure
    struct InvoiceTuple {
        bytes32 invoiceId;
        address merchant;
        uint256 amount;
        uint64 expiry;
        uint256 chainId;
        bytes32 memoHash;
    }

    /// ============ IMMUTABLES ============

    address public immutable checkoutContract;
    address public immutable merchantRegistry;
    address public immutable pyusdToken;

    /// ============ STORAGE ============

    /// @notice Maximum amount per transaction (safety limit)
    uint256 public maxAmountPerTx;

    /// ============ CONSTRUCTOR ============

    constructor(
        address _owner,
        address _checkoutContract,
        address _merchantRegistry,
        address _pyusdToken,
        uint256 _maxAmountPerTx
    ) payable {
        require(_checkoutContract != address(0), "Invalid checkout");
        require(_merchantRegistry != address(0), "Invalid registry");
        require(_pyusdToken != address(0), "Invalid token");

        _initializeOwner(_owner);
        checkoutContract = _checkoutContract;
        merchantRegistry = _merchantRegistry;
        pyusdToken = _pyusdToken;
        maxAmountPerTx = _maxAmountPerTx;
    }

    /// ============ VALIDATION ============

    /// @notice Validates paymaster user operation
    /// @dev Only sponsors Checkout.settle calls for valid invoices
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32, /*userOpHash*/
        uint256 /*maxCost*/
    ) public payable virtual returns (bytes memory context, uint256 validationData) {
        // Only EntryPoint can call
        assembly ("memory-safe") {
            if iszero(eq(caller(), ENTRY_POINT)) { revert(codesize(), codesize()) }
        }

        // Extract time bounds from paymasterAndData if present
        (uint48 validUntil, uint48 validAfter) = (
            userOp.paymasterAndData.length >= 52
                ? (uint48(bytes6(userOp.paymasterAndData[20:26])), uint48(bytes6(userOp.paymasterAndData[26:32])))
                : (uint48(0), uint48(0))
        );

        // Decode callData to validate it's calling Checkout.settle
        if (userOp.callData.length < 4) revert InvalidFunction();

        // Check if this is an execute call (most AA accounts use execute(target, value, data))
        address target;
        bytes memory innerCallData;

        // Try to decode as execute(address,uint256,bytes)
        if (bytes4(userOp.callData[:4]) == bytes4(keccak256("execute(address,uint256,bytes)"))) {
            (, target,, innerCallData) = abi.decode(
                userOp.callData[4:], (bytes4, address, uint256, bytes)
            );
        } else {
            // Direct call - treat userOp.sender as target
            target = userOp.sender;
            innerCallData = userOp.callData;
        }

        // Verify target is Checkout contract
        if (target != checkoutContract) revert InvalidTarget();

        // Verify function is settle
        if (innerCallData.length < 4) revert InvalidFunction();
        
        bytes4 selector;
        assembly {
            selector := mload(add(innerCallData, 32))
        }
        if (selector != SETTLE_SELECTOR) {
            revert InvalidFunction();
        }

        // Decode invoice tuple from settle callData (skip first 4 bytes for selector)
        bytes memory invoiceData = new bytes(innerCallData.length - 4);
        for (uint256 i = 0; i < invoiceData.length; i++) {
            invoiceData[i] = innerCallData[i + 4];
        }
        (InvoiceTuple memory invoice,,) =
            abi.decode(invoiceData, (InvoiceTuple, address, bytes));

        // Validate invoice
        _validateInvoice(invoice);

        // Prepare context (invoiceId for postOp)
        context = abi.encode(invoice.invoiceId, invoice.merchant, invoice.amount);

        // Return validation data with time bounds
        validationData = _packValidationData(true, validUntil, validAfter);

        return (context, validationData);
    }

    /// @notice Validates invoice constraints
    function _validateInvoice(InvoiceTuple memory invoice) internal view {
        // Check amount is within limits
        if (invoice.amount == 0 || invoice.amount > maxAmountPerTx) revert InvalidAmount();

        // Check expiry
        if (block.timestamp > invoice.expiry) revert InvoiceExpired();

        // Check chain ID matches current chain
        if (invoice.chainId != block.chainid) revert InvalidToken();

        // Check merchant is active
        (bool success, bytes memory data) = merchantRegistry.staticcall(
            abi.encodeWithSignature("isActive(address)", invoice.merchant)
        );
        if (!success || !abi.decode(data, (bool))) revert InactiveMerchant();

        // Check invoice not already paid (call Checkout contract)
        (success, data) =
            checkoutContract.staticcall(abi.encodeWithSignature("paid(bytes32)", invoice.invoiceId));
        if (success && abi.decode(data, (bool))) revert InvoiceAlreadyPaid();
    }

    /// @notice Post-operation hook (optional)
    function postOp(
        uint8 mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external {
        assembly ("memory-safe") {
            if iszero(eq(caller(), ENTRY_POINT)) { revert(codesize(), codesize()) }
        }

        // Decode context
        (bytes32 invoiceId, address merchant, uint256 amount) =
            abi.decode(context, (bytes32, address, uint256));

        emit PaymasterSponsored(msg.sender, invoiceId, amount);

        // Note: In production, you might implement fee collection or accounting here
        // For MVP, we simply sponsor without taking fees
    }

    /// @notice Pack validation data
    function _packValidationData(bool valid, uint48 validUntil, uint48 validAfter)
        internal
        pure
        returns (uint256)
    {
        return (valid ? 0 : 1) | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
    }

    /// @notice Keccak function over calldata
    function _calldataKeccak(bytes calldata data) internal pure returns (bytes32 hash) {
        assembly ("memory-safe") {
            let m := mload(0x40)
            let l := data.length
            calldatacopy(m, data.offset, l)
            hash := keccak256(m, l)
        }
    }

    /// ============ STAKING OPERATIONS ============

    /// @notice Add stake for this paymaster
    function addStake(uint32 unstakeDelaySec) public payable virtual onlyOwner {
        (bool success,) = ENTRY_POINT.call{value: msg.value}(
            abi.encodeWithSignature("addStake(uint32)", unstakeDelaySec)
        );
        require(success, "Stake failed");
    }

    /// @notice Unlock the stake
    function unlockStake() public payable virtual onlyOwner {
        (bool success,) = ENTRY_POINT.call(abi.encodeWithSignature("unlockStake()"));
        require(success, "Unlock failed");
    }

    /// @notice Withdraw the entire paymaster's stake
    function withdrawStake(address payable withdrawAddress) public payable virtual onlyOwner {
        (bool success,) = ENTRY_POINT.call(
            abi.encodeWithSignature("withdrawStake(address)", withdrawAddress)
        );
        require(success, "Withdraw failed");
    }

    /// @notice Withdraw funds from paymaster
    function withdrawFunds(address payable to, uint256 amount) external onlyOwner {
        (bool success,) = to.call{value: amount}("");
        require(success, "Withdraw failed");
    }

    /// @notice Update max amount per transaction
    function setMaxAmountPerTx(uint256 _maxAmountPerTx) external onlyOwner {
        maxAmountPerTx = _maxAmountPerTx;
    }

    /// @notice Receive function to accept ETH
    receive() external payable {}
}

