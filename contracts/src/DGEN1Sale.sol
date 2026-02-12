// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DGEN1Sale
 * @dev Sale contract for DGEN1 tokens
 * 
 * Pricing: 550 USDC per 1 million DGEN1 tokens
 * Compatible with Daimo Pay for cross-chain payments
 */
contract DGEN1Sale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Token contracts
    IERC20 public immutable dgen1Token;
    IERC20 public immutable usdcToken;
    
    // Pricing: 550 USDC (6 decimals) per 1 million DGEN1 (18 decimals)
    // 550 * 10^6 USDC = 1,000,000 * 10^18 DGEN1
    // Rate: 1 USDC (6 decimals) = (1_000_000 * 10^18) / (550 * 10^6) DGEN1
    uint256 public constant USDC_PER_MILLION_TOKENS = 550 * 10**6; // 550 USDC (6 decimals)
    uint256 public constant TOKENS_PER_MILLION = 1_000_000 * 10**18; // 1 million DGEN1 (18 decimals)
    
    // Sale state
    bool public saleActive = true;
    uint256 public totalUsdcRaised;
    uint256 public totalTokensSold;
    
    // Events
    event TokensPurchased(
        address indexed buyer,
        uint256 usdcAmount,
        uint256 tokenAmount,
        address indexed recipient
    );
    event SaleStateChanged(bool active);
    event TokensWithdrawn(address indexed to, uint256 amount);
    event UsdcWithdrawn(address indexed to, uint256 amount);
    
    /**
     * @dev Constructor
     * @param _dgen1Token Address of the DGEN1 token contract
     * @param _usdcToken Address of the USDC token contract (on this chain)
     * @param _owner Address that will own this sale contract
     */
    constructor(
        address _dgen1Token,
        address _usdcToken,
        address _owner
    ) Ownable(_owner) {
        require(_dgen1Token != address(0), "DGEN1Sale: invalid token address");
        require(_usdcToken != address(0), "DGEN1Sale: invalid USDC address");
        
        dgen1Token = IERC20(_dgen1Token);
        usdcToken = IERC20(_usdcToken);
    }
    
    /**
     * @dev Calculate how many DGEN1 tokens can be bought with a given USDC amount
     * @param usdcAmount Amount of USDC (6 decimals)
     * @return tokenAmount Amount of DGEN1 tokens (18 decimals)
     */
    function calculateTokenAmount(uint256 usdcAmount) public pure returns (uint256 tokenAmount) {
        // tokenAmount = (usdcAmount * TOKENS_PER_MILLION) / USDC_PER_MILLION_TOKENS
        tokenAmount = (usdcAmount * TOKENS_PER_MILLION) / USDC_PER_MILLION_TOKENS;
    }
    
    /**
     * @dev Calculate how much USDC is needed for a given token amount
     * @param tokenAmount Amount of DGEN1 tokens desired (18 decimals)
     * @return usdcAmount Amount of USDC required (6 decimals)
     */
    function calculateUsdcAmount(uint256 tokenAmount) public pure returns (uint256 usdcAmount) {
        // usdcAmount = (tokenAmount * USDC_PER_MILLION_TOKENS) / TOKENS_PER_MILLION
        // Round up to ensure we don't undersell
        usdcAmount = (tokenAmount * USDC_PER_MILLION_TOKENS + TOKENS_PER_MILLION - 1) / TOKENS_PER_MILLION;
    }
    
    /**
     * @dev Buy DGEN1 tokens with USDC
     * @param usdcAmount Amount of USDC to spend (6 decimals)
     * @param recipient Address to receive the DGEN1 tokens
     * @return tokenAmount Amount of DGEN1 tokens purchased
     * 
     * Note: Caller must have approved this contract to spend their USDC
     */
    function buyTokens(uint256 usdcAmount, address recipient) external nonReentrant returns (uint256 tokenAmount) {
        require(saleActive, "DGEN1Sale: sale not active");
        require(usdcAmount > 0, "DGEN1Sale: amount must be > 0");
        require(recipient != address(0), "DGEN1Sale: invalid recipient");
        
        tokenAmount = calculateTokenAmount(usdcAmount);
        require(tokenAmount > 0, "DGEN1Sale: insufficient USDC for any tokens");
        
        // Check available tokens
        uint256 tokensAvailable = dgen1Token.balanceOf(address(this));
        require(tokensAvailable >= tokenAmount, "DGEN1Sale: insufficient tokens available");
        
        // Transfer USDC from buyer to this contract
        usdcToken.safeTransferFrom(msg.sender, address(this), usdcAmount);
        
        // Transfer DGEN1 tokens to recipient
        dgen1Token.safeTransfer(recipient, tokenAmount);
        
        // Update stats
        totalUsdcRaised += usdcAmount;
        totalTokensSold += tokenAmount;
        
        emit TokensPurchased(msg.sender, usdcAmount, tokenAmount, recipient);
    }
    
    /**
     * @dev Buy tokens for yourself (convenience function)
     * @param usdcAmount Amount of USDC to spend
     */
    function buyTokens(uint256 usdcAmount) external returns (uint256) {
        return this.buyTokens(usdcAmount, msg.sender);
    }
    
    /**
     * @dev Called by Daimo Pay to complete a purchase
     * This function is called after Daimo Pay transfers USDC to this contract
     * 
     * @param recipient Address to receive the DGEN1 tokens (the buyer)
     * @param usdcAmount Amount of USDC that was transferred
     * 
     * Note: This function expects USDC to already be transferred to this contract
     * by Daimo Pay before this call
     */
    function purchaseFor(address recipient, uint256 usdcAmount) external nonReentrant returns (uint256 tokenAmount) {
        require(saleActive, "DGEN1Sale: sale not active");
        require(usdcAmount > 0, "DGEN1Sale: amount must be > 0");
        require(recipient != address(0), "DGEN1Sale: invalid recipient");
        
        tokenAmount = calculateTokenAmount(usdcAmount);
        require(tokenAmount > 0, "DGEN1Sale: insufficient USDC for any tokens");
        
        // Check available tokens
        uint256 tokensAvailable = dgen1Token.balanceOf(address(this));
        require(tokensAvailable >= tokenAmount, "DGEN1Sale: insufficient tokens available");
        
        // Transfer DGEN1 tokens to recipient
        // USDC is already in this contract (transferred by Daimo Pay)
        dgen1Token.safeTransfer(recipient, tokenAmount);
        
        // Update stats
        totalUsdcRaised += usdcAmount;
        totalTokensSold += tokenAmount;
        
        emit TokensPurchased(msg.sender, usdcAmount, tokenAmount, recipient);
    }
    
    // ============ Owner Functions ============
    
    /**
     * @dev Enable or disable the sale
     */
    function setSaleActive(bool _active) external onlyOwner {
        saleActive = _active;
        emit SaleStateChanged(_active);
    }
    
    /**
     * @dev Withdraw DGEN1 tokens from the contract
     */
    function withdrawTokens(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "DGEN1Sale: invalid address");
        dgen1Token.safeTransfer(to, amount);
        emit TokensWithdrawn(to, amount);
    }
    
    /**
     * @dev Withdraw USDC from the contract
     */
    function withdrawUsdc(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "DGEN1Sale: invalid address");
        usdcToken.safeTransfer(to, amount);
        emit UsdcWithdrawn(to, amount);
    }
    
    /**
     * @dev Withdraw all USDC from the contract
     */
    function withdrawAllUsdc(address to) external onlyOwner {
        require(to != address(0), "DGEN1Sale: invalid address");
        uint256 balance = usdcToken.balanceOf(address(this));
        if (balance > 0) {
            usdcToken.safeTransfer(to, balance);
            emit UsdcWithdrawn(to, balance);
        }
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get the amount of DGEN1 tokens available for sale
     */
    function availableTokens() external view returns (uint256) {
        return dgen1Token.balanceOf(address(this));
    }
    
    /**
     * @dev Get the USDC balance in this contract
     */
    function usdcBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}

