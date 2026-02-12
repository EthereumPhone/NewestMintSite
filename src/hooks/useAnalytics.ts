// Matomo Analytics - Simple conversion tracking

declare global {
  interface Window {
    _paq?: Array<Array<string | number | boolean>>;
  }
}

/**
 * Track a conversion/goal in Matomo (NFT mint)
 * @param revenue - Optional revenue value in USD
 */
export function trackConversion(revenue?: number) {
  if (typeof window !== 'undefined' && window._paq) {
    // Track as Goal ID 1 (configure this in Matomo as "NFT Purchase")
    if (revenue !== undefined) {
      window._paq.push(['trackGoal', 1, revenue])
    } else {
      window._paq.push(['trackGoal', 1])
    }
  }
}
