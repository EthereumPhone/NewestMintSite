// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DGEN1NFT.sol";
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

contract DGEN1NFTTest is Test {
    DGEN1NFT public nft;
    MockUSDC public usdc;

    // Hardcoded USDC address in DGEN1NFT contract
    address constant USDC_ADDRESS = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    address public owner;
    address public minter1;
    address public minter2;
    address public referrer;

    uint256 constant MINT_PRICE = 550 * 10**6; // 550 USDC

    function setUp() public {
        owner = makeAddr("owner");
        minter1 = makeAddr("minter1");
        minter2 = makeAddr("minter2");
        referrer = makeAddr("referrer");

        // Deploy MockUSDC at a temporary address first
        MockUSDC tempUsdc = new MockUSDC();

        // Copy the MockUSDC bytecode to the hardcoded USDC address
        vm.etch(USDC_ADDRESS, address(tempUsdc).code);
        usdc = MockUSDC(USDC_ADDRESS);

        // Deploy DGEN1NFT (uses hardcoded USDC address)
        vm.prank(owner);
        nft = new DGEN1NFT("https://api.markushaas.com/api/token-metadata?t=", MINT_PRICE, 10000);

        // Give minters some USDC
        usdc.mint(minter1, 10_000 * 10**6); // 10,000 USDC
        usdc.mint(minter2, 10_000 * 10**6);
        usdc.mint(referrer, 10_000 * 10**6);
    }

    function test_Metadata() public view {
        assertEq(nft.name(), "dGEN1 Device");
        assertEq(nft.symbol(), "DGEN1");
        assertEq(nft.maxSupply(), 10000);
        assertEq(nft.mintPrice(), MINT_PRICE);
    }

    function test_MintSingle() public {
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0)); // No referrer
        vm.stopPrank();

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(1), minter1);
        assertEq(nft.balanceOf(minter1), 1);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.mintCount(minter1), 1);
    }

    function test_CanMintMultiple() public {
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE * 3);

        uint256 tokenId1 = nft.mint(address(0));
        uint256 tokenId2 = nft.mint(address(0));
        uint256 tokenId3 = nft.mint(address(0));
        vm.stopPrank();

        assertEq(tokenId1, 1);
        assertEq(tokenId2, 2);
        assertEq(tokenId3, 3);
        assertEq(nft.balanceOf(minter1), 3);
        assertEq(nft.mintCount(minter1), 3);
        assertEq(nft.totalMinted(), 3);
    }

    function test_MintWithReferral() public {
        uint256 discountedPrice = nft.getDiscountedPrice();
        uint256 referrerReward = nft.getReferrerReward();
        uint256 referrerBalanceBefore = usdc.balanceOf(referrer);

        // Minter1 mints with referral
        vm.startPrank(minter1);
        usdc.approve(address(nft), discountedPrice);
        nft.mint(referrer);
        vm.stopPrank();

        assertEq(nft.balanceOf(minter1), 1);
        // Referrer should have received reward immediately
        assertEq(usdc.balanceOf(referrer), referrerBalanceBefore + referrerReward);
        assertEq(nft.referralCount(referrer), 1);
        assertEq(nft.referralEarnings(referrer), referrerReward);
    }

    function test_SelfReferralPaysFullPrice() public {
        address treasury = nft.TREASURY();
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 minterBalanceBefore = usdc.balanceOf(minter1);

        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        nft.mint(minter1); // Self-referral should be treated as invalid and charge full price
        vm.stopPrank();

        // No referral reward should be paid
        assertEq(nft.referralCount(minter1), 0);
        assertEq(nft.referralEarnings(minter1), 0);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + MINT_PRICE);
        assertEq(usdc.balanceOf(minter1), minterBalanceBefore - MINT_PRICE);
    }

    function test_MintFor() public {
        // Simulate Daimo Pay transferring USDC to contract first
        vm.prank(minter1);
        usdc.transfer(address(nft), MINT_PRICE);

        // Then calling mintFor
        uint256 tokenId = nft.mintFor(minter1, address(0));

        assertEq(tokenId, 1);
        assertEq(nft.balanceOf(minter1), 1);
        assertEq(nft.mintCount(minter1), 1);
    }

    function test_MintForWithReferral() public {
        uint256 discountedPrice = nft.getDiscountedPrice();
        uint256 referrerReward = nft.getReferrerReward();
        uint256 referrerBalanceBefore = usdc.balanceOf(referrer);

        // Simulate Daimo Pay transferring discounted USDC to contract
        vm.prank(minter1);
        usdc.transfer(address(nft), discountedPrice);

        // Then calling mintFor with referral
        nft.mintFor(minter1, referrer);

        assertEq(nft.balanceOf(minter1), 1);
        // Referrer should have received reward immediately
        assertEq(usdc.balanceOf(referrer), referrerBalanceBefore + referrerReward);
    }

    function test_GetMintPrice() public view {
        assertEq(nft.getMintPrice(), MINT_PRICE);
    }

    function test_GetDiscountedPrice() public view {
        // 5% discount = 95% of full price
        uint256 expected = MINT_PRICE - (MINT_PRICE * 500 / 10000);
        assertEq(nft.getDiscountedPrice(), expected);
    }

    function test_GetReferrerReward() public view {
        // 5% reward
        uint256 expected = MINT_PRICE * 500 / 10000;
        assertEq(nft.getReferrerReward(), expected);
    }

    function test_RemainingSupply() public {
        assertEq(nft.remainingSupply(), 10000);

        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        nft.mint(address(0));
        vm.stopPrank();

        assertEq(nft.remainingSupply(), 9999);
    }

    function test_TokenURI() public {
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        nft.mint(address(0));
        vm.stopPrank();

        assertEq(nft.tokenURI(1), "https://api.markushaas.com/api/token-metadata?t=1");
    }

    function test_SaleNotActive() public {
        vm.prank(owner);
        nft.setSaleActive(false);

        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        vm.expectRevert(DGEN1NFT.NotActive.selector);
        nft.mint(address(0));
        vm.stopPrank();
    }

    function test_SetMintPrice() public {
        uint256 newPrice = 600 * 10**6; // 600 USDC

        vm.prank(owner);
        nft.setMintPrice(newPrice);

        assertEq(nft.mintPrice(), newPrice);
        assertEq(nft.getMintPrice(), newPrice);
    }

    function test_SetMintPriceOnlyOwner() public {
        vm.prank(minter1);
        vm.expectRevert();
        nft.setMintPrice(600 * 10**6);
    }

    function test_SetMaxSupply() public {
        uint256 newMaxSupply = 20000;

        vm.prank(owner);
        nft.setMaxSupply(newMaxSupply);

        assertEq(nft.maxSupply(), newMaxSupply);
        assertEq(nft.remainingSupply(), newMaxSupply);
    }

    function test_SetMaxSupplyOnlyOwner() public {
        vm.prank(minter1);
        vm.expectRevert();
        nft.setMaxSupply(20000);
    }

    function test_SetMaxSupplyCannotBeBelowMinted() public {
        // Mint some NFTs first
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE * 5);
        nft.mint(address(0));
        nft.mint(address(0));
        nft.mint(address(0));
        nft.mint(address(0));
        nft.mint(address(0));
        vm.stopPrank();

        assertEq(nft.totalMinted(), 5);

        // Try to set max supply below current minted count
        vm.prank(owner);
        vm.expectRevert(DGEN1NFT.MaxSupply.selector);
        nft.setMaxSupply(3);

        // Setting to current minted count should work
        vm.prank(owner);
        nft.setMaxSupply(5);
        assertEq(nft.maxSupply(), 5);
        assertEq(nft.remainingSupply(), 0);
    }

    function test_WithdrawFunds() public {
        // Funds now go directly to TREASURY, so we test emergency withdraw
        // by manually sending funds to the contract first
        uint256 testAmount = 1000 * 10**6; // 1000 USDC
        usdc.mint(address(nft), testAmount);

        uint256 contractBalance = usdc.balanceOf(address(nft));
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);

        assertEq(contractBalance, testAmount);

        vm.prank(owner);
        nft.withdrawFunds(owner);

        assertEq(usdc.balanceOf(address(nft)), 0);
        assertEq(usdc.balanceOf(owner), ownerBalanceBefore + contractBalance);
    }

    function test_FundsGoToTreasury() public {
        address treasury = nft.TREASURY();
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);

        // Mint an NFT
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        nft.mint(address(0));
        vm.stopPrank();

        // Contract should have no funds
        assertEq(usdc.balanceOf(address(nft)), 0);
        // Treasury should have received the full mint price
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + MINT_PRICE);
    }

    function test_FundsGoToTreasuryWithReferral() public {
        address treasury = nft.TREASURY();

        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 referrerBalanceBefore = usdc.balanceOf(referrer);

        // Mint with referral
        uint256 discountedPrice = nft.getDiscountedPrice();
        uint256 referrerReward = nft.getReferrerReward();

        vm.startPrank(minter1);
        usdc.approve(address(nft), discountedPrice);
        nft.mint(referrer);
        vm.stopPrank();

        // Contract should have no funds
        assertEq(usdc.balanceOf(address(nft)), 0);
        // Treasury gets discounted price minus referrer reward
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + discountedPrice - referrerReward);
        // Referrer gets their reward
        assertEq(usdc.balanceOf(referrer), referrerBalanceBefore + referrerReward);
    }

    function test_OwnerMint() public {
        vm.prank(owner);
        nft.ownerMint(owner);

        assertEq(nft.balanceOf(owner), 1);
        assertEq(nft.totalMinted(), 1);
        // Owner mint doesn't add to totalUsdcRaised
        assertEq(nft.totalUsdcRaised(), 0);
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(minter1);
        vm.expectRevert();
        nft.withdrawFunds(minter1);
    }

    function test_CanMint() public view {
        // canMint now just checks supply and sale status
        assertEq(nft.canMint(minter1), true);
        assertEq(nft.canMint(minter2), true);
    }

    function test_CanMintAfterMinting() public {
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        nft.mint(address(0));
        vm.stopPrank();

        // Can still mint after minting (multiple mints allowed)
        assertEq(nft.canMint(minter1), true);
    }

    function test_GetMintCount() public {
        assertEq(nft.getMintCount(minter1), 0);

        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE * 2);
        nft.mint(address(0));
        assertEq(nft.getMintCount(minter1), 1);

        nft.mint(address(0));
        assertEq(nft.getMintCount(minter1), 2);
        vm.stopPrank();
    }

    function test_ReferralStats() public {
        // Check initial stats
        (uint256 earned, uint256 count, bool eligible) = nft.getReferralStats(referrer);
        assertEq(earned, 0);
        assertEq(count, 0);
        assertEq(eligible, true);

        // Minter1 uses referral
        vm.startPrank(minter1);
        usdc.approve(address(nft), nft.getDiscountedPrice());
        nft.mint(referrer);
        vm.stopPrank();

        // Check updated stats
        (earned, count, eligible) = nft.getReferralStats(referrer);
        assertEq(earned, nft.getReferrerReward());
        assertEq(count, 1);
        assertEq(eligible, true);
    }

    // ============ Redemption Tests ============

    function test_Redeem() public {
        // First mint an NFT
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));
        vm.stopPrank();

        assertEq(nft.balanceOf(minter1), 1);

        // Generate commitment hash (simulating frontend)
        string memory uuid = "550e8400-e29b-41d4-a716-446655440000";
        bytes32 commitmentHash = keccak256(abi.encodePacked(uuid));

        // Redeem the NFT
        vm.prank(minter1);
        nft.redeem(tokenId, commitmentHash);

        // Verify NFT is burned
        assertEq(nft.balanceOf(minter1), 0);
        vm.expectRevert();
        nft.ownerOf(tokenId);

        // Verify redemption data is stored
        (bool isValid, address redeemer, uint256 redeemedTokenId, uint256 redeemedAt) = nft.verifyRedemption(commitmentHash);
        assertEq(isValid, true);
        assertEq(redeemer, minter1);
        assertEq(redeemedTokenId, tokenId);
        assertGt(redeemedAt, 0);

        // Verify token redemption mapping
        (bool isTokenRedeemed, bytes32 storedHash) = nft.isTokenRedeemed(tokenId);
        assertEq(isTokenRedeemed, true);
        assertEq(storedHash, commitmentHash);

        // Verify total redemptions
        assertEq(nft.totalRedemptions(), 1);
        assertEq(nft.getRedemptionCount(minter1), 1);
    }

    function test_RedeemEmitsEvent() public {
        // First mint an NFT
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));
        vm.stopPrank();

        bytes32 commitmentHash = keccak256(abi.encodePacked("test-uuid"));

        vm.expectEmit(true, true, true, true);
        emit DGEN1NFT.NFTRedeemed(minter1, tokenId, commitmentHash, block.timestamp);

        vm.prank(minter1);
        nft.redeem(tokenId, commitmentHash);
    }

    function test_CannotRedeemOthersNFT() public {
        // Minter1 mints
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));
        vm.stopPrank();

        bytes32 commitmentHash = keccak256(abi.encodePacked("test-uuid"));

        // Minter2 tries to redeem minter1's NFT
        vm.prank(minter2);
        vm.expectRevert(DGEN1NFT.NotOwner.selector);
        nft.redeem(tokenId, commitmentHash);
    }

    function test_CannotRedeemWithZeroHash() public {
        // First mint an NFT
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));
        vm.stopPrank();

        vm.prank(minter1);
        vm.expectRevert(DGEN1NFT.InvalidHash.selector);
        nft.redeem(tokenId, bytes32(0));
    }

    function test_CannotReuseSameCommitmentHash() public {
        // Minter1 mints two NFTs
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE * 2);
        uint256 tokenId1 = nft.mint(address(0));
        uint256 tokenId2 = nft.mint(address(0));
        vm.stopPrank();

        bytes32 commitmentHash = keccak256(abi.encodePacked("shared-uuid"));

        // Minter1 redeems first NFT with the hash
        vm.prank(minter1);
        nft.redeem(tokenId1, commitmentHash);

        // Minter1 tries to use the same hash for second NFT
        vm.prank(minter1);
        vm.expectRevert(DGEN1NFT.HashUsed.selector);
        nft.redeem(tokenId2, commitmentHash);
    }

    function test_CanRedeemMultipleNFTs() public {
        // Mint two NFTs via owner mint
        vm.startPrank(owner);
        nft.ownerMint(minter1);
        nft.ownerMint(minter1);
        vm.stopPrank();

        assertEq(nft.balanceOf(minter1), 2);

        bytes32 commitmentHash1 = keccak256(abi.encodePacked("uuid-1"));
        bytes32 commitmentHash2 = keccak256(abi.encodePacked("uuid-2"));

        // Redeem first NFT
        vm.prank(minter1);
        nft.redeem(1, commitmentHash1);

        assertEq(nft.balanceOf(minter1), 1);
        assertEq(nft.getRedemptionCount(minter1), 1);

        // Redeem second NFT with different commitment hash
        vm.prank(minter1);
        nft.redeem(2, commitmentHash2);

        assertEq(nft.balanceOf(minter1), 0);
        assertEq(nft.getRedemptionCount(minter1), 2);
        assertEq(nft.totalRedemptions(), 2);
    }

    function test_CannotRedeemSameTokenTwice() public {
        // This shouldn't be possible since the token is burned, but test the mapping anyway
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));

        bytes32 commitmentHash = keccak256(abi.encodePacked("test-uuid"));
        nft.redeem(tokenId, commitmentHash);
        vm.stopPrank();

        // Token is burned, so trying to redeem it again will fail with "not token owner"
        // because the token no longer exists
        vm.prank(minter1);
        vm.expectRevert();
        nft.redeem(tokenId, keccak256(abi.encodePacked("another-uuid")));
    }

    function test_VerifyRedemptionWithUnhashedUUID() public {
        // This test simulates the backend verification flow

        // Frontend generates UUID
        string memory uuid = "550e8400-e29b-41d4-a716-446655440000";

        // Frontend computes hash
        bytes32 commitmentHash = keccak256(abi.encodePacked(uuid));

        // User mints and redeems
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));
        nft.redeem(tokenId, commitmentHash);
        vm.stopPrank();

        // Backend receives { uuid, shippingInfo } from user
        // Backend recomputes hash and verifies
        bytes32 backendComputedHash = keccak256(abi.encodePacked(uuid));

        (bool isValid, address redeemer, , ) = nft.verifyRedemption(backendComputedHash);

        assertEq(isValid, true);
        assertEq(redeemer, minter1);
    }

    function test_GetRedemptionByToken() public {
        // Mint and redeem
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));

        bytes32 commitmentHash = keccak256(abi.encodePacked("test-uuid"));
        nft.redeem(tokenId, commitmentHash);
        vm.stopPrank();

        // Query by token
        (bool redeemed, bytes32 storedHash, address redeemer, uint256 redeemedAt) =
            nft.getRedemptionByToken(tokenId);

        assertEq(redeemed, true);
        assertEq(storedHash, commitmentHash);
        assertEq(redeemer, minter1);
        assertGt(redeemedAt, 0);

        // Query non-redeemed token (need to mint another one first)
        vm.startPrank(minter2);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId2 = nft.mint(address(0));
        vm.stopPrank();

        (redeemed, storedHash, redeemer, redeemedAt) = nft.getRedemptionByToken(tokenId2);

        assertEq(redeemed, false);
        assertEq(storedHash, bytes32(0));
        assertEq(redeemer, address(0));
        assertEq(redeemedAt, 0);
    }

    function test_IsTokenRedeemedInitiallyFalse() public {
        vm.startPrank(minter1);
        usdc.approve(address(nft), MINT_PRICE);
        uint256 tokenId = nft.mint(address(0));
        vm.stopPrank();

        (bool isRedeemed, bytes32 commitment) = nft.isTokenRedeemed(tokenId);
        assertEq(isRedeemed, false);
        assertEq(commitment, bytes32(0));
    }

    function test_GetRedemptionCount() public {
        assertEq(nft.getRedemptionCount(minter1), 0);

        // Mint and redeem multiple
        vm.startPrank(owner);
        nft.ownerMint(minter1);
        nft.ownerMint(minter1);
        nft.ownerMint(minter1);
        vm.stopPrank();

        vm.startPrank(minter1);
        nft.redeem(1, keccak256(abi.encodePacked("uuid-1")));
        assertEq(nft.getRedemptionCount(minter1), 1);

        nft.redeem(2, keccak256(abi.encodePacked("uuid-2")));
        assertEq(nft.getRedemptionCount(minter1), 2);

        nft.redeem(3, keccak256(abi.encodePacked("uuid-3")));
        assertEq(nft.getRedemptionCount(minter1), 3);
        vm.stopPrank();
    }
}
