import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  CrossmintHostedCheckout,
  CrossmintCheckoutProvider,
  useCrossmintCheckout,
} from '@crossmint/client-sdk-react-ui'
import { ENV } from '../config/env'

// Reuse the same country list from App.tsx
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cyprus", "Czech Republic", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iraq", "Ireland",
  "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
  "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
]

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type FlowStep = 'idle' | 'shipping' | 'submitting' | 'success' | 'error'

interface CreditCardCheckoutProps {
  mintQuantity: number
  currentUsdcPrice: number
  eligibleReferralAddress: string | undefined
  walletAddress: string | undefined // from connected wallet, if any
  onPurchaseComplete?: () => void
}

// Inner component that uses the useCrossmintCheckout hook
function CheckoutInner({
  mintQuantity,
  currentUsdcPrice,
  eligibleReferralAddress,
  walletAddress,
  onPurchaseComplete,
}: CreditCardCheckoutProps) {
  const { order } = useCrossmintCheckout()

  const [flowStep, setFlowStep] = useState<FlowStep>('idle')
  const [orderData, setOrderData] = useState<{
    orderId: string
    tokenIds: string[]
    recipientEmail?: string
    recipientWallet: string
  } | null>(null)

  // Shipping form state
  const [shippingInfo, setShippingInfo] = useState({
    fullName: '',
    address: '',
    addressLine2: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
    email: '',
  })
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Country picker state
  const [countrySearch, setCountrySearch] = useState('')
  const [showCountryDropdown, setShowCountryDropdown] = useState(false)
  const countryInputRef = useRef<HTMLInputElement>(null)
  const countryDropdownRef = useRef<HTMLDivElement>(null)

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES
    const searchLower = countrySearch.toLowerCase()
    return COUNTRIES.filter(country => country.toLowerCase().includes(searchLower))
  }, [countrySearch])

  // Close country dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node) &&
        countryInputRef.current &&
        !countryInputRef.current.contains(event.target as Node)
      ) {
        setShowCountryDropdown(false)
        if (shippingInfo.country) {
          setCountrySearch(shippingInfo.country)
        } else {
          setCountrySearch('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [shippingInfo.country])

  // Track order completion from Crossmint checkout
  const completionHandled = useRef(false)
  useEffect(() => {
    if (completionHandled.current) return
    if (!order || order.phase !== 'completed') return

    const lineItem = order.lineItems?.[0]
    if (!lineItem) return

    const delivery = lineItem.delivery
    if (!delivery || delivery.status !== 'completed') return

    completionHandled.current = true

    const tokenIds = delivery.tokens
      ?.map((t) => 'tokenId' in t ? t.tokenId : undefined)
      .filter((id): id is string => id != null) || []
    const recipient = delivery.recipient
    const recipientEmail = recipient && 'email' in recipient ? recipient.email : undefined
    const recipientWallet = recipient?.walletAddress || ''

    console.log('[CROSSMINT] Purchase complete:', { orderId: order.orderId, tokenIds, recipientEmail, recipientWallet })

    setOrderData({
      orderId: order.orderId,
      tokenIds,
      recipientEmail,
      recipientWallet,
    })

    // Pre-fill email from Crossmint checkout if available
    if (recipientEmail) {
      setShippingInfo(prev => ({ ...prev, email: recipientEmail }))
    }

    setFlowStep('shipping')
    onPurchaseComplete?.()
  }, [order, onPurchaseComplete])

  // Validation helpers
  const isEnglishOnly = (text: string): boolean => /^[\x20-\x7E]*$/.test(text)
  const isValidPhone = (phone: string): boolean => /^\d+$/.test(phone)
  const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const validateShippingInfo = (): string | null => {
    if (!shippingInfo.fullName.trim()) return 'Full name is required'
    if (!isEnglishOnly(shippingInfo.fullName)) return 'Full name must contain only English characters'
    if (!shippingInfo.address.trim()) return 'Address is required'
    if (!isEnglishOnly(shippingInfo.address)) return 'Address must contain only English characters'
    if (shippingInfo.addressLine2 && !isEnglishOnly(shippingInfo.addressLine2)) return 'Address line 2 must contain only English characters'
    if (!shippingInfo.city.trim()) return 'City is required'
    if (!isEnglishOnly(shippingInfo.city)) return 'City must contain only English characters'
    if (!shippingInfo.state.trim()) return 'State is required'
    if (!isEnglishOnly(shippingInfo.state)) return 'State must contain only English characters'
    if (!shippingInfo.zip.trim()) return 'Zip is required'
    if (!isEnglishOnly(shippingInfo.zip)) return 'Zip must contain only English characters'
    if (!shippingInfo.country.trim()) return 'Country is required'
    if (!COUNTRIES.includes(shippingInfo.country)) return 'Please select a valid country from the list'
    if (!shippingInfo.phone.trim()) return 'Phone is required'
    if (!isValidPhone(shippingInfo.phone)) return 'Phone must contain only numbers'
    if (!shippingInfo.email.trim()) return 'Email is required'
    if (!validateEmail(shippingInfo.email)) return 'Invalid email format'
    return null
  }

  const updateShippingField = (field: keyof typeof shippingInfo, value: string) => {
    setShippingInfo(prev => ({ ...prev, [field]: value }))
    if (shippingError) setShippingError(null)
  }

  // Submit shipping info to backend, which handles the server-side burn
  const handleShippingSubmit = useCallback(async () => {
    const validationError = validateShippingInfo()
    if (validationError) {
      setShippingError(validationError)
      return
    }
    if (!orderData) {
      setShippingError('Missing order data')
      return
    }

    setShippingError(null)
    setIsSubmitting(true)
    setFlowStep('submitting')

    try {
      const response = await fetch(ENV.crossmintBuyAndBurnApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Crossmint order data -- backend uses this to burn via Wallets API
          orderId: orderData.orderId,
          tokenIds: orderData.tokenIds,
          recipientWallet: orderData.recipientWallet,
          recipientEmail: orderData.recipientEmail,
          // Shipping info
          ...shippingInfo,
          deviceCount: orderData.tokenIds.length,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to submit order')
      }

      setFlowStep('success')
    } catch (e) {
      console.error('Buy-and-burn submission failed:', e)
      setShippingError(e instanceof Error ? e.message : 'Failed to submit order')
      setFlowStep('shipping')
    } finally {
      setIsSubmitting(false)
    }
  }, [orderData, shippingInfo])

  // Reset flow
  const handleReset = useCallback(() => {
    completionHandled.current = false
    setFlowStep('idle')
    setOrderData(null)
    setShippingInfo({
      fullName: '', address: '', addressLine2: '', city: '',
      state: '', zip: '', country: '', phone: '', email: '',
    })
    setCountrySearch('')
    setShippingError(null)
  }, [])

  // === RENDER ===

  // Idle: show checkout button
  if (flowStep === 'idle') {
    return (
      <CrossmintHostedCheckout
        lineItems={{
          collectionLocator: `crossmint:${ENV.crossmintCollectionId}`,
          callData: {
            totalPrice: currentUsdcPrice.toString(),
            quantity: mintQuantity,
            // `to` is NOT passed -- Crossmint auto-fills via BYOC toParamName config.
            // Crossmint creates a custodial wallet for the buyer if they don't have one.
            referrer: eligibleReferralAddress || ZERO_ADDRESS,
          },
        }}
        // If wallet connected: mint directly to it. Otherwise Crossmint asks for email.
        {...(walletAddress ? { recipient: { walletAddress } } : {})}
        payment={{
          fiat: { enabled: true },
          crypto: { enabled: false },
          defaultMethod: 'fiat' as const,
        }}
        appearance={{
          theme: { checkout: 'dark' as const, button: 'dark' as const },
          overlay: { enabled: true },
          display: 'popup' as const,
        }}
        className="credit-card-btn"
      >
        PAY WITH CREDIT CARD
      </CrossmintHostedCheckout>
    )
  }

  // Shipping form (after purchase completes)
  if (flowStep === 'shipping' || flowStep === 'submitting') {
    return (
      <div className="cc-shipping-section">
        <div className="redemption-success-icon">✓</div>
        <p className="redemption-email-title">Payment Successful!</p>
        <p className="redemption-email-description">
          Enter your shipping information to complete your order
          {orderData && orderData.tokenIds.length > 1 ? ` for ${orderData.tokenIds.length} devices` : ''}:
        </p>
        <p className="shipping-notice">Please use English characters only</p>
        <div className="shipping-form">
          <input
            type="text"
            value={shippingInfo.fullName}
            onChange={(e) => updateShippingField('fullName', e.target.value)}
            placeholder="Full Name *"
            className="shipping-input shipping-input-full"
            disabled={isSubmitting}
          />
          <input
            type="text"
            value={shippingInfo.address}
            onChange={(e) => updateShippingField('address', e.target.value)}
            placeholder="Address *"
            className="shipping-input shipping-input-full"
            disabled={isSubmitting}
          />
          <input
            type="text"
            value={shippingInfo.addressLine2}
            onChange={(e) => updateShippingField('addressLine2', e.target.value)}
            placeholder="Address line 2"
            className="shipping-input shipping-input-full"
            disabled={isSubmitting}
          />
          <div className="shipping-row">
            <input
              type="text"
              value={shippingInfo.city}
              onChange={(e) => updateShippingField('city', e.target.value)}
              placeholder="City *"
              className="shipping-input"
              disabled={isSubmitting}
            />
            <input
              type="text"
              value={shippingInfo.state}
              onChange={(e) => updateShippingField('state', e.target.value)}
              placeholder="State *"
              className="shipping-input"
              disabled={isSubmitting}
            />
          </div>
          <div className="shipping-row">
            <input
              type="text"
              value={shippingInfo.zip}
              onChange={(e) => updateShippingField('zip', e.target.value)}
              placeholder="Zip *"
              className="shipping-input"
              disabled={isSubmitting}
            />
            <div className="country-picker">
              <input
                ref={countryInputRef}
                type="text"
                value={showCountryDropdown ? countrySearch : shippingInfo.country}
                onChange={(e) => {
                  setCountrySearch(e.target.value)
                  if (!showCountryDropdown) setShowCountryDropdown(true)
                  if (shippingInfo.country) updateShippingField('country', '')
                }}
                onFocus={() => {
                  setShowCountryDropdown(true)
                  setCountrySearch(shippingInfo.country)
                }}
                placeholder="Country *"
                className="shipping-input"
                disabled={isSubmitting}
                autoComplete="off"
              />
              {showCountryDropdown && (
                <div ref={countryDropdownRef} className="country-dropdown">
                  {filteredCountries.length > 0 ? (
                    filteredCountries.map((country) => (
                      <div
                        key={country}
                        className={`country-option ${shippingInfo.country === country ? 'selected' : ''}`}
                        onClick={() => {
                          updateShippingField('country', country)
                          setCountrySearch(country)
                          setShowCountryDropdown(false)
                        }}
                      >
                        {country}
                      </div>
                    ))
                  ) : (
                    <div className="country-option no-results">No countries found</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <input
            type="tel"
            value={shippingInfo.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              updateShippingField('phone', digits)
            }}
            placeholder="Phone (numbers only) *"
            className="shipping-input shipping-input-full"
            disabled={isSubmitting}
          />
          <input
            type="email"
            value={shippingInfo.email}
            onChange={(e) => updateShippingField('email', e.target.value)}
            placeholder="Email *"
            className="shipping-input shipping-input-full"
            disabled={isSubmitting}
          />
          {shippingError && (
            <div className="email-error-banner">
              <span className="email-error-icon">!</span>
              <span className="email-error-text">{shippingError}</span>
            </div>
          )}
        </div>
        <button
          className="submit-email-btn"
          onClick={handleShippingSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'SUBMITTING...' : 'COMPLETE ORDER'}
        </button>
      </div>
    )
  }

  // Success
  if (flowStep === 'success') {
    return (
      <div className="redemption-complete">
        <div className="redemption-success-icon">!</div>
        <p className="redemption-complete-title">Order Complete!</p>
        <p className="redemption-complete-text">
          Your dGEN1 device{orderData && orderData.tokenIds.length > 1 ? 's have' : ' has'} been ordered.
          Check your email for shipping updates.
        </p>
        <button className="redeem-btn" onClick={handleReset} style={{ marginTop: '1rem' }}>
          PLACE ANOTHER ORDER
        </button>
      </div>
    )
  }

  // Error
  if (flowStep === 'error') {
    return (
      <div className="redemption-error">
        <p>Something went wrong. Please try again.</p>
        <button className="retry-btn" onClick={handleReset}>
          TRY AGAIN
        </button>
      </div>
    )
  }

  return null
}

// Outer wrapper that provides CrossmintCheckoutProvider context
export function CreditCardCheckout(props: CreditCardCheckoutProps) {
  return (
    <CrossmintCheckoutProvider>
      <CheckoutInner {...props} />
    </CrossmintCheckoutProvider>
  )
}
