// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Test} from "@forge-std/Test.sol";
import {Checkout} from "../src/core/Checkout.sol";
import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";
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

contract CheckoutTest is Test {
    Checkout public checkout;
    MerchantRegistry public registry;
    MockPYUSD public pyusd;
    
    address owner = address(0x1);
    address merchant = address(0x2);
    address payout = address(0x3);
    address payer = address(0x4);
    address permit2 = address(0x5); // Mock Permit2
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy contracts
        pyusd = new MockPYUSD();
        registry = new MerchantRegistry(owner);
        checkout = new Checkout(address(pyusd), permit2, address(registry));
        
        // Register merchant
        registry.registerMerchant(merchant, payout, 0);
        
        vm.stopPrank();
        
        // Mint PYUSD to payer
        pyusd.mint(payer, 1000e6);
    }
    
    function testSettleDirect() public {
        uint256 amount = 100e6;
        bytes32 invoiceId = keccak256("invoice1");
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: amount,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        // Payer approves checkout
        vm.prank(payer);
        pyusd.approve(address(checkout), amount);
        
        // Settle invoice
        uint256 payoutBefore = pyusd.balanceOf(payout);
        
        vm.prank(payer);
        bytes32 receiptId = checkout.settle(invoiceTuple, payer, "");
        
        // Verify payment
        assertTrue(checkout.paid(invoiceId));
        assertEq(pyusd.balanceOf(payout), payoutBefore + amount);
        assertTrue(receiptId != bytes32(0));
    }
    
    function testCannotSettleExpiredInvoice() public {
        uint256 amount = 100e6;
        bytes32 invoiceId = keccak256("invoice1");
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: amount,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        // Warp past expiry
        vm.warp(block.timestamp + 2 hours);
        
        vm.prank(payer);
        vm.expectRevert(Checkout.InvoiceExpired.selector);
        checkout.settle(invoiceTuple, payer, "");
    }
    
    function testCannotSettleAlreadyPaid() public {
        uint256 amount = 100e6;
        bytes32 invoiceId = keccak256("invoice1");
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: amount,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        vm.startPrank(payer);
        pyusd.approve(address(checkout), amount * 2);
        
        // First payment succeeds
        checkout.settle(invoiceTuple, payer, "");
        
        // Second payment fails
        vm.expectRevert(Checkout.InvoiceAlreadyPaid.selector);
        checkout.settle(invoiceTuple, payer, "");
        vm.stopPrank();
    }
    
    function testCannotSettleInactiveMerchant() public {
        // Deactivate merchant
        vm.prank(owner);
        registry.setActive(merchant, false);
        
        uint256 amount = 100e6;
        bytes32 invoiceId = keccak256("invoice1");
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: amount,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        vm.prank(payer);
        vm.expectRevert(Checkout.InactiveMerchant.selector);
        checkout.settle(invoiceTuple, payer, "");
    }
    
    function testCannotSettleZeroAmount() public {
        bytes32 invoiceId = keccak256("invoice1");
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: 0,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid,
            memoHash: keccak256("Coffee")
        });
        
        vm.prank(payer);
        vm.expectRevert(Checkout.InvalidAmount.selector);
        checkout.settle(invoiceTuple, payer, "");
    }
    
    function testCannotSettleWrongChain() public {
        uint256 amount = 100e6;
        bytes32 invoiceId = keccak256("invoice1");
        
        Checkout.InvoiceTuple memory invoiceTuple = Checkout.InvoiceTuple({
            invoiceId: invoiceId,
            merchant: merchant,
            amount: amount,
            expiry: uint64(block.timestamp + 1 hours),
            chainId: block.chainid + 1, // Wrong chain
            memoHash: keccak256("Coffee")
        });
        
        vm.prank(payer);
        vm.expectRevert(Checkout.InvalidChainId.selector);
        checkout.settle(invoiceTuple, payer, "");
    }
}

