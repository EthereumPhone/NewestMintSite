// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DGEN1Token
 * @dev ERC20 token for dGEN1 with initial supply and owner-controlled minting
 * 
 * Initial supply: 3 billion tokens minted to deployer
 * The contract owner can mint additional tokens as needed
 */
contract DGEN1Token is ERC20, Ownable {
    // 3 billion tokens with 18 decimals
    uint256 public constant INITIAL_SUPPLY = 3_000_000_000 * 10**18;
    
    /**
     * @dev Constructor that mints initial supply to the deployer
     * @param initialOwner Address that will own the contract and receive initial supply
     */
    constructor(address initialOwner) 
        ERC20("dGEN1", "DGEN1") 
        Ownable(initialOwner) 
    {
        _mint(initialOwner, INITIAL_SUPPLY);
    }
    
    /**
     * @dev Allows the owner to mint additional tokens
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint (in wei, 18 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Allows the owner to mint additional tokens to multiple addresses
     * @param recipients Array of addresses to receive tokens
     * @param amounts Array of amounts to mint to each address
     */
    function mintBatch(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "DGEN1: arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }
}

