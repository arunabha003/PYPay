// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Test} from "@forge-std/Test.sol";
import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";

contract MerchantRegistryTest is Test {
    MerchantRegistry public registry;
    
    address owner = address(0x1);
    address merchant = address(0x2);
    address payout = address(0x3);
    uint16 feeBps = 100; // 1%
    
    function setUp() public {
        vm.prank(owner);
        registry = new MerchantRegistry(owner);
    }
    
    function testRegisterMerchant() public {
        vm.prank(owner);
        registry.registerMerchant(merchant, payout, feeBps);
        
        assertTrue(registry.isActive(merchant));
        assertEq(registry.payoutOf(merchant), payout);
        assertEq(registry.feeOf(merchant), feeBps);
    }
    
    function testCannotRegisterDuplicateMerchant() public {
        vm.startPrank(owner);
        registry.registerMerchant(merchant, payout, feeBps);
        
        vm.expectRevert(MerchantRegistry.MerchantAlreadyRegistered.selector);
        registry.registerMerchant(merchant, payout, feeBps);
        vm.stopPrank();
    }
    
    function testCannotRegisterInvalidAddress() public {
        vm.prank(owner);
        vm.expectRevert(MerchantRegistry.InvalidAddress.selector);
        registry.registerMerchant(address(0), payout, feeBps);
    }
    
    function testCannotRegisterInvalidFee() public {
        vm.prank(owner);
        vm.expectRevert(MerchantRegistry.InvalidFeeBps.selector);
        registry.registerMerchant(merchant, payout, 1001); // > MAX_FEE_BPS
    }
    
    function testSetActive() public {
        vm.startPrank(owner);
        registry.registerMerchant(merchant, payout, feeBps);
        
        registry.setActive(merchant, false);
        assertFalse(registry.isActive(merchant));
        
        registry.setActive(merchant, true);
        assertTrue(registry.isActive(merchant));
        vm.stopPrank();
    }
    
    function testUpdateMerchant() public {
        vm.startPrank(owner);
        registry.registerMerchant(merchant, payout, feeBps);
        
        address newPayout = address(0x4);
        uint16 newFeeBps = 200;
        
        registry.updateMerchant(merchant, newPayout, newFeeBps);
        
        assertEq(registry.payoutOf(merchant), newPayout);
        assertEq(registry.feeOf(merchant), newFeeBps);
        vm.stopPrank();
    }
    
    function testOnlyOwnerCanRegister() public {
        vm.prank(merchant);
        vm.expectRevert();
        registry.registerMerchant(merchant, payout, feeBps);
    }
    
    function testOnlyOwnerCanSetActive() public {
        vm.prank(owner);
        registry.registerMerchant(merchant, payout, feeBps);
        
        vm.prank(merchant);
        vm.expectRevert();
        registry.setActive(merchant, false);
    }
}

