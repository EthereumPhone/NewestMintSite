// Environment configuration
// All values are read from .env file (prefixed with VITE_)

export const ENV = {
  // Contract addresses
  nftContractAddress: import.meta.env.VITE_NFT_CONTRACT_ADDRESS as `0x${string}`,
  paymentTokenAddress: (import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as `0x${string}`, // USDC on Base mainnet
  
  // NFT configuration
  nftName: import.meta.env.VITE_NFT_NAME || 'dGEN1 DEVICE',
  nftPriceEth: Number(import.meta.env.VITE_NFT_PRICE_ETH) || 0.18,
  nftMaxSupply: Number(import.meta.env.VITE_NFT_MAX_SUPPLY) || 10000,
  nftMaxPerTx: Number(import.meta.env.VITE_NFT_MAX_PER_TX) || 10,
  
  // Daimo Pay - backend endpoint that creates sessions via Daimo API
  daimoSessionApiUrl: import.meta.env.VITE_DAIMO_SESSION_API_URL || '',
  
  // Chain & RPC
  chainId: Number(import.meta.env.VITE_CHAIN_ID) || 8453, // Base mainnet
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://mainnet.base.org',
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
  
  // Testnet mode (bypasses Daimo Pay, uses direct contract calls)
  isTestnet: import.meta.env.VITE_TESTNET_MODE === 'true',
  
  // Redemption API endpoint
  redemptionApiUrl: import.meta.env.VITE_REDEMPTION_API_URL || 'https://api.markushaas.com/api/email-redemptions',
  
  // Links
  websiteUrl: import.meta.env.VITE_WEBSITE_URL || 'https://freedomfactory.io',
  twitterUrl: import.meta.env.VITE_TWITTER_URL || 'https://twitter.com/EthereumPhone',
  discordUrl: import.meta.env.VITE_DISCORD_URL || '#',
  
  // Quote tweet link (added to end of share tweets)
  quoteTweetUrl: import.meta.env.VITE_QUOTE_TWEET_URL || '',

  // Crossmint (credit card payments)
  crossmintApiKey: import.meta.env.VITE_CROSSMINT_CLIENT_API_KEY || '',
  crossmintCollectionId: import.meta.env.VITE_CROSSMINT_COLLECTION_ID || '',
  crossmintBuyAndBurnApiUrl: import.meta.env.VITE_CROSSMINT_BUY_AND_BURN_API_URL || '',
} as const

// Validate required environment variables
export function validateEnv() {
  const required = ['VITE_NFT_CONTRACT_ADDRESS', 'VITE_DAIMO_SESSION_API_URL']
  const missing = required.filter(key => !import.meta.env[key])
  
  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`)
  }
}

