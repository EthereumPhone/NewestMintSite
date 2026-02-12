# dGEN1 Smart Contracts

This folder contains the Solidity smart contracts for the dGEN1 token ecosystem.

## Contracts

### DGEN1Token.sol
ERC20 token contract with the following features:
- **Name**: dGEN1
- **Symbol**: DGEN1
- **Decimals**: 18
- **Initial Supply**: 3 billion tokens (minted to deployer)
- **Owner Minting**: Contract owner can mint additional tokens

### DGEN1Sale.sol
Token sale contract for purchasing dGEN1 tokens:
- **Price**: 550 USDC per 1 million dGEN1 tokens
- **Payment**: USDC (6 decimals)
- **Daimo Pay Compatible**: Has `purchaseFor(address recipient, uint256 usdcAmount)` function
- **Owner Functions**: Withdraw tokens, withdraw USDC, pause/unpause sale

## Deployment

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Private key with funds for deployment

### Deploy to Base Mainnet
```bash
# Set environment variables
export PRIVATE_KEY=your_private_key_here
export BASE_RPC_URL=https://mainnet.base.org

# Deploy
cd contracts
forge script script/Deploy.s.sol:DeployScript --rpc-url $BASE_RPC_URL --broadcast --verify
```

### Deploy to Base Sepolia (Testnet)
```bash
# Set environment variables
export PRIVATE_KEY=your_private_key_here
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Deploy
cd contracts
forge script script/Deploy.s.sol:DeployTestnet --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

## Testing

```bash
cd contracts
forge test -vv
```

## Contract Addresses

After deployment, update these addresses in the frontend:

**Base Mainnet:**
- DGEN1Token: `0x...`
- DGEN1Sale: `0x...`

**Base Sepolia (Testnet):**
- DGEN1Token: `0x...`
- DGEN1Sale: `0x...`

## Integration with Daimo Pay

The sale contract is designed to work with Daimo Pay:

1. User selects amount of tokens to buy in the frontend
2. Frontend calculates USDC cost (550 USDC per 1M tokens)
3. Daimo Pay handles cross-chain payment:
   - User can pay with any token on any supported chain
   - Daimo bridges/swaps to USDC on Base
   - USDC is transferred to the sale contract
   - `purchaseFor(recipient, usdcAmount)` is called
4. Sale contract sends dGEN1 tokens to the buyer

### Frontend Configuration

Update `src/App.tsx` with deployed contract addresses:

```typescript
const CONTRACTS = {
  dgen1Sale: '0x...',  // Your deployed sale contract address
  dgen1Token: '0x...', // Your deployed token contract address
}
```

## Security Considerations

- The sale contract uses OpenZeppelin's ReentrancyGuard
- Only the owner can withdraw funds
- Only the owner can pause/unpause the sale
- Only the owner can mint additional tokens

## License

MIT
