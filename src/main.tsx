import { Buffer } from 'buffer'

// Polyfill buffer for browser compatibility
if (typeof window !== 'undefined') {
  window.Buffer = Buffer
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { DaimoPayProvider } from '@daimo/pay'
import { CrossmintProvider } from '@crossmint/client-sdk-react-ui'
import { config, targetChain } from './config/wagmi'
import { ENV } from './config/env'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={targetChain}>
        <DaimoPayProvider
          theme="soft"
          mode="dark"
        >
          {ENV.crossmintApiKey ? (
            <CrossmintProvider apiKey={ENV.crossmintApiKey}>
              <App />
            </CrossmintProvider>
          ) : (
            <App />
          )}
        </DaimoPayProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
