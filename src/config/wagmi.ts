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
import { getDefaultConfig } from '@daimo/pay'
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

// Get Daimo Pay's default config for chains and transports
const daimoConfig = getDefaultConfig({
  appName,
  appDescription,
  appUrl,
  chains: [targetChain],
})

// Destructure to exclude `client` and `connectors` - we'll use our own connectors
const { client: _client, connectors: _daimoConnectors, ...daimoConfigBase } = daimoConfig

// Create wagmi config combining Daimo's chain setup with RainbowKit's connectors
export const config = createConfig({
  ...daimoConfigBase,
  connectors: rainbowKitConnectors,
  transports: {
    ...daimoConfig.transports,
    [targetChain.id]: customTransport,
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
