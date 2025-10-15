// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Test} from "@forge-std/Test.sol";
import {BridgeEscrow} from "../src/core/BridgeEscrow.sol";
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

contract BridgeEscrowTest is Test {
    BridgeEscrow public escrow;
    MockPYUSD public pyusd;
    
    address owner = address(0x1);
    address payer = address(0x2);
    address recipient = address(0x3);
    
    function setUp() public {
        pyusd = new MockPYUSD();
        
        vm.prank(owner);
        escrow = new BridgeEscrow(owner, address(pyusd));
        
        // Mint PYUSD to payer and owner (for inventory)
        pyusd.mint(payer, 1000e6);
        pyusd.mint(owner, 1000e6);
    }
    
    function testLock() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge1");
        
        vm.startPrank(payer);
        pyusd.approve(address(escrow), amount);
        escrow.lock(ref, amount);
        vm.stopPrank();
        
        assertTrue(escrow.isLockProcessed(ref));
        assertEq(escrow.getLockedAmount(ref), amount);
        assertEq(pyusd.balanceOf(address(escrow)), amount);
    }
    
    function testCannotLockTwice() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge1");
        
        vm.startPrank(payer);
        pyusd.approve(address(escrow), amount * 2);
        
        escrow.lock(ref, amount);
        
        vm.expectRevert(BridgeEscrow.AlreadyProcessed.selector);
        escrow.lock(ref, amount);
        vm.stopPrank();
    }
    
    function testCannotLockZeroAmount() public {
        bytes32 ref = keccak256("bridge1");
        
        vm.prank(payer);
        vm.expectRevert(BridgeEscrow.InvalidAmount.selector);
        escrow.lock(ref, 0);
    }
    
    function testRelease() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge1");
        
        // Fund escrow inventory
        vm.startPrank(owner);
        pyusd.approve(address(escrow), amount);
        escrow.depositInventory(amount);
        
        // Release funds
        uint256 recipientBefore = pyusd.balanceOf(recipient);
        escrow.release(ref, recipient, amount);
        vm.stopPrank();
        
        assertTrue(escrow.isReleaseProcessed(ref));
        assertEq(pyusd.balanceOf(recipient), recipientBefore + amount);
    }
    
    function testCannotReleaseTwice() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge1");
        
        // Fund escrow inventory
        vm.startPrank(owner);
        pyusd.approve(address(escrow), amount * 2);
        escrow.depositInventory(amount * 2);
        
        escrow.release(ref, recipient, amount);
        
        vm.expectRevert(BridgeEscrow.AlreadyProcessed.selector);
        escrow.release(ref, recipient, amount);
        vm.stopPrank();
    }
    
    function testOnlyOwnerCanRelease() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge1");
        
        vm.prank(payer);
        vm.expectRevert();
        escrow.release(ref, recipient, amount);
    }
    
    function testCannotReleaseInsufficientInventory() public {
        uint256 amount = 100e6;
        bytes32 ref = keccak256("bridge1");
        
        vm.prank(owner);
        vm.expectRevert(BridgeEscrow.InsufficientBalance.selector);
        escrow.release(ref, recipient, amount);
    }
    
    function testDepositInventory() public {
        uint256 amount = 100e6;
        
        vm.startPrank(payer);
        pyusd.approve(address(escrow), amount);
        escrow.depositInventory(amount);
        vm.stopPrank();
        
        assertEq(escrow.inventoryBalance(), amount);
    }
    
    function testWithdrawInventory() public {
        uint256 amount = 100e6;
        
        // Deposit inventory
        vm.startPrank(owner);
        pyusd.approve(address(escrow), amount);
        escrow.depositInventory(amount);
        
        // Withdraw
        uint256 ownerBefore = pyusd.balanceOf(owner);
        escrow.withdrawInventory(owner, amount);
        vm.stopPrank();
        
        assertEq(pyusd.balanceOf(owner), ownerBefore + amount);
        assertEq(escrow.inventoryBalance(), 0);
    }
    
    function testOnlyOwnerCanWithdrawInventory() public {
        vm.prank(payer);
        vm.expectRevert();
        escrow.withdrawInventory(payer, 100e6);
    }
}

