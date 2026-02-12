// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DGEN1Token.sol";
import "../src/DGEN1Sale.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock USDC with 6 decimals
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DGEN1SaleTest is Test {
    DGEN1Token public token;
    MockUSDC public usdc;
    DGEN1Sale public sale;
    
    address public owner;
    address public buyer1;
    address public buyer2;
    
    uint256 constant USDC_PER_MILLION = 550 * 10**6; // 550 USDC
    uint256 constant TOKENS_PER_MILLION = 1_000_000 * 10**18;

    function setUp() public {
        owner = makeAddr("owner");
        buyer1 = makeAddr("buyer1");
        buyer2 = makeAddr("buyer2");
        
        // Deploy contracts
        vm.startPrank(owner);
        token = new DGEN1Token(owner);
        usdc = new MockUSDC();
        sale = new DGEN1Sale(address(token), address(usdc), owner);
        
        // Fund sale contract with tokens
        token.transfer(address(sale), 100_000_000 * 10**18); // 100 million tokens
        vm.stopPrank();
        
        // Give buyers some USDC
        usdc.mint(buyer1, 10_000 * 10**6); // 10,000 USDC
        usdc.mint(buyer2, 10_000 * 10**6);
    }

    function test_CalculateTokenAmount() public view {
        // 550 USDC should give 1 million tokens
        uint256 tokens = sale.calculateTokenAmount(550 * 10**6);
        assertEq(tokens, 1_000_000 * 10**18);
        
        // 1100 USDC should give 2 million tokens
        tokens = sale.calculateTokenAmount(1100 * 10**6);
        assertEq(tokens, 2_000_000 * 10**18);
        
        // 55 USDC should give 100,000 tokens
        tokens = sale.calculateTokenAmount(55 * 10**6);
        assertEq(tokens, 100_000 * 10**18);
    }

    function test_CalculateUsdcAmount() public view {
        // 1 million tokens should cost 550 USDC
        uint256 usdc_cost = sale.calculateUsdcAmount(1_000_000 * 10**18);
        assertEq(usdc_cost, 550 * 10**6);
        
        // 2 million tokens should cost 1100 USDC
        usdc_cost = sale.calculateUsdcAmount(2_000_000 * 10**18);
        assertEq(usdc_cost, 1100 * 10**6);
    }

    function test_BuyTokens() public {
        uint256 usdcAmount = 550 * 10**6; // 550 USDC
        uint256 expectedTokens = 1_000_000 * 10**18;
        
        vm.startPrank(buyer1);
        usdc.approve(address(sale), usdcAmount);
        uint256 tokensBought = sale.buyTokens(usdcAmount, buyer1);
        vm.stopPrank();
        
        assertEq(tokensBought, expectedTokens);
        assertEq(token.balanceOf(buyer1), expectedTokens);
        assertEq(usdc.balanceOf(address(sale)), usdcAmount);
        assertEq(sale.totalUsdcRaised(), usdcAmount);
        assertEq(sale.totalTokensSold(), expectedTokens);
    }

    function test_BuyTokensForDifferentRecipient() public {
        uint256 usdcAmount = 550 * 10**6;
        
        vm.startPrank(buyer1);
        usdc.approve(address(sale), usdcAmount);
        sale.buyTokens(usdcAmount, buyer2);
        vm.stopPrank();
        
        assertEq(token.balanceOf(buyer1), 0);
        assertEq(token.balanceOf(buyer2), 1_000_000 * 10**18);
    }

    function test_PurchaseFor() public {
        uint256 usdcAmount = 550 * 10**6;
        uint256 expectedTokens = 1_000_000 * 10**18;
        
        // Simulate Daimo Pay transferring USDC to sale contract
        vm.prank(buyer1);
        usdc.transfer(address(sale), usdcAmount);
        
        // Then calling purchaseFor
        uint256 tokensBought = sale.purchaseFor(buyer1, usdcAmount);
        
        assertEq(tokensBought, expectedTokens);
        assertEq(token.balanceOf(buyer1), expectedTokens);
    }

    function test_SaleNotActive() public {
        vm.prank(owner);
        sale.setSaleActive(false);
        
        vm.startPrank(buyer1);
        usdc.approve(address(sale), 550 * 10**6);
        vm.expectRevert("DGEN1Sale: sale not active");
        sale.buyTokens(550 * 10**6, buyer1);
        vm.stopPrank();
    }

    function test_InsufficientTokensAvailable() public {
        // Try to buy more tokens than available
        uint256 hugeUsdc = 100_000_000 * 10**6; // Would buy 181 million tokens
        usdc.mint(buyer1, hugeUsdc);
        
        vm.startPrank(buyer1);
        usdc.approve(address(sale), hugeUsdc);
        vm.expectRevert("DGEN1Sale: insufficient tokens available");
        sale.buyTokens(hugeUsdc, buyer1);
        vm.stopPrank();
    }

    function test_WithdrawUsdc() public {
        // First make a purchase
        vm.startPrank(buyer1);
        usdc.approve(address(sale), 550 * 10**6);
        sale.buyTokens(550 * 10**6, buyer1);
        vm.stopPrank();
        
        uint256 saleBalance = usdc.balanceOf(address(sale));
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        
        vm.prank(owner);
        sale.withdrawAllUsdc(owner);
        
        assertEq(usdc.balanceOf(address(sale)), 0);
        assertEq(usdc.balanceOf(owner), ownerBalanceBefore + saleBalance);
    }

    function test_WithdrawTokens() public {
        uint256 withdrawAmount = 1_000_000 * 10**18;
        uint256 availableBefore = sale.availableTokens();
        
        vm.prank(owner);
        sale.withdrawTokens(owner, withdrawAmount);
        
        assertEq(sale.availableTokens(), availableBefore - withdrawAmount);
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(buyer1);
        vm.expectRevert();
        sale.withdrawAllUsdc(buyer1);
    }
}

