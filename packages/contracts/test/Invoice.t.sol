// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Test} from "@forge-std/Test.sol";
import {Invoice} from "../src/core/Invoice.sol";
import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";

contract InvoiceTest is Test {
    Invoice public invoice;
    MerchantRegistry public registry;
    
    address owner = address(0x1);
    address merchant = address(0x2);
    address payout = address(0x3);
    
    function setUp() public {
        vm.startPrank(owner);
        registry = new MerchantRegistry(owner);
        invoice = new Invoice(address(registry));
        
        // Register merchant
        registry.registerMerchant(merchant, payout, 0);
        vm.stopPrank();
    }
    
    function testCreateInvoice() public {
        uint256 amount = 100e6; // 100 PYUSD
        uint64 expiry = uint64(block.timestamp + 1 hours);
        bytes32 memoHash = keccak256("Coffee");
        uint256 chainId = block.chainid;
        bytes32 salt = keccak256("salt1");
        
        bytes32 id = invoice.createInvoice(
            merchant,
            amount,
            expiry,
            memoHash,
            chainId,
            salt
        );
        
        assertTrue(invoice.exists(id));
        assertFalse(invoice.cancelled(id));
        
        Invoice.InvoiceData memory data = invoice.getInvoice(id);
        assertEq(data.merchant, merchant);
        assertEq(data.amount, amount);
        assertEq(data.expiry, expiry);
        assertEq(data.memoHash, memoHash);
        assertEq(data.chainId, chainId);
    }
    
    function testCannotCreateDuplicateInvoice() public {
        uint256 amount = 100e6;
        uint64 expiry = uint64(block.timestamp + 1 hours);
        bytes32 memoHash = keccak256("Coffee");
        uint256 chainId = block.chainid;
        bytes32 salt = keccak256("salt1");
        
        invoice.createInvoice(merchant, amount, expiry, memoHash, chainId, salt);
        
        vm.expectRevert(Invoice.InvoiceAlreadyExists.selector);
        invoice.createInvoice(merchant, amount, expiry, memoHash, chainId, salt);
    }
    
    function testCannotCreateInvoiceForInactiveMerchant() public {
        vm.prank(owner);
        registry.setActive(merchant, false);
        
        vm.expectRevert(Invoice.InactiveMerchant.selector);
        invoice.createInvoice(
            merchant,
            100e6,
            uint64(block.timestamp + 1 hours),
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
    }
    
    function testCancelInvoice() public {
        bytes32 id = invoice.createInvoice(
            merchant,
            100e6,
            uint64(block.timestamp + 1 hours),
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
        
        vm.prank(merchant);
        invoice.cancelInvoice(id);
        
        assertTrue(invoice.cancelled(id));
    }
    
    function testOnlyMerchantCanCancelInvoice() public {
        bytes32 id = invoice.createInvoice(
            merchant,
            100e6,
            uint64(block.timestamp + 1 hours),
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
        
        vm.prank(owner);
        vm.expectRevert(Invoice.UnauthorizedCancellation.selector);
        invoice.cancelInvoice(id);
    }
    
    function testIsValid() public {
        bytes32 id = invoice.createInvoice(
            merchant,
            100e6,
            uint64(block.timestamp + 1 hours),
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
        
        assertTrue(invoice.isValid(id));
        
        // Warp to after expiry
        vm.warp(block.timestamp + 2 hours);
        assertFalse(invoice.isValid(id));
    }
    
    function testIsValidAfterCancellation() public {
        bytes32 id = invoice.createInvoice(
            merchant,
            100e6,
            uint64(block.timestamp + 1 hours),
            keccak256("Coffee"),
            block.chainid,
            keccak256("salt1")
        );
        
        assertTrue(invoice.isValid(id));
        
        vm.prank(merchant);
        invoice.cancelInvoice(id);
        
        assertFalse(invoice.isValid(id));
    }
}

