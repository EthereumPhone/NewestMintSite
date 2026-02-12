// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DGEN1Token.sol";
import "../src/DGEN1Sale.sol";

contract DeployScript is Script {
    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // USDC address on Base mainnet
        address usdcBase = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        
        console.log("Deploying contracts with deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy DGEN1 Token
        DGEN1Token token = new DGEN1Token(deployer);
        console.log("DGEN1Token deployed at:", address(token));
        
        // 2. Deploy Sale Contract
        DGEN1Sale sale = new DGEN1Sale(
            address(token),
            usdcBase,
            deployer
        );
        console.log("DGEN1Sale deployed at:", address(sale));
        
        // 3. Transfer tokens to sale contract for selling
        // Transfer 1 billion tokens (1/3 of supply) to sale contract
        uint256 saleAllocation = 1_000_000_000 * 10**18;
        token.transfer(address(sale), saleAllocation);
        console.log("Transferred", saleAllocation / 10**18, "tokens to sale contract");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("DGEN1Token:", address(token));
        console.log("DGEN1Sale:", address(sale));
        console.log("Tokens available for sale:", sale.availableTokens() / 10**18);
    }
}

contract DeployTestnet is Script {
    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // USDC address on Base Sepolia testnet
        // Note: You may need to use a mock USDC or actual testnet USDC
        address usdcBaseSepolia = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // Base Sepolia USDC
        
        console.log("Deploying contracts on testnet with deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy DGEN1 Token
        DGEN1Token token = new DGEN1Token(deployer);
        console.log("DGEN1Token deployed at:", address(token));
        
        // 2. Deploy Sale Contract
        DGEN1Sale sale = new DGEN1Sale(
            address(token),
            usdcBaseSepolia,
            deployer
        );
        console.log("DGEN1Sale deployed at:", address(sale));
        
        // 3. Transfer tokens to sale contract for selling
        uint256 saleAllocation = 1_000_000_000 * 10**18;
        token.transfer(address(sale), saleAllocation);
        console.log("Transferred", saleAllocation / 10**18, "tokens to sale contract");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== Testnet Deployment Summary ===");
        console.log("DGEN1Token:", address(token));
        console.log("DGEN1Sale:", address(sale));
        console.log("Tokens available for sale:", sale.availableTokens() / 10**18);
    }
}

