// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Test} from "@forge-std/Test.sol";
import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";
import {Invoice} from "../src/core/Invoice.sol";
import {Checkout} from "../src/core/Checkout.sol";
import {BridgeEscrow} from "../src/core/BridgeEscrow.sol";
import {TapKitAccount} from "../src/account/TapKitAccount.sol";
import {TapKitAccountFactory} from "../src/account/TapKitAccountFactory.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock PYUSD token
contract MockPYUSD is ERC20 {
    constructor() ERC20("PayPal USD", "PYUSD") {}
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title Integration Test
/// @notice Tests the complete PyPay flow from merchant registration to payment settlement
contract IntegrationTest is Test {
    // Contracts
    MerchantRegistry public registry;
    Invoice public invoiceContract;
    Checkout public checkout;
    BridgeEscrow public bridgeEscrow;
    TapKitAccountFactory public factory;
    MockPYUSD public pyusd;
    
    // Actors
    address owner = address(0x1);
    address merchant = address(0x2);
    address merchantPayout = address(0x3);
    address buyer = address(0x4);
    address guardian = address(0x5);
    address permit2 = address(0x6); // Mock
    address entryPoint = 0x0000000071727De22E5E9d8BAf0edAc6f37da032; // Canonical
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy token
        pyusd = new MockPYUSD();
        
        // Deploy core contracts
        registry = new MerchantRegistry(owner);
        invoiceContract = new Invoice(address(registry));
        checkout = new Checkout(address(pyusd), permit2, address(registry));
        bridgeEscrow = new BridgeEscrow(owner, address(pyusd));
        
        // Deploy AA contracts
        factory = new TapKitAccountFactory(entryPoint);
        
        // Register merchant
        registry.registerMerchant(merchant, merchantPayout, 0);
        
        vm.stopPrank();
    }
    
    /// @notice Test complete payment flow: create invoice → pay → verify settlement
    function testCompletePaymentFlow() public {
        // 1. Merchant creates invoice
        uint256 amount = 100e6; // 100 PYUSD
        uint64 expiry = uint64(block.timestamp + 1 hours);
        bytes32 memoHash = keccak256("Coffee and pastry");
        uint256 chainId = block.chainid;
        bytes32 salt = keccak256("salt1");
        
        vm.prank(merchant);
        bytes32 invoiceId = invoiceContract.createInvoice(
            merchant,
            amount,
            expiry,
            memoHash,
            chainId,
            salt
        );
        
        // Verify invoice created
        assertTrue(invoiceContract.exists(invoiceId));
        assertTrue(invoiceContract.isValid(invoiceId));
        
        // 2. Buyer creates smart account
        address buyerAccount = factory.createAccount(buyer, guardian, 0);
        assertTrue(buyerAccount != address(0));
        
        // 3. Fund buyer account with PYUSD
        pyusd.mint(buyerAccount, amount);
        assertEq(pyusd.balanceOf(buyerAccount), amount);
        
        // 4. Approve checkout to spend PYUSD
        vm.prank(buyerAccount);
        pyusd.approve(address(checkout), amount);
        
        // 5. Settle invoice
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: amount,
            expiry: expiry,
            chainId: chainId,
            memoHash: memoHash
        });
        
        uint256 payoutBefore = pyusd.balanceOf(merchantPayout);
        
        vm.prank(buyerAccount);
        bytes32 receiptId = checkout.settle(invoiceTuple, buyerAccount, "");
        
        // 6. Verify payment settled
        assertTrue(checkout.paid(invoiceId));
        assertTrue(receiptId != bytes32(0));
        assertEq(pyusd.balanceOf(merchantPayout), payoutBefore + amount);
        assertEq(pyusd.balanceOf(buyerAccount), 0);
    }
    
    /// @notice Test bridge flow: lock on source → release on destination
    function testCompleteBridgeFlow() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge_ref_1");
        
        // 1. Buyer locks PYUSD on source chain
        pyusd.mint(buyer, amount);
        
        vm.startPrank(buyer);
        pyusd.approve(address(bridgeEscrow), amount);
        bridgeEscrow.lock(ref, amount);
        vm.stopPrank();
        
        // Verify locked
        assertTrue(bridgeEscrow.isLockProcessed(ref));
        assertEq(bridgeEscrow.getLockedAmount(ref), amount);
        
        // 2. Relayer (owner) releases PYUSD on destination chain
        // First, fund bridge inventory
        vm.startPrank(owner);
        pyusd.mint(owner, amount);
        pyusd.approve(address(bridgeEscrow), amount);
        bridgeEscrow.depositInventory(amount);
        
        // Release to buyer on destination
        uint256 buyerBefore = pyusd.balanceOf(buyer);
        bridgeEscrow.release(ref, buyer, amount);
        vm.stopPrank();
        
        // Verify released
        assertTrue(bridgeEscrow.isReleaseProcessed(ref));
        assertEq(pyusd.balanceOf(buyer), buyerBefore + amount);
    }
    
    /// @notice Test merchant deactivation prevents payment
    function testCannotPayInactiveMerchant() public {
        // Create invoice
        bytes32 invoiceId = invoiceContract.createInvoice(
            merchant,
            100e6,
            uint64(block.timestamp + 1 hours),
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
        
        // Deactivate merchant
        vm.prank(owner);
        registry.setActive(merchant, false);
        
        // Try to pay
        address buyerAccount = factory.createAccount(buyer, guardian, 0);
        pyusd.mint(buyerAccount, 100e6);
        
        vm.startPrank(buyerAccount);
        pyusd.approve(address(checkout), 100e6);
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: 100e6,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        vm.expectRevert(Checkout.InactiveMerchant.selector);
        checkout.settle(invoiceTuple, buyerAccount, "");
        vm.stopPrank();
    }
    
    /// @notice Test invoice expiry prevents payment
    function testCannotPayExpiredInvoice() public {
        // Create invoice
        uint64 expiry = uint64(block.timestamp + 1 hours);
        bytes32 invoiceId = invoiceContract.createInvoice(
            merchant,
            100e6,
            expiry,
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
        
        // Warp past expiry
        vm.warp(block.timestamp + 2 hours);
        
        // Verify invoice no longer valid
        assertFalse(invoiceContract.isValid(invoiceId));
        
        // Try to pay
        address buyerAccount = factory.createAccount(buyer, guardian, 0);
        pyusd.mint(buyerAccount, 100e6);
        
        vm.startPrank(buyerAccount);
        pyusd.approve(address(checkout), 100e6);
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: 100e6,
            expiry: expiry,
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        vm.expectRevert(Checkout.InvoiceExpired.selector);
        checkout.settle(invoiceTuple, buyerAccount, "");
        vm.stopPrank();
    }
    
    /// @notice Test deterministic account addresses
    function testDeterministicAccountAddresses() public {
        // Get counterfactual address
        address predicted = factory.getAddress(buyer, guardian, 0);
        
        // Create account
        address created = factory.createAccount(buyer, guardian, 0);
        
        // Verify they match
        assertEq(predicted, created);
        
        // Calling createAccount again returns same address
        address created2 = factory.createAccount(buyer, guardian, 0);
        assertEq(created, created2);
    }
}

