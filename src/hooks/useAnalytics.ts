// Matomo Analytics - Funnel & Ecommerce tracking for dGEN1 mint site

declare global {
  interface Window {
    _paq?: Array<Array<unknown>>;
  }
}

function push(...args: unknown[]) {
  if (typeof window !== 'undefined' && window._paq) {
    window._paq.push(args)
  }
}

// ── Events ──────────────────────────────────────────────

/** User connected their wallet */
export function trackWalletConnected(address: string) {
  push('trackEvent', 'Wallet', 'Connected', address.slice(0, 10))
  // Set userId so Matomo can link sessions across visits
  push('setUserId', address.toLowerCase())
}

/** User disconnected wallet */
export function trackWalletDisconnected() {
  push('trackEvent', 'Wallet', 'Disconnected')
  push('resetUserId')
}

/** User changed mint quantity */
export function trackQuantityChange(quantity: number) {
  push('trackEvent', 'Mint', 'Quantity Changed', String(quantity), quantity)
}

/** User clicked RESERVE NOW — Daimo session creation started */
export function trackReserveClicked(quantity: number, priceUsdc: number) {
  push('trackEvent', 'Mint', 'Reserve Clicked', `qty=${quantity}`, priceUsdc)
}

/** Daimo modal opened (session created successfully) */
export function trackCheckoutOpened(quantity: number, priceUsdc: number) {
  // Ecommerce: add item to cart + update cart
  push('addEcommerceItem',
    'dgen1-reservation',   // SKU
    'dGEN1 Device',        // name
    'NFT Reservation',     // category
    priceUsdc / quantity,  // unit price
    quantity,              // quantity
  )
  push('trackEcommerceCartUpdate', priceUsdc)
  push('trackEvent', 'Checkout', 'Modal Opened', `qty=${quantity}`, priceUsdc)
}

/** Payment completed — track as ecommerce order */
export function trackConversion(revenue: number, quantity?: number, orderId?: string) {
  const id = orderId || `dgen1-${Date.now()}`
  const qty = quantity || 1
  // Ensure the item is in the cart before tracking the order
  push('addEcommerceItem',
    'dgen1-reservation',
    'dGEN1 Device',
    'NFT Reservation',
    revenue / qty,
    qty,
  )
  push('trackEcommerceOrder',
    id,        // orderId
    revenue,   // grandTotal
    revenue,   // subTotal
    0,         // tax
    0,         // shipping
    0,         // discount
  )
  push('trackGoal', 1, revenue)
  push('trackEvent', 'Mint', 'Purchase Completed', `qty=${qty}`, revenue)
}

/** User closed the Daimo modal without completing payment */
export function trackCheckoutAbandoned() {
  push('trackEvent', 'Checkout', 'Abandoned')
}

/** Credit card checkout initiated via Crossmint */
export function trackCreditCardClicked(priceUsdc: number) {
  push('trackEvent', 'Checkout', 'Credit Card Clicked', undefined, priceUsdc)
}

// ── Referral ────────────────────────────────────────────

/** User arrived via referral link */
export function trackReferralLanding(referrerAddress: string) {
  push('trackEvent', 'Referral', 'Landing', referrerAddress.slice(0, 10))
}

/** User copied their referral link */
export function trackReferralCopied(location: 'panel' | 'popup') {
  push('trackEvent', 'Referral', 'Link Copied', location)
}

/** User clicked share on X/Telegram */
export function trackReferralShared(platform: 'twitter' | 'telegram', location: 'panel' | 'popup') {
  push('trackEvent', 'Referral', 'Shared', `${platform}-${location}`)
}

// ── Redemption ──────────────────────────────────────────

/** User started the redemption flow */
export function trackRedemptionStarted(tokenCount: number) {
  push('trackEvent', 'Redemption', 'Started', `tokens=${tokenCount}`, tokenCount)
}

/** Redemption tx confirmed on chain */
export function trackRedemptionConfirmed(tokenCount: number) {
  push('trackEvent', 'Redemption', 'Confirmed', `tokens=${tokenCount}`, tokenCount)
}

/** Shipping info submitted */
export function trackRedemptionCompleted(tokenCount: number) {
  push('trackEvent', 'Redemption', 'Completed', `tokens=${tokenCount}`, tokenCount)
}
