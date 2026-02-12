// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DGEN1Token.sol";

contract DGEN1TokenTest is Test {
    DGEN1Token public token;
    address public owner;
    address public user1;
    address public user2;

    function setUp() public {
        owner = makeAddr("owner");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        vm.prank(owner);
        token = new DGEN1Token(owner);
    }

    function test_InitialSupply() public view {
        assertEq(token.totalSupply(), 3_000_000_000 * 10**18);
        assertEq(token.balanceOf(owner), 3_000_000_000 * 10**18);
    }

    function test_TokenMetadata() public view {
        assertEq(token.name(), "dGEN1");
        assertEq(token.symbol(), "DGEN1");
        assertEq(token.decimals(), 18);
    }

    function test_OwnerCanMint() public {
        uint256 mintAmount = 1_000_000 * 10**18;
        
        vm.prank(owner);
        token.mint(user1, mintAmount);
        
        assertEq(token.balanceOf(user1), mintAmount);
        assertEq(token.totalSupply(), 3_000_000_000 * 10**18 + mintAmount);
    }

    function test_NonOwnerCannotMint() public {
        vm.prank(user1);
        vm.expectRevert();
        token.mint(user2, 1000 * 10**18);
    }

    function test_MintBatch() public {
        address[] memory recipients = new address[](3);
        recipients[0] = user1;
        recipients[1] = user2;
        recipients[2] = makeAddr("user3");
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100 * 10**18;
        amounts[1] = 200 * 10**18;
        amounts[2] = 300 * 10**18;
        
        vm.prank(owner);
        token.mintBatch(recipients, amounts);
        
        assertEq(token.balanceOf(user1), 100 * 10**18);
        assertEq(token.balanceOf(user2), 200 * 10**18);
        assertEq(token.balanceOf(recipients[2]), 300 * 10**18);
    }

    function test_MintBatchArrayMismatch() public {
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](3);
        
        vm.prank(owner);
        vm.expectRevert("DGEN1: arrays length mismatch");
        token.mintBatch(recipients, amounts);
    }

    function test_Transfer() public {
        uint256 transferAmount = 1000 * 10**18;
        
        vm.prank(owner);
        token.transfer(user1, transferAmount);
        
        assertEq(token.balanceOf(user1), transferAmount);
        assertEq(token.balanceOf(owner), 3_000_000_000 * 10**18 - transferAmount);
    }
}

