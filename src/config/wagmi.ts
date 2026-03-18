import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  coinbaseWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { ENV } from './env'

// Shared app metadata for wallets
const appName = 'Reserve dGEN1 NFT'
const appDescription = 'Reserve a dGEN1 NFT with crypto'
const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://dgen1.xyz'

// Determine target chain based on environment
export const targetChain = ENV.isTestnet ? baseSepolia : base

// Create custom transport with configured RPC URL for target chain
const customTransport = http(ENV.rpcUrl)

// Configure wallets for RainbowKit
const rainbowKitConnectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        ...(ENV.walletConnectProjectId ? [walletConnectWallet] : []),
      ],
    },
    {
      groupName: 'Other',
      wallets: [injectedWallet],
    },
  ],
  {
    appName,
    appDescription,
    appUrl,
    projectId: ENV.walletConnectProjectId || 'YOUR_PROJECT_ID',
  }
)

// Create wagmi config with RainbowKit connectors
// Transports must cover all possible chain IDs in the union type
export const config = createConfig({
  chains: [targetChain],
  connectors: rainbowKitConnectors,
  transports: {
    [base.id]: customTransport,
    [baseSepolia.id]: customTransport,
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
