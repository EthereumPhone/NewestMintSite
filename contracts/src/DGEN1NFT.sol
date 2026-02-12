// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title DGEN1NFT
 * @dev ERC721 NFT for dGEN1 device reservation with referral system and redemption
 *
 * Each NFT represents a reservation for one dGEN1 device.
 * Price: Configurable in USDC (on Base mainnet)
 *
 * Payment Flow:
 * - All USDC proceeds are sent immediately to TREASURY address
 * - No funds accumulate in the contract
 *
 * Referral System:
 * - Buyer with a non-zero, non-self referral gets 5% discount
 * - Referrer earns 5% of the original price - paid immediately
 * - Multiple NFTs can be purchased per address
 *
 * Redemption System:
 * - NFT holder can redeem (burn) their NFT with a commitment hash
 * - Commitment hash = keccak256(abi.encodePacked(uuid))
 * - After redemption, user sends unhashed UUID + shipping info to backend
 * - Backend verifies: keccak256(uuid) == stored commitment hash
 * - Each NFT can be redeemed independently (multiple redemptions per address allowed)
 */
contract DGEN1NFT is ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    // Payment token - USDC on Base mainnet (6 decimals)
    IERC20 public constant USDC = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);
    
    // Treasury address - all proceeds are sent here immediately
    address public constant TREASURY = 0xFE5cDA3C48d52b4EdF53361bF28C4213fDa7eA09;
    
    // Pricing (USDC has 6 decimals)
    uint256 public mintPrice; // e.g. 550 * 10**6 = 550 USDC
    uint256 public constant REFERRAL_DISCOUNT_BPS = 500; // 5% = 500 basis points
    uint256 public constant REFERRAL_REWARD_BPS = 500;   // 5% = 500 basis points
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // Supply
    uint256 public maxSupply;
    uint256 private _tokenIdCounter;
    
    // Metadata
    string private _baseTokenURI;
    
    // Sale state
    bool public saleActive = true;
    
    // Stats
    uint256 public totalUsdcRaised;
    uint256 public totalReferralsPaid;
    
    // Referral tracking
    mapping(address => uint256) public referralEarnings; // Total earned (for stats)
    mapping(address => uint256) public referralCount;
    mapping(address => uint256) public mintCount; // Track how many each address has minted
    
    // Redemption tracking
    struct Redemption {
        address redeemer;       // Original NFT owner who redeemed
        bytes32 commitmentHash; // keccak256(uuid) for backend verification
        uint256 redeemedAt;     // Block timestamp of redemption
        uint256 tokenId;        // Original token ID that was burned
    }
    
    // Mapping from commitment hash to redemption data
    mapping(bytes32 => Redemption) public redemptions;

    // Mapping from tokenId to its redemption commitment hash (0 if not redeemed)
    mapping(uint256 => bytes32) public tokenRedemption;

    // Track redemption count per address (for stats)
    mapping(address => uint256) public userRedemptionCount;

    // Total redemptions count
    uint256 public totalRedemptions;

    // Custom errors (more gas efficient)
    error NotActive();
    error SoldOut();
    error InvalidTo();
    error NotOwner();
    error InvalidHash();
    error HashUsed();
    error AlreadyRedeemed();
    error InvalidSize();
    error LenMismatch();
    error InvalidToken();
    error InvalidPrice();
    error InvalidAddr();
    error NoFunds();
    error MaxSupply();
    error InvalidQty();

    // Events
    event NFTMinted(address indexed to, uint256 indexed tokenId, uint256 pricePaid, address indexed referrer, uint256 referrerReward);
    event ReferralPaid(address indexed referrer, address indexed buyer, uint256 amount);
    event SaleStateChanged(bool active);
    event MintPriceChanged(uint256 oldPrice, uint256 newPrice);
    event MaxSupplyChanged(uint256 oldMaxSupply, uint256 newMaxSupply);
    event NFTRedeemed(address indexed redeemer, uint256 indexed tokenId, bytes32 indexed commitmentHash, uint256 timestamp);

    constructor(
        string memory baseURI,
        uint256 _mintPrice,
        uint256 _maxSupply
    ) ERC721("dGEN1 Device", "DGEN1") Ownable(msg.sender) {
        if (_mintPrice == 0) revert InvalidPrice();
        if (_maxSupply == 0) revert MaxSupply();
        _baseTokenURI = baseURI;
        mintPrice = _mintPrice;
        maxSupply = _maxSupply;
    }

    /**
     * @dev Calculate discounted price when using a referral (5% off)
     */
    function getDiscountedPrice() public view returns (uint256) {
        return mintPrice - (mintPrice * REFERRAL_DISCOUNT_BPS / BPS_DENOMINATOR);
    }

    /**
     * @dev Calculate referrer reward amount (5% of full price)
     */
    function getReferrerReward() public view returns (uint256) {
        return mintPrice * REFERRAL_REWARD_BPS / BPS_DENOMINATOR;
    }

    /**
     * @dev Mint NFT with optional referral - USDC must be approved first
     * @param referrer Address of the referrer (use address(0) for no referral)
     */
    function mint(address referrer) external nonReentrant returns (uint256 tokenId) {
        if (!saleActive) revert NotActive();
        if (_tokenIdCounter >= maxSupply) revert SoldOut();

        uint256 buyerPays;
        uint256 referrerReward = 0;

        // Check if valid referral
        // NOTE: Referrers do NOT need to own/mint a DGEN1 NFT.
        bool hasValidReferral = referrer != address(0) && referrer != msg.sender;

        if (hasValidReferral) {
            buyerPays = getDiscountedPrice();
            referrerReward = getReferrerReward();
        } else {
            buyerPays = mintPrice;
            referrer = address(0); // Reset invalid referrer
        }

        // Transfer USDC from buyer to contract first
        USDC.safeTransferFrom(msg.sender, address(this), buyerPays);

        // Pay referrer immediately if valid (from the received funds)
        if (hasValidReferral && referrerReward > 0) {
            USDC.safeTransfer(referrer, referrerReward);
            referralEarnings[referrer] += referrerReward;
            referralCount[referrer]++;
            totalReferralsPaid += referrerReward;
            emit ReferralPaid(referrer, msg.sender, referrerReward);

            // Forward remaining to treasury (buyerPays - referrerReward)
            USDC.safeTransfer(TREASURY, buyerPays - referrerReward);
        } else {
            // No referral - forward full amount to treasury
            USDC.safeTransfer(TREASURY, buyerPays);
        }

        // Track mint count
        mintCount[msg.sender]++;

        // Mint NFT
        _tokenIdCounter++;
        tokenId = _tokenIdCounter;
        _safeMint(msg.sender, tokenId);

        // Update stats
        totalUsdcRaised += buyerPays;

        emit NFTMinted(msg.sender, tokenId, buyerPays, referrer, referrerReward);
    }

    /**
     * @dev Mint NFT for another address (used by Daimo Pay)
     * Daimo Pay approves this contract to spend USDC, then calls this function
     * The contract pulls USDC from msg.sender (Daimo Pay) using transferFrom
     * @param to Address to receive the NFT
     * @param referrer Address of the referrer (use address(0) for no referral)
     */
    function mintFor(address to, address referrer) external nonReentrant returns (uint256 tokenId) {
        if (!saleActive) revert NotActive();
        if (to == address(0)) revert InvalidTo();
        if (_tokenIdCounter >= maxSupply) revert SoldOut();

        uint256 buyerPays;
        uint256 referrerReward = 0;

        // Check if valid referral
        // NOTE: Referrers do NOT need to own/mint a DGEN1 NFT.
        bool hasValidReferral = referrer != address(0) && referrer != to;

        if (hasValidReferral) {
            buyerPays = getDiscountedPrice();
            referrerReward = getReferrerReward();
        } else {
            buyerPays = mintPrice;
            referrer = address(0);
        }

        // Ensure USDC is available:
        // - Daimo Pay flow: USDC is transferred to this contract before calling mintFor
        // - Direct/integration flow: this contract can pull USDC from msg.sender via transferFrom (if approved)
        uint256 contractUsdcBal = USDC.balanceOf(address(this));
        uint256 amountToPull = contractUsdcBal < buyerPays ? (buyerPays - contractUsdcBal) : 0;

        if (amountToPull > 0) {
            USDC.safeTransferFrom(msg.sender, address(this), amountToPull);
        }

        // Pay referrer immediately if valid
        if (hasValidReferral && referrerReward > 0) {
            USDC.safeTransfer(referrer, referrerReward);
            referralEarnings[referrer] += referrerReward;
            referralCount[referrer]++;
            totalReferralsPaid += referrerReward;
            emit ReferralPaid(referrer, to, referrerReward);

            // Forward remaining to treasury (buyerPays - referrerReward)
            USDC.safeTransfer(TREASURY, buyerPays - referrerReward);
        } else {
            // No referral - forward full amount to treasury
            USDC.safeTransfer(TREASURY, buyerPays);
        }

        // Track mint count
        mintCount[to]++;

        // Mint NFT
        _tokenIdCounter++;
        tokenId = _tokenIdCounter;
        _safeMint(to, tokenId);

        // Update stats
        totalUsdcRaised += buyerPays;

        // Send any remaining USDC to the recipient (e.g., if full price was sent but discounted price was charged)
        // This forwards the referral discount to the buyer
        uint256 remainingBalance = USDC.balanceOf(address(this));
        if (remainingBalance > 0) {
            USDC.safeTransfer(to, remainingBalance);
        }

        emit NFTMinted(to, tokenId, buyerPays, referrer, referrerReward);
    }

    // ============ Redemption Functions ============

    /**
     * @dev Redeem (burn) an NFT with a commitment hash for backend verification
     *
     * Flow:
     * 1. Frontend generates a UUID
     * 2. Frontend computes commitmentHash = keccak256(abi.encodePacked(uuid))
     * 3. User calls redeem(tokenId, commitmentHash) - NFT is burned
     * 4. After tx confirms, user sends { uuid, shippingInfo } to backend
     * 5. Backend verifies: keccak256(uuid) == stored commitmentHash
     *
     * @param tokenId The token ID to redeem/burn
     * @param commitmentHash The keccak256 hash of a UUID (computed off-chain)
     */
    function redeem(uint256 tokenId, bytes32 commitmentHash) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (commitmentHash == bytes32(0)) revert InvalidHash();
        if (redemptions[commitmentHash].redeemer != address(0)) revert HashUsed();
        if (tokenRedemption[tokenId] != bytes32(0)) revert AlreadyRedeemed();

        // Store redemption data before burning
        redemptions[commitmentHash] = Redemption({
            redeemer: msg.sender,
            commitmentHash: commitmentHash,
            redeemedAt: block.timestamp,
            tokenId: tokenId
        });

        tokenRedemption[tokenId] = commitmentHash;
        userRedemptionCount[msg.sender]++;
        totalRedemptions++;

        // Burn the NFT
        _burn(tokenId);

        emit NFTRedeemed(msg.sender, tokenId, commitmentHash, block.timestamp);
    }

    /**
     * @dev Redeem (burn) multiple NFTs at once with commitment hashes
     * Each token gets its own UUID/commitment hash for tracking
     *
     * @param tokenIds Array of token IDs to redeem/burn
     * @param commitmentHashes Array of keccak256 hashes (one per token)
     */
    function redeemBatch(uint256[] calldata tokenIds, bytes32[] calldata commitmentHashes) external nonReentrant {
        if (tokenIds.length == 0 || tokenIds.length > 10) revert InvalidSize();
        if (tokenIds.length != commitmentHashes.length) revert LenMismatch();

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            bytes32 commitmentHash = commitmentHashes[i];

            if (ownerOf(tokenId) != msg.sender) revert NotOwner();
            if (commitmentHash == bytes32(0)) revert InvalidHash();
            if (redemptions[commitmentHash].redeemer != address(0)) revert HashUsed();
            if (tokenRedemption[tokenId] != bytes32(0)) revert AlreadyRedeemed();

            // Store redemption data before burning
            redemptions[commitmentHash] = Redemption({
                redeemer: msg.sender,
                commitmentHash: commitmentHash,
                redeemedAt: block.timestamp,
                tokenId: tokenId
            });

            tokenRedemption[tokenId] = commitmentHash;
            totalRedemptions++;

            // Burn the NFT
            _burn(tokenId);

            emit NFTRedeemed(msg.sender, tokenId, commitmentHash, block.timestamp);
        }

        userRedemptionCount[msg.sender] += tokenIds.length;
    }

    /**
     * @dev Verify a redemption commitment (for backend use)
     * Backend calls this with keccak256(uuid) to verify the redemption
     * 
     * @param commitmentHash The keccak256(uuid) to verify
     * @return isValid Whether this commitment hash was used in a redemption
     * @return redeemer The address that performed the redemption
     * @return tokenId The original token ID that was burned
     * @return redeemedAt The timestamp when redemption occurred
     */
    function verifyRedemption(bytes32 commitmentHash) external view returns (
        bool isValid,
        address redeemer,
        uint256 tokenId,
        uint256 redeemedAt
    ) {
        Redemption memory r = redemptions[commitmentHash];
        isValid = r.redeemer != address(0);
        redeemer = r.redeemer;
        tokenId = r.tokenId;
        redeemedAt = r.redeemedAt;
    }

    /**
     * @dev Check if a specific token has been redeemed
     * @param tokenId The token ID to check
     * @return redeemed Whether the token has been redeemed
     * @return commitmentHash The commitment hash used (or bytes32(0) if not redeemed)
     */
    function isTokenRedeemed(uint256 tokenId) external view returns (bool redeemed, bytes32 commitmentHash) {
        bytes32 commitment = tokenRedemption[tokenId];
        return (commitment != bytes32(0), commitment);
    }

    /**
     * @dev Get redemption count for an address
     * @param addr The address to check
     * @return count Number of NFTs this address has redeemed
     */
    function getRedemptionCount(address addr) external view returns (uint256 count) {
        return userRedemptionCount[addr];
    }

    /**
     * @dev Get full redemption details for a token
     * @param tokenId The token ID to query
     */
    function getRedemptionByToken(uint256 tokenId) external view returns (
        bool redeemed,
        bytes32 commitmentHash,
        address redeemer,
        uint256 redeemedAt
    ) {
        bytes32 commitment = tokenRedemption[tokenId];
        if (commitment == bytes32(0)) {
            return (false, bytes32(0), address(0), 0);
        }
        Redemption memory r = redemptions[commitment];
        return (true, r.commitmentHash, r.redeemer, r.redeemedAt);
    }

    // ============ View Functions ============

    /**
     * @dev Get total minted count
     */
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev Get remaining supply
     */
    function remainingSupply() external view returns (uint256) {
        return maxSupply - _tokenIdCounter;
    }

    /**
     * @dev Get mint price (full price without referral)
     */
    function getMintPrice() external view returns (uint256) {
        return mintPrice;
    }

    /**
     * @dev Check if minting is possible (supply available)
     */
    function canMint(address) external view returns (bool) {
        return _tokenIdCounter < maxSupply && saleActive;
    }

    /**
     * @dev Get mint count for an address
     */
    function getMintCount(address addr) external view returns (uint256) {
        return mintCount[addr];
    }

    /**
     * @dev Get referral stats for an address
     */
    function getReferralStats(address referrer) external view returns (
        uint256 totalEarned,
        uint256 count,
        bool isEligibleReferrer
    ) {
        totalEarned = referralEarnings[referrer];
        count = referralCount[referrer];
        // NOTE: Referrers do NOT need to own/mint a DGEN1 NFT.
        // "Eligibility" here simply means: would this address be accepted as a referrer (non-zero).
        isEligibleReferrer = referrer != address(0);
    }

    /**
     * @dev Token URI - returns baseURL + tokenId (no .json suffix)
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken();
        return string.concat(_baseTokenURI, Strings.toString(tokenId));
    }

    /**
     * @dev Base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // ============ Owner Functions ============

    /**
     * @dev Set sale active state
     */
    function setSaleActive(bool _active) external onlyOwner {
        saleActive = _active;
        emit SaleStateChanged(_active);
    }

    /**
     * @dev Set mint price in USDC (6 decimals)
     * @param _newPrice New price in USDC with 6 decimals (e.g. 550 * 10**6 for 550 USDC)
     */
    function setMintPrice(uint256 _newPrice) external onlyOwner {
        if (_newPrice == 0) revert InvalidPrice();
        emit MintPriceChanged(mintPrice, _newPrice);
        mintPrice = _newPrice;
    }

    /**
     * @dev Set max supply of NFTs
     * @param _newMaxSupply New maximum supply (must be >= current minted count)
     */
    function setMaxSupply(uint256 _newMaxSupply) external onlyOwner {
        if (_newMaxSupply < _tokenIdCounter) revert MaxSupply();
        emit MaxSupplyChanged(maxSupply, _newMaxSupply);
        maxSupply = _newMaxSupply;
    }

    /**
     * @dev Set base URI for metadata
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    /**
     * @dev Withdraw any USDC from contract (emergency/safety function)
     * Note: Funds are normally forwarded to TREASURY immediately on mint
     */
    function withdrawFunds(address to) external onlyOwner {
        if (to == address(0)) revert InvalidAddr();
        uint256 balance = USDC.balanceOf(address(this));
        if (balance == 0) revert NoFunds();
        USDC.safeTransfer(to, balance);
    }

    /**
     * @dev Owner mint (for team/giveaways)
     */
    function ownerMint(address to) external onlyOwner returns (uint256 tokenId) {
        if (_tokenIdCounter >= maxSupply) revert MaxSupply();
        if (to == address(0)) revert InvalidTo();
        _tokenIdCounter++;
        tokenId = _tokenIdCounter;
        _safeMint(to, tokenId);
        emit NFTMinted(to, tokenId, 0, address(0), 0);
    }

    /**
     * @dev Mint multiple NFTs for another address (used by Daimo Pay for batch mints)
     * Daimo Pay sends USDC to this contract, then calls this function
     * @param to Address to receive the NFTs
     * @param referrer Address of the referrer (use address(0) for no referral)
     * @param quantity Number of NFTs to mint (1-10)
     * @return firstTokenId The first token ID minted
     */
    function mintForBatch(address to, address referrer, uint256 quantity) external nonReentrant returns (uint256 firstTokenId) {
        if (!saleActive) revert NotActive();
        if (to == address(0)) revert InvalidTo();
        if (quantity == 0 || quantity > 10) revert InvalidQty();
        if (_tokenIdCounter + quantity > maxSupply) revert MaxSupply();

        uint256 singlePrice;
        uint256 singleReferrerReward = 0;

        // Check if valid referral
        bool hasValidReferral = referrer != address(0) && referrer != to;

        if (hasValidReferral) {
            singlePrice = getDiscountedPrice();
            singleReferrerReward = getReferrerReward();
        } else {
            singlePrice = mintPrice;
            referrer = address(0);
        }

        uint256 totalPrice = singlePrice * quantity;
        uint256 totalReferrerReward = singleReferrerReward * quantity;

        // Ensure USDC is available
        uint256 contractUsdcBal = USDC.balanceOf(address(this));
        uint256 amountToPull = contractUsdcBal < totalPrice ? (totalPrice - contractUsdcBal) : 0;

        if (amountToPull > 0) {
            USDC.safeTransferFrom(msg.sender, address(this), amountToPull);
        }

        // Pay referrer immediately if valid
        if (hasValidReferral && totalReferrerReward > 0) {
            USDC.safeTransfer(referrer, totalReferrerReward);
            referralEarnings[referrer] += totalReferrerReward;
            referralCount[referrer] += quantity;
            totalReferralsPaid += totalReferrerReward;
            emit ReferralPaid(referrer, to, totalReferrerReward);

            // Forward remaining to treasury
            USDC.safeTransfer(TREASURY, totalPrice - totalReferrerReward);
        } else {
            // No referral - forward full amount to treasury
            USDC.safeTransfer(TREASURY, totalPrice);
        }

        // Track mint count
        mintCount[to] += quantity;

        // Mint NFTs
        firstTokenId = _tokenIdCounter + 1;
        for (uint256 i = 0; i < quantity; i++) {
            _tokenIdCounter++;
            uint256 tokenId = _tokenIdCounter;
            _safeMint(to, tokenId);
            emit NFTMinted(to, tokenId, singlePrice, referrer, singleReferrerReward);
        }

        // Update stats
        totalUsdcRaised += totalPrice;

        // Send any remaining USDC to the recipient (e.g., if full price was sent but discounted price was charged)
        // This forwards the referral discount to the buyer
        uint256 remainingBalance = USDC.balanceOf(address(this));
        if (remainingBalance > 0) {
            USDC.safeTransfer(to, remainingBalance);
        }
    }
}
