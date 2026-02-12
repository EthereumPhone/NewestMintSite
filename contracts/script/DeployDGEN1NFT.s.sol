// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DGEN1NFT.sol";

contract DeployDGEN1NFT is Script {
    // USDC is hardcoded in DGEN1NFT contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    // This script is for Base mainnet deployment only
    
    function run() external {
        // Get deployment parameters from environment
        string memory baseURI = vm.envOr("BASE_URI", string("https://api.markushaas.com/api/token-metadata?t="));
        uint256 mintPrice = vm.envOr("MINT_PRICE", uint256(550 * 10**6)); // 550 USDC default
        uint256 maxSupply = vm.envOr("MAX_SUPPLY", uint256(10000)); // 10000 NFTs default

        vm.startBroadcast();

        // Deploy DGEN1NFT (owner is automatically set to msg.sender)
        DGEN1NFT nft = new DGEN1NFT(
            baseURI,
            mintPrice,
            maxSupply
        );
        
        vm.stopBroadcast();
        
        console.log("=================================");
        console.log("DGEN1NFT deployed successfully!");
        console.log("=================================");
        console.log("NFT Contract:", address(nft));
        console.log("USDC Token (hardcoded):", address(nft.USDC()));
        console.log("Owner:", nft.owner());
        console.log("Base URI:", baseURI);
        console.log("Mint Price:", mintPrice / 10**6, "USDC");
        console.log("Max Supply:", maxSupply);
        console.log("=================================");
        console.log("");
        console.log("To change mint price later:");
        console.log("cast send <NFT_ADDRESS> 'setMintPrice(uint256)' <PRICE_IN_WEI> --account mhaas");
        console.log("Example for 100 USDC: cast send <NFT_ADDRESS> 'setMintPrice(uint256)' 100000000 --account mhaas");
        console.log("");
        console.log("To change max supply later:");
        console.log("cast send <NFT_ADDRESS> 'setMaxSupply(uint256)' <NEW_MAX_SUPPLY> --account mhaas");
        console.log("Example for 20000: cast send <NFT_ADDRESS> 'setMaxSupply(uint256)' 20000 --account mhaas");
    }
}

