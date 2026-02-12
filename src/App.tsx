import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { encodeFunctionData, parseUnits } from 'viem'
import { useAccount, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { DaimoPayButton, useDaimoPayUI } from '@daimo/pay'
import { ENV } from './config/env'
import { targetChain } from './config/wagmi'
import { trackConversion } from './hooks/useAnalytics'
import {
  useNFTContractData,
  useCanMint,
  useUserTokenId,
  useIsTokenRedeemed,
  generateRedemptionUUID,
  computeCommitmentHash,
  NFT_ABI
} from './hooks/useNFTContract'
import './App.css'

// List of all countries in English
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

function Dgen1Wordmark({ className }: { className?: string }) {
  const classes = className ? `${className} dgen1-wordmark` : 'dgen1-wordmark'
  return <span className={classes}>dGEN1</span>
}

function renderDgen1Wordmark(text: string) {
  // Normalize any casing (e.g. DGEN1, dgen1, DGen1) to the brand casing: dGEN1
  const normalized = text.replace(/dgen1/gi, 'dGEN1')
  return normalized.split(/(dGEN1)/g).map((part, idx) => {
    if (part === 'dGEN1') return <Dgen1Wordmark key={`dgen1-${idx}`} />
    return part
  })
}

// ERC20 ABI for approve
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// Parse referral address from URL
function getReferralFromURL(): string | null {
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (ref && /^0x[a-fA-F0-9]{40}$/.test(ref)) {
    return ref
  }
  return null
}

function App() {
  const { address, isConnected, status: accountStatus } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const isConnecting = accountStatus === 'connecting'
  const [referralAddress] = useState<string | null>(getReferralFromURL)
  const [copied, setCopied] = useState(false)
  const [showSharePopup, setShowSharePopup] = useState(false)
  const [daimoResetKey, setDaimoResetKey] = useState(0)
  const paymentHandledRef = useRef(false)
  const [popupCopied, setPopupCopied] = useState(false)
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  
  // Check if user is on the correct chain
  const isWrongChain = isConnected && chainId !== targetChain.id
  
  // Read contract data with live event updates
  const {
    totalMintedNum,
    remainingSupplyNum,
    maxSupplyNum,
    saleActive,
    mintPriceUsdc,
    discountedPriceUsdc,
    isLoading,
    isError,
  } = useNFTContractData()

  // Debug: Log contract data as it loads
  useEffect(() => {
    console.log('[CONTRACT DATA]', {
      totalMintedNum,
      remainingSupplyNum,
      maxSupplyNum,
      saleActive,
      mintPriceUsdc,
      discountedPriceUsdc,
      isLoading,
      isError,
      nftContractAddress: ENV.nftContractAddress,
    })
  }, [totalMintedNum, remainingSupplyNum, maxSupplyNum, saleActive, mintPriceUsdc, discountedPriceUsdc, isLoading, isError])

  // Referral address from URL, excluding self-referrals once wallet is known
  const eligibleReferralAddress = useMemo(() => {
    if (!referralAddress) return undefined
    if (!address) return referralAddress
    return referralAddress.toLowerCase() === address.toLowerCase() ? undefined : referralAddress
  }, [referralAddress, address])
  
  // Check if current user can mint
  const { hasMinted, refetch: refetchCanMint } = useCanMint(address)

  // Mint quantity selector (maxMintQuantity is computed later after remaining is defined)
  const [mintQuantity, setMintQuantity] = useState(1)
  
  // Daimo Pay UI hook - used to reset payment when quantity changes
  // Per Daimo docs: "Once DaimoPayButton is rendered, its payment parameters are frozen.
  // If your app needs to dynamically update the payment, use the resetPayment function."
  const { resetPayment } = useDaimoPayUI()

  // Debug: Log hasMinted check
  useEffect(() => {
    console.log('[CAN MINT CHECK]', { address, hasMinted })
  }, [address, hasMinted])
  
  
  // Redemption state
  const { hasNFT, tokenIds, balance: nftBalance, refetch: refetchUserToken } = useUserTokenId(address)
  const [selectedTokenIds, setSelectedTokenIds] = useState<number[]>([])
  const { refetch: refetchRedemption } = useIsTokenRedeemed(selectedTokenIds.length > 0 ? selectedTokenIds[0] : undefined)

  // Redemption flow state
  const [showRedemptionPanel, setShowRedemptionPanel] = useState(false)
  const [redemptionStep, setRedemptionStep] = useState<'idle' | 'selecting' | 'confirming' | 'redeeming' | 'shipping' | 'submitting' | 'success' | 'error'>('idle')
  const [redemptionUUIDs, setRedemptionUUIDs] = useState<string[]>([])
  const [redemptionTokenIds, setRedemptionTokenIds] = useState<number[]>([])

  // Shipping info state
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

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES
    const searchLower = countrySearch.toLowerCase()
    return COUNTRIES.filter(country => country.toLowerCase().includes(searchLower))
  }, [countrySearch])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node) &&
        countryInputRef.current &&
        !countryInputRef.current.contains(event.target as Node)
      ) {
        setShowCountryDropdown(false)
        // Reset search to selected country when closing
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

  // LocalStorage key for pending redemption
  const PENDING_REDEMPTION_KEY = 'dgen1_pending_redemption'

  // Check for pending redemption on mount (user burned NFT but didn't submit shipping info)
  useEffect(() => {
    if (!address) return

    try {
      const stored = localStorage.getItem(PENDING_REDEMPTION_KEY)
      if (stored) {
        const pending = JSON.parse(stored)
        // Check if this pending redemption is for the current address
        if (pending.walletAddress?.toLowerCase() === address.toLowerCase() && (pending.uuids?.length > 0 || pending.uuid)) {
          console.log('Restoring pending redemption for shipping submission')
          // Support both old (single) and new (batch) format
          const uuids = pending.uuids || [pending.uuid]
          const tokenIdList = pending.tokenIds || [pending.tokenId]
          setRedemptionUUIDs(uuids)
          setRedemptionTokenIds(tokenIdList)
          setRedemptionStep('shipping')
          setShowRedemptionPanel(true)
        } else if (pending.walletAddress?.toLowerCase() !== address.toLowerCase()) {
          // Different wallet, clear the pending redemption
          localStorage.removeItem(PENDING_REDEMPTION_KEY)
        }
      }
    } catch (e) {
      console.error('Error loading pending redemption:', e)
    }
  }, [address])

  // Determine if user can redeem (has unredeemed NFTs)
  const hasPendingShippingSubmission = redemptionStep === 'shipping' && redemptionUUIDs.length > 0
  const justCompletedRedemption = redemptionStep === 'success' || redemptionStep === 'submitting'
  const canRedeem = hasNFT || hasPendingShippingSubmission || justCompletedRedemption

  // Debug: Log redemption state
  useEffect(() => {
    console.log('[REDEMPTION DEBUG]', {
      address,
      hasNFT,
      nftBalance,
      tokenIds,
      canRedeem,
      hasPendingShippingSubmission,
      justCompletedRedemption,
      redemptionStep,
    })
  }, [address, hasNFT, nftBalance, tokenIds, canRedeem, hasPendingShippingSubmission, justCompletedRedemption, redemptionStep])

  // Contract data with fallbacks
  const minted = totalMintedNum ?? 0
  const maxSupply = maxSupplyNum ?? ENV.nftMaxSupply
  const remaining = remainingSupplyNum ?? (maxSupply - minted)
  const isSaleActive = saleActive ?? true

  // Max mint quantity per transaction (capped by remaining supply and config)
  const maxMintQuantity = Math.min(ENV.nftMaxPerTx, remaining || ENV.nftMaxPerTx)

  // Pricing - Display ETH (from env var) but pay in USDC (from contract)
  const displayDiscountedEth = useMemo(() => {
    return Math.round(ENV.nftPriceEth * 0.95 * 1000) / 1000 // 5% discount for display
  }, [])
  
  // Referral state
  const hasReferralAddress = !!eligibleReferralAddress
  // Referrers do NOT need to own/mint a dGEN1 NFT.
  // Any non-self `?ref=` address is considered a valid referral for discount + rewards.
  const hasValidReferral = hasReferralAddress
  const displayDiscount = hasValidReferral ? Math.round(ENV.nftPriceEth * 0.05 * 1000) / 1000 : 0
  
  // Actual USDC price for payment (from contract)
  const fullUsdcPrice = mintPriceUsdc ?? 0.1 // Default fallback (matches test price)
  const discountedUsdcPriceValue = discountedPriceUsdc ?? (fullUsdcPrice * 0.95)
  const unitUsdcPrice = hasValidReferral ? discountedUsdcPriceValue : fullUsdcPrice
  const currentUsdcPrice = unitUsdcPrice * mintQuantity

  // Prepare mint calldata for Daimo Pay
  // CRITICAL: This must be synchronous (useMemo, not useEffect) to prevent race conditions
  // where the price updates but calldata still has the old quantity, causing users to
  // pay for N NFTs but only receive fewer due to stale calldata.
  const mintCalldata = useMemo(() => {
    // IMPORTANT: `mintForBatch` rejects address(0). Don't build calldata until we know the recipient.
    if (!address) {
      return undefined
    }

    const recipient = address
    const referrer = hasValidReferral && eligibleReferralAddress
      ? eligibleReferralAddress
      : ZERO_ADDRESS

    // Use mintForBatch for all mints (works for quantity=1 as well)
    const calldata = encodeFunctionData({
      abi: NFT_ABI,
      functionName: 'mintForBatch',
      args: [recipient as `0x${string}`, referrer as `0x${string}`, BigInt(mintQuantity)],
    })

    console.log('[CALLDATA] Generated for address:', address, 'quantity:', mintQuantity, 'calldata:', calldata.slice(0, 50) + '...')
    return calldata
  }, [address, hasValidReferral, eligibleReferralAddress, mintQuantity, ZERO_ADDRESS])

  // Log price calculation for debugging
  console.log('[PRICE] mintQuantity:', mintQuantity, 'unitUsdcPrice:', unitUsdcPrice, 'currentUsdcPrice:', currentUsdcPrice, 'toUnits:', currentUsdcPrice.toFixed(6))

  const percentMinted = maxSupply > 0 ? (minted / maxSupply) * 100 : 0
  const canMint = isSaleActive && remaining > 0

  // Debug logging for mint button state
  useEffect(() => {
    console.log('[MINT DEBUG] Button state check:', {
      // Connection state
      isConnected,
      address,
      chainId,
      isWrongChain,
      
      // Contract data loading
      isLoading,
      isError,
      
      // Sale conditions
      isSaleActive,
      remaining,
      hasMinted,
      canMint,
      
      // Price data - CRITICAL for debugging
      mintQuantity,
      mintPriceUsdc,
      unitUsdcPrice,
      currentUsdcPrice,
      toUnitsValue: currentUsdcPrice.toFixed(6),
      
      // Referral state
      hasReferralAddress,
      hasValidReferral,
      eligibleReferralAddress,
      
      // Calldata
      mintCalldata: mintCalldata ? `${mintCalldata.slice(0, 50)}...` : undefined,
      
      // Environment
      isTestnet: ENV.isTestnet,
      targetChainId: targetChain.id,
    })
  }, [
    isConnected, address, chainId, isWrongChain,
    isLoading, isError,
    isSaleActive, remaining, hasMinted, canMint,
    mintQuantity, mintPriceUsdc, unitUsdcPrice, currentUsdcPrice,
    hasReferralAddress, hasValidReferral, eligibleReferralAddress,
    mintCalldata
  ])
  
  // FOMO indicators
  const isAlmostGone = remaining < maxSupply * 0.1
  const isHalfGone = remaining < maxSupply * 0.5

  // Generate referral link
  const referralLink = useMemo(() => {
    if (!address) return ''
    const baseUrl = window.location.origin + window.location.pathname
    return `${baseUrl}?ref=${address}`
  }, [address])

  // Copy referral link
  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Reset copied state on address change
  useEffect(() => {
    setCopied(false)
  }, [address])

  // Refs to store latest values - these are always current when setTimeout fires
  const latestValuesRef = useRef({
    mintQuantity,
    currentUsdcPrice,
    mintCalldata,
    address,
  })
  
  // Update refs on EVERY render so they always have the latest values
  latestValuesRef.current = {
    mintQuantity,
    currentUsdcPrice,
    mintCalldata,
    address,
  }

  // Track if we've done the initial render
  const isFirstRender = useRef(true)
  const prevQuantityRef = useRef(mintQuantity)

  // Debounced resetPayment call - ONLY runs when mintQuantity changes
  useEffect(() => {
    // Skip on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    // Only proceed if quantity actually changed
    if (prevQuantityRef.current === mintQuantity) {
      return
    }

    // Update the ref
    prevQuantityRef.current = mintQuantity

    // Debounce: wait 200ms after the last change before calling resetPayment
    const timeoutId = setTimeout(() => {
      // Read from refs to get the LATEST values (not stale closure values)
      const latest = latestValuesRef.current
      
      if (!latest.address || !latest.mintCalldata) {
        return
      }

      console.log('[QUANTITY CHANGE] Calling resetPayment with:', {
        quantity: latest.mintQuantity,
        price: latest.currentUsdcPrice.toFixed(6),
      })
      resetPayment({
        toUnits: latest.currentUsdcPrice.toFixed(6),
        toCallData: latest.mintCalldata,
      })
    }, 200)

    // Cleanup: cancel the timeout if quantity changes again before 200ms
    return () => clearTimeout(timeoutId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintQuantity]) // Only trigger on quantity change - latest values come from ref

  // Debug: Log when payment parameters change
  useEffect(() => {
    console.log('[DAIMO PAYMENT] Payment params:', {
      mintQuantity,
      price: currentUsdcPrice.toFixed(2),
      address,
    })
  }, [mintQuantity, currentUsdcPrice, address])

  // Handle payment completion from Daimo Pay
  // The event object matches webhook events, not a hide() method
  // Modal closing is handled by the closeOnSuccess prop
  const handlePaymentCompleted = useCallback((event: unknown) => {
    // Guard against duplicate calls (e.g., when button remounts)
    if (paymentHandledRef.current) {
      console.log('Payment already handled, ignoring duplicate callback')
      return
    }
    paymentHandledRef.current = true

    console.log('Mint completed via Daimo Pay!', event)

    // Show success/share popup
    setShowSharePopup(true)

    // Track conversion in Matomo
    trackConversion(currentUsdcPrice)

    // Reset Daimo Pay button after 3 seconds (forces remount with fresh state)
    setTimeout(() => {
      setDaimoResetKey(k => k + 1)
      // Also call resetPayment to clear Daimo's internal state
      resetPayment({
        toUnits: currentUsdcPrice.toFixed(6),
        toCallData: mintCalldata,
      })
      // Reset guard after button has remounted
      setTimeout(() => {
        paymentHandledRef.current = false
      }, 100)
    }, 3000)

    // Refetch user token data to enable redemption UI and referral link
    // Add delay to allow blockchain state to propagate
    const refreshData = async () => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await Promise.all([refetchUserToken(), refetchCanMint()])
      await new Promise(resolve => setTimeout(resolve, 1000))
      await Promise.all([refetchUserToken(), refetchCanMint()])
    }
    refreshData()
  }, [currentUsdcPrice, refetchUserToken, refetchCanMint, resetPayment, mintCalldata])

  // Copy referral link in popup
  const copyReferralLinkPopup = () => {
    navigator.clipboard.writeText(referralLink)
    setPopupCopied(true)
    setTimeout(() => setPopupCopied(false), 2000)
  }

  // Close share popup (Daimo Pay button resets automatically 3 seconds after payment)
  const closeSharePopup = useCallback(() => {
    setShowSharePopup(false)
  }, [])

  // === TESTNET MODE: Direct contract interaction ===
  const [mintStep, setMintStep] = useState<'idle' | 'approving' | 'minting' | 'success' | 'error'>('idle')
  
  // Approve USDC
  const { writeContract: approveUsdc, data: approveTxHash, isPending: isApproving, error: approveError, reset: resetApprove } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  })

  // Mint NFT
  const { writeContract: mintNft, data: mintTxHash, isPending: isMinting, error: mintError, reset: resetMint } = useWriteContract()
  const { isLoading: isMintConfirming, isSuccess: isMintConfirmed } = useWaitForTransactionReceipt({
    hash: mintTxHash,
  })

  // Handle testnet mint flow
  const handleTestnetMint = async () => {
    if (!address) return
    
    // Switch chain if needed
    if (isWrongChain) {
      try {
        await switchChain({ chainId: targetChain.id })
      } catch (e) {
        console.error('Chain switch failed:', e)
        return
      }
    }
    
    setMintStep('approving')
    const usdcAmount = parseUnits(currentUsdcPrice.toString(), 6) // USDC has 6 decimals
    
    try {
      approveUsdc({
        address: ENV.paymentTokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ENV.nftContractAddress, usdcAmount],
        chainId: targetChain.id,
      })
    } catch (e) {
      console.error('Approve failed:', e)
      setMintStep('error')
    }
  }

  // After approve confirms, mint
  useEffect(() => {
    if (isApproveConfirmed && mintStep === 'approving') {
      setMintStep('minting')
      const referrer = hasValidReferral && referralAddress 
        ? referralAddress as `0x${string}`
        : '0x0000000000000000000000000000000000000000' as `0x${string}`
      
      mintNft({
        address: ENV.nftContractAddress,
        abi: NFT_ABI,
        functionName: 'mint',
        args: [referrer],
        chainId: targetChain.id,
      })
    }
  }, [isApproveConfirmed, mintStep, hasValidReferral, referralAddress, mintNft])

  // After mint confirms, success
  useEffect(() => {
    if (isMintConfirmed && mintStep === 'minting') {
      setMintStep('success')
      // Show share popup
      setShowSharePopup(true)
      // Track conversion in Matomo
      trackConversion(currentUsdcPrice)
      // Refetch user token data to enable redemption UI and referral link
      // Add delay to allow blockchain state to propagate, then refetch multiple times
      const refreshData = async () => {
        // Wait 2 seconds for blockchain state to propagate
        await new Promise(resolve => setTimeout(resolve, 2000))
        await Promise.all([refetchUserToken(), refetchCanMint()])
        // Refetch again after another second to ensure tokenId query runs
        await new Promise(resolve => setTimeout(resolve, 1000))
        await Promise.all([refetchUserToken(), refetchCanMint()])
      }
      refreshData()
    }
  }, [isMintConfirmed, mintStep, refetchUserToken, refetchCanMint])

  // Handle approve error (user rejected tx or other error)
  useEffect(() => {
    if (approveError && mintStep === 'approving') {
      console.error('Approve error:', approveError)
      setMintStep('idle')
      resetApprove()
    }
  }, [approveError, mintStep, resetApprove])

  // Handle mint error (user rejected tx or other error)
  useEffect(() => {
    if (mintError && mintStep === 'minting') {
      console.error('Mint error:', mintError)
      setMintStep('idle')
      resetMint()
    }
  }, [mintError, mintStep, resetMint])

  // === REDEMPTION FLOW ===
  const { writeContract: redeemNft, data: redeemTxHash, isPending: isRedeeming, error: redeemError, reset: resetRedemption } = useWriteContract()
  const { isLoading: isRedeemConfirming, isSuccess: isRedeemConfirmed } = useWaitForTransactionReceipt({
    hash: redeemTxHash,
  })

  // Handle redemption initiation (supports both single and batch)
  const handleStartRedemption = useCallback(async (tokenIdsToRedeem: number[]) => {
    if (!address || tokenIdsToRedeem.length === 0) return

    // Switch chain if needed
    if (isWrongChain) {
      try {
        await switchChain({ chainId: targetChain.id })
      } catch (e) {
        console.error('Chain switch failed:', e)
        return
      }
    }

    // Generate UUIDs and compute hashes for each token
    const uuids = tokenIdsToRedeem.map(() => generateRedemptionUUID())
    const commitmentHashes = uuids.map(uuid => computeCommitmentHash(uuid))

    // Store UUIDs and tokenIds for later (to send to backend)
    setRedemptionUUIDs(uuids)
    setRedemptionTokenIds(tokenIdsToRedeem)
    setRedemptionStep('redeeming')

    // Save to localStorage in case user leaves before submitting shipping info
    try {
      localStorage.setItem(PENDING_REDEMPTION_KEY, JSON.stringify({
        uuids,
        walletAddress: address,
        tokenIds: tokenIdsToRedeem,
        startedAt: Date.now(),
      }))
    } catch (e) {
      console.error('Failed to save pending redemption:', e)
    }

    try {
      if (tokenIdsToRedeem.length === 1) {
        // Single token redemption
        redeemNft({
          address: ENV.nftContractAddress,
          abi: NFT_ABI,
          functionName: 'redeem',
          args: [BigInt(tokenIdsToRedeem[0]), commitmentHashes[0]],
          chainId: targetChain.id,
        })
      } else {
        // Batch redemption
        redeemNft({
          address: ENV.nftContractAddress,
          abi: NFT_ABI,
          functionName: 'redeemBatch',
          args: [tokenIdsToRedeem.map(id => BigInt(id)), commitmentHashes],
          chainId: targetChain.id,
        })
      }
    } catch (e) {
      console.error('Redemption failed:', e)
      setRedemptionStep('error')
      // Clear localStorage on error
      localStorage.removeItem(PENDING_REDEMPTION_KEY)
    }
  }, [address, isWrongChain, switchChain, redeemNft, PENDING_REDEMPTION_KEY])

  // After redeem confirms, show shipping form
  useEffect(() => {
    if (isRedeemConfirmed && redemptionStep === 'redeeming') {
      setRedemptionStep('shipping')
      refetchRedemption()
      refetchUserToken()
    }
  }, [isRedeemConfirmed, redemptionStep, refetchRedemption, refetchUserToken])

  // Handle redemption error (user rejected tx or other error)
  useEffect(() => {
    if (redeemError && redemptionStep === 'redeeming') {
      console.error('Redemption error:', redeemError)
      // Reset to confirming state so user can try again
      setRedemptionStep('confirming')
      // Clear the pending redemption from localStorage since it wasn't completed
      localStorage.removeItem(PENDING_REDEMPTION_KEY)
      // Reset the mutation state so user can try again
      resetRedemption()
    }
  }, [redeemError, redemptionStep, resetRedemption, PENDING_REDEMPTION_KEY])

  // Validate email
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Check if text contains only English characters (ASCII letters, numbers, common punctuation)
  const isEnglishOnly = (text: string): boolean => {
    // Allow ASCII letters, numbers, spaces, and common punctuation/symbols
    return /^[\x20-\x7E]*$/.test(text)
  }

  // Validate phone number (only digits)
  const isValidPhone = (phone: string): boolean => {
    return /^\d+$/.test(phone)
  }

  // Validate shipping info
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

  // Handle shipping info submission to backend (submits for all redeemed tokens)
  const handleShippingSubmit = async () => {
    const validationError = validateShippingInfo()
    if (validationError) {
      setShippingError(validationError)
      return
    }
    if (redemptionUUIDs.length === 0 || !address || redemptionTokenIds.length === 0) {
      setShippingError('Missing redemption data')
      return
    }

    setShippingError(null)
    setIsSubmitting(true)
    setRedemptionStep('submitting')

    try {
      // Submit shipping info as a single batch request with all tokenIds
      const response = await fetch(`${ENV.redemptionApiUrl.replace('/email-redemptions', '/shipping-redemption')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuids: redemptionUUIDs,
          walletAddress: address,
          tokenIds: redemptionTokenIds,
          deviceCount: redemptionTokenIds.length,
          ...shippingInfo,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to submit shipping info')
      }

      // Clear localStorage on success
      localStorage.removeItem(PENDING_REDEMPTION_KEY)
      setRedemptionStep('success')
    } catch (e) {
      console.error('Shipping submission failed:', e)
      setShippingError(e instanceof Error ? e.message : 'Failed to submit shipping info')
      setRedemptionStep('shipping')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Update shipping info field
  const updateShippingField = (field: keyof typeof shippingInfo, value: string) => {
    setShippingInfo(prev => ({ ...prev, [field]: value }))
    if (shippingError) setShippingError(null)
  }

  // Track previous address to detect actual changes
  const prevAddressRef = useRef<string | undefined>(undefined)

  // Reset redemption state when address actually changes
  useEffect(() => {
    // Only reset if address actually changed (not on initial mount or other re-renders)
    if (prevAddressRef.current !== undefined && prevAddressRef.current !== address) {
      // Check if there's a pending redemption for the NEW address
      let hasPendingForNewAddress = false
      try {
        const stored = localStorage.getItem(PENDING_REDEMPTION_KEY)
        if (stored) {
          const pending = JSON.parse(stored)
          if (pending.walletAddress?.toLowerCase() === address?.toLowerCase() && (pending.uuids?.length > 0 || pending.uuid)) {
            hasPendingForNewAddress = true
          }
        }
      } catch (e) {
        // Ignore errors
      }

      // Only reset if no pending redemption for new address
      if (!hasPendingForNewAddress) {
        setRedemptionStep('idle')
        setRedemptionUUIDs([])
        setRedemptionTokenIds([])
        setSelectedTokenIds([])
        setShippingInfo({
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
        setCountrySearch('')
        setShippingError(null)
        setShowRedemptionPanel(false)
      }
    }

    // Update the ref
    prevAddressRef.current = address
  }, [address, PENDING_REDEMPTION_KEY])

  const isRedemptionInProgress = redemptionStep === 'redeeming' || isRedeeming || isRedeemConfirming

  const isTestnetMintInProgress = mintStep === 'approving' || mintStep === 'minting' || isApproving || isApproveConfirming || isMinting || isMintConfirming || isSwitchingChain
  
  const getTestnetButtonText = () => {
    if (isSwitchingChain) return `Switching to ${targetChain.name}...`
    if (isWrongChain) return `Switch to ${targetChain.name}`
    if (isApproving) return 'Approving USDC...'
    if (isApproveConfirming) return 'Confirming Approval...'
    if (isMinting) return 'Minting...'
    if (isMintConfirming) return 'Confirming Mint...'
    if (mintStep === 'success') return '✓ Minted!'
    if (mintStep === 'error') return 'Error - Try Again'
    return 'RESERVE NOW (Testnet)'
  }

  return (
    <div className="mint-page">
      {/* Background Effects */}
      <div className="bg-gradient" />
      <div className="bg-grid" />

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="ff-logo">FREEDOM/FACTORY<sup className="ff-logo-tm">™</sup></span>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Mint Panel */}
        <div className="mint-panel">
          {/* FOMO Badge */}
          <div className="fomo-badge">
            <span className="fomo-dot" />
            <span>LIMITED EDITION</span>
          </div>

          <h1 className="mint-title">{renderDgen1Wordmark(ENV.nftName)}</h1>
          <p className="mint-subtitle">Secure your spot in the future of mobile</p>

          {/* Referral Discount Banner */}
          {hasValidReferral && (
            <div className="referral-banner">
              <span className="referral-icon">🎁</span>
              <span>Referral discount applied! You save {displayDiscount} ETH</span>
            </div>
          )}

          {/* Owned NFTs Info */}
          {nftBalance > 0 && (
            <div className="already-minted-banner">
              <span>✓ You own {nftBalance} dGEN1 reservation{nftBalance > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Wrong Chain Warning */}
          {isWrongChain && (
            <div className="wrong-chain-banner">
              <span>⚠️ Please switch to {targetChain.name} to mint</span>
              <button 
                className="switch-chain-btn"
                onClick={() => switchChain({ chainId: targetChain.id })}
                disabled={isSwitchingChain}
              >
                {isSwitchingChain ? 'Switching...' : `Switch to ${targetChain.name}`}
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="loading-indicator">
              <span className="loading-dot" />
              <span>Loading...</span>
            </div>
          )}

          {/* Error State */}
          {isError && (
            <div className="error-indicator">
              <span>⚠ Could not load contract data</span>
            </div>
          )}

          {/* Sale Status */}
          {!isSaleActive && !isLoading && (
            <div className="sale-paused">
              <span>⏸ Sale is currently paused</span>
            </div>
          )}

          {/* Urgency Messages */}
          {!isLoading && isAlmostGone && remaining > 0 && (
            <div className="urgency-alert">
              <span>🔥 ALMOST SOLD OUT — Only {remaining.toLocaleString()} left!</span>
            </div>
          )}
          {!isLoading && !isAlmostGone && isHalfGone && (
            <div className="urgency-warning">
              <span>⚡ SELLING FAST — {remaining.toLocaleString()} remaining</span>
            </div>
          )}

          {/* Supply Info - only show when 10% claimed */}
          {percentMinted >= 10 && (
            <div className="supply-info">
              <div className="supply-bar">
                <div 
                  className={`supply-fill ${isAlmostGone ? 'supply-fill-urgent' : ''}`}
                  style={{ width: '85.7%' }}
                />
              </div>
              <div className="supply-text">
                <span className="supply-label">Already</span>
                <span className="minted-count">
                  {isLoading ? '---' : minted.toLocaleString()}
                </span>
                <span className="supply-label">claimed</span>
              </div>
            </div>
          )}

          {/* Quantity Selector */}
          <div className="quantity-section">
            <span className="quantity-label">Quantity</span>
            <div className="quantity-controls">
              <button
                className="quantity-btn"
                onClick={() => setMintQuantity(q => Math.max(1, q - 1))}
                disabled={mintQuantity <= 1}
              >
                −
              </button>
              <span className="quantity-value">{mintQuantity}</span>
              <button
                className="quantity-btn"
                onClick={() => setMintQuantity(q => Math.min(maxMintQuantity, q + 1))}
                disabled={mintQuantity >= maxMintQuantity}
              >
                +
              </button>
            </div>
          </div>

          {/* Price */}
          <div className="price-section">
            <span className="price-label">Total Price</span>
            <div className="price-value-container">
              {hasValidReferral && (
                <span className="price-original">{(ENV.nftPriceEth * mintQuantity).toFixed(2)} ETH</span>
              )}
              <span className={`price-value ${hasValidReferral ? 'price-discounted' : ''}`}>
                {isLoading ? '---' : `${(hasValidReferral ? displayDiscountedEth * mintQuantity : ENV.nftPriceEth * mintQuantity).toFixed(2)} ETH`}
              </span>
              {hasValidReferral && (
                <span className="price-savings">(-5%)</span>
              )}
            </div>
            {mintQuantity > 1 && (
              <div className="price-per-unit">
                {hasValidReferral ? displayDiscountedEth : ENV.nftPriceEth} ETH each
              </div>
            )}
          </div>

          {/* Limit Notice */}
          <div className="limit-notice">
            <span className="limit-icon">⏳</span>
            <span>1 year to redeem NFT for physical device</span>
          </div>

          <div className="limit-notice">
            <span className="limit-icon">🚫</span>
            <span>No shipping to US-sanctioned regions, Nigeria, Donetsk, or Luhansk</span>
          </div>

          {/* Mint Button - Testnet uses direct calls, Mainnet uses Daimo Pay */}
          {canMint ? (
            ENV.isTestnet ? (
              // TESTNET MODE: Direct contract interaction
              <button 
                className={`mint-btn ${isAlmostGone ? 'mint-btn-urgent' : ''}`}
                onClick={isConnected ? handleTestnetMint : () => openConnectModal?.()}
                disabled={isLoading || isTestnetMintInProgress || (!isConnected && !openConnectModal)}
              >
                {!isConnected ? 'CONNECT WALLET' : getTestnetButtonText()}
              </button>
            ) : (
              // MAINNET MODE: Daimo Pay
              // Only render DaimoPayButton when price data is loaded AND we know the recipient address.
              // Payment parameters are updated via resetPayment() when quantity changes.
              mintPriceUsdc !== undefined ? (
                address && mintCalldata ? (
                  <DaimoPayButton.Custom
                    // Key changes when address changes (wallet switch) or after successful payment.
                    // Quantity/price changes are handled by resetPayment() from useDaimoPayUI hook.
                    key={`daimo-${address}-${daimoResetKey}`}
                    appId={ENV.daimoAppId}
                    toChain={ENV.chainId}
                    toToken={ENV.paymentTokenAddress}
                    toUnits={currentUsdcPrice.toFixed(6)}
                    toAddress={ENV.nftContractAddress}
                    toCallData={mintCalldata}
                    intent="Reserve dGEN1"
                    closeOnSuccess={true}
                    onPaymentCompleted={handlePaymentCompleted}
                  >
                    {({ show }) => (
                      <button 
                        className={`mint-btn ${isAlmostGone ? 'mint-btn-urgent' : ''}`}
                        onClick={show}
                      >
                        RESERVE NOW
                      </button>
                    )}
                  </DaimoPayButton.Custom>
                ) : (
                  <button 
                    className={`mint-btn ${isAlmostGone ? 'mint-btn-urgent' : ''}`}
                    onClick={() => openConnectModal?.()}
                    disabled={!openConnectModal}
                  >
                    CONNECT WALLET TO RESERVE
                  </button>
                )
              ) : (
                <button 
                  className={`mint-btn ${isAlmostGone ? 'mint-btn-urgent' : ''}`}
                  disabled={true}
                >
                  {isLoading ? 'Loading...' : 'RESERVE NOW'}
                </button>
              )
            )
          ) : (
            <button
              className="mint-btn"
              disabled={true}
            >
              {!isSaleActive
                ? 'SALE PAUSED'
                : remaining === 0
                  ? 'SOLD OUT'
                  : 'RESERVE NOW'
              }
            </button>
          )}

          {/* Wallet Connection for referral link generation */}
          {isConnected ? (
            <button className="disconnect-btn" onClick={() => disconnect()}>
              Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          ) : (
            <button 
              className="connect-wallet-btn"
              onClick={() => openConnectModal?.()}
              disabled={isConnecting || !openConnectModal}
            >
              {isConnecting ? 'Connecting...' : 'Connect wallet for referral link'}
            </button>
          )}

          {/* Info Text */}
          <p className="mint-info">
            {ENV.isTestnet 
              ? `🧪 TESTNET MODE • Price: ${currentUsdcPrice} MockUSDC`
              : 'Pay with any token • Any chain • Instant confirmation'
            }
          </p>

          {/* Remaining Counter - only show when 10% claimed */}
          {percentMinted >= 10 && (
            <div className="remaining-info">
              <span className="remaining-label">Already</span>
              <span className={`remaining-value ${isAlmostGone ? 'remaining-urgent' : ''}`}>
                {isLoading ? '---' : minted.toLocaleString()}
              </span>
              <span className="remaining-label">claimed</span>
            </div>
          )}

          {/* Referral Program Section */}
          <div className="referral-program-section">
            <div className="referral-program-header">
              <span className="referral-program-badge">💰 EARN 5%</span>
              <h3 className="referral-program-title">Referral Program</h3>
            </div>
            
            {hasMinted && address ? (
              /* NFT Holder - Show their referral link prominently */
              <div className="referral-link-panel">
                <p className="referral-panel-description">
                  Share your link and earn <strong>5% commission</strong> on every sale. 
                  Your friends also get <strong>5% off</strong>!
                </p>
                <div className="referral-link-box">
                  <input 
                    type="text" 
                    value={referralLink} 
                    readOnly 
                    className="referral-input"
                  />
                  <button 
                    className="copy-btn"
                    onClick={copyReferralLink}
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="referral-share-buttons">
                  <a 
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Reserve your dGEN1 device and get 5% off with my referral link!\n\n${referralLink}${ENV.quoteTweetUrl ? '\n\n' + ENV.quoteTweetUrl : ''}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="share-btn share-twitter"
                  >
                    Share on X
                  </a>
                </div>
              </div>
            ) : (
              /* Not an NFT holder - Show how to get a referral link */
              <div className="referral-how-to">
                <p className="referral-how-to-text">
                  {!isConnected 
                    ? '1. Connect your wallet → 2. Reserve a dGEN1 → 3. Get your unique referral link'
                    : hasMinted
                      ? 'Your referral link will appear here once your reservation is confirmed.'
                      : '1. Reserve a dGEN1 → 2. Get your unique referral link to share & earn'
                  }
                </p>
                <div className="referral-benefits-mini">
                  <span>🎁 Friends get 5% off</span>
                  <span className="benefit-divider">•</span>
                  <span>💵 You earn 5% commission</span>
                </div>
              </div>
            )}
          </div>

          {/* Redemption Section for NFT Holders */}
          {canRedeem && address && (
            <div className="redemption-section" id="redemption-section">
              <button
                className="redemption-toggle"
                onClick={() => setShowRedemptionPanel(!showRedemptionPanel)}
              >
                <span>🎫</span>
                <span>Redeem Your Device{tokenIds.length > 1 ? 's' : ''}</span>
              </button>

              {showRedemptionPanel && (
                <div className="redemption-panel">
                  {redemptionStep === 'idle' && (
                    <>
                      <p className="redemption-description">
                        Ready to claim your dGEN1 device{tokenIds.length > 1 ? 's' : ''}? Redeeming will:
                      </p>
                      <ul className="redemption-steps-list">
                        <li>• Burn your reservation NFT{tokenIds.length > 1 ? 's' : ''}</li>
                        <li>• Collect your shipping information</li>
                        <li>• Confirm your spot in the queue</li>
                      </ul>
                      <div className="redemption-warning">
                        <span>⚠️</span>
                        <span>This action is irreversible. Your NFT{tokenIds.length > 1 ? 's' : ''} will be burned.</span>
                      </div>
                      {tokenIds.length > 1 ? (
                        <button
                          className="redeem-btn"
                          onClick={() => setRedemptionStep('selecting')}
                        >
                          SELECT TOKEN{tokenIds.length > 1 ? 'S' : ''} TO REDEEM
                        </button>
                      ) : tokenIds.length === 1 ? (
                        <button
                          className="redeem-btn"
                          onClick={() => {
                            setSelectedTokenIds([tokenIds[0]])
                            setRedemptionStep('confirming')
                          }}
                        >
                          REDEEM TOKEN #{tokenIds[0]}
                        </button>
                      ) : null}
                    </>
                  )}

                  {redemptionStep === 'selecting' && (
                    <>
                      <p className="redemption-confirm-text">
                        Select which tokens to redeem (you can select multiple):
                      </p>
                      <div className="token-select-grid">
                        {tokenIds.map((tid) => (
                          <label
                            key={tid}
                            className={`token-checkbox-label ${selectedTokenIds.includes(tid) ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTokenIds.includes(tid)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTokenIds([...selectedTokenIds, tid])
                                } else {
                                  setSelectedTokenIds(selectedTokenIds.filter(id => id !== tid))
                                }
                              }}
                              className="token-checkbox"
                            />
                            <span>Token #{tid}</span>
                          </label>
                        ))}
                      </div>
                      <div className="token-select-actions">
                        <button
                          className="select-all-btn"
                          onClick={() => setSelectedTokenIds([...tokenIds])}
                          disabled={selectedTokenIds.length === tokenIds.length}
                        >
                          Select All
                        </button>
                        <button
                          className="clear-selection-btn"
                          onClick={() => setSelectedTokenIds([])}
                          disabled={selectedTokenIds.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="redemption-confirm-buttons">
                        <button
                          className="confirm-redeem-btn"
                          onClick={() => setRedemptionStep('confirming')}
                          disabled={selectedTokenIds.length === 0}
                        >
                          CONTINUE ({selectedTokenIds.length} selected)
                        </button>
                        <button
                          className="cancel-redeem-btn"
                          onClick={() => {
                            setRedemptionStep('idle')
                            setSelectedTokenIds([])
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    </>
                  )}

                  {redemptionStep === 'confirming' && selectedTokenIds.length > 0 && (
                    <>
                      <p className="redemption-confirm-text">
                        Are you sure you want to redeem {selectedTokenIds.length} token{selectedTokenIds.length > 1 ? 's' : ''}?
                      </p>
                      <div className="selected-tokens-list">
                        {selectedTokenIds.map(tid => (
                          <span key={tid} className="selected-token-badge">#{tid}</span>
                        ))}
                      </div>
                      <div className="redemption-confirm-buttons">
                        <button
                          className="confirm-redeem-btn"
                          onClick={() => handleStartRedemption(selectedTokenIds)}
                          disabled={isWrongChain && isSwitchingChain}
                        >
                          {isWrongChain ? `Switch to ${targetChain.name} & Redeem` : `YES, REDEEM ${selectedTokenIds.length > 1 ? 'ALL' : 'NOW'}`}
                        </button>
                        <button
                          className="cancel-redeem-btn"
                          onClick={() => {
                            setRedemptionStep(tokenIds.length > 1 ? 'selecting' : 'idle')
                            setSelectedTokenIds([])
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    </>
                  )}

                  {(redemptionStep === 'redeeming' || isRedemptionInProgress) && (
                    <div className="redemption-progress">
                      <div className="redemption-spinner" />
                      <p>
                        {isRedeeming ? 'Confirm in your wallet...' :
                         isRedeemConfirming ? 'Waiting for confirmation...' :
                         'Processing redemption...'}
                      </p>
                    </div>
                  )}

                  {(redemptionStep === 'shipping' || redemptionStep === 'submitting') && (
                    <>
                      <div className="redemption-success-icon">✓</div>
                      <p className="redemption-email-title">
                        {redemptionTokenIds.length > 1
                          ? `Almost done! ${redemptionTokenIds.length} NFTs burned.`
                          : 'Almost done!'}
                      </p>
                      <p className="redemption-email-description">
                        Enter your shipping information to complete the process
                        {redemptionTokenIds.length > 1 ? ` for all ${redemptionTokenIds.length} devices` : ''}:
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
                                // Clear the selected country when user types
                                if (shippingInfo.country) {
                                  updateShippingField('country', '')
                                }
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
                            // Only allow digits
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
                            <span className="email-error-icon">⚠️</span>
                            <span className="email-error-text">{shippingError}</span>
                          </div>
                        )}
                      </div>
                      <button
                        className="submit-email-btn"
                        onClick={handleShippingSubmit}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'SUBMITTING...' : 'COMPLETE REDEMPTION'}
                      </button>
                    </>
                  )}

                  {redemptionStep === 'success' && (
                    <div className="redemption-complete">
                      <div className="redemption-success-icon">🎉</div>
                      <p className="redemption-complete-title">Redemption Complete!</p>
                      <p className="redemption-complete-text">
                        Your dGEN1 device reservation{redemptionTokenIds.length > 1 ? 's have' : ' has'} been confirmed.
                        Check your email for shipping updates.
                      </p>
                      {tokenIds.length > 0 && (
                        <button
                          className="redeem-btn"
                          onClick={() => {
                            refetchUserToken()
                            setRedemptionStep('idle')
                            setRedemptionUUIDs([])
                            setRedemptionTokenIds([])
                            setSelectedTokenIds([])
                            setShippingInfo({
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
                            setCountrySearch('')
                          }}
                          style={{ marginTop: '1rem' }}
                        >
                          REDEEM MORE TOKENS
                        </button>
                      )}
                    </div>
                  )}

                  {redemptionStep === 'error' && (
                    <div className="redemption-error">
                      <p>Something went wrong. Please try again.</p>
                      <button
                        className="retry-btn"
                        onClick={() => setRedemptionStep('idle')}
                      >
                        TRY AGAIN
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* NFT Preview - Device Image */}
        <div className="nft-preview">
          <div className="nft-image-container">
            <img 
              src="/dGEN1_ghost.gif" 
              alt="dGEN1 Device" 
              className="device-image"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-links">
          <a href={ENV.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a>
          <a href={ENV.twitterUrl} target="_blank" rel="noopener noreferrer">Twitter</a>
          <a href={ENV.discordUrl} target="_blank" rel="noopener noreferrer">Discord</a>
        </div>
        <p className="footer-text">© 2025 Freedom Factory</p>
      </footer>

      {/* Share Popup */}
      {showSharePopup && (
        <div className="share-popup-overlay" onClick={closeSharePopup}>
          <div className="share-popup" onClick={(e) => e.stopPropagation()}>
            <button className="share-popup-close" onClick={closeSharePopup}>×</button>
            <div className="share-popup-icon">🎉</div>
            <h2 className="share-popup-title">Purchase Successful!</h2>
            <p className="share-popup-subtitle">You've reserved your dGEN1 device</p>

            <div className="share-popup-redeem-notice">
              <p className="share-popup-redeem-text">You can now start the redemption process to claim your device.</p>
              <button
                className="share-popup-redeem-btn"
                onClick={() => {
                  closeSharePopup()
                  setRedemptionStep('idle')
                  setSelectedTokenIds([])
                  setShowRedemptionPanel(true)
                  setTimeout(() => {
                    document.getElementById('redemption-section')?.scrollIntoView({ behavior: 'smooth' })
                  }, 100)
                }}
              >
                Start Redemption
              </button>
            </div>

            <div className="share-popup-referral">
              <p className="share-popup-earn">Earn 5% on every referral!</p>
              <p className="share-popup-description">Share your link and earn rewards when friends reserve their device.</p>

              <div className="share-popup-link-box">
                <input
                  type="text"
                  value={referralLink}
                  readOnly
                  className="share-popup-input"
                />
                <button
                  className="share-popup-copy-btn"
                  onClick={copyReferralLinkPopup}
                >
                  {popupCopied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>

              <div className="share-popup-buttons">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just reserved my dGEN1 device! 🔥 Get 5% off with my referral link:\n\n${referralLink}${ENV.quoteTweetUrl ? '\n\n' + ENV.quoteTweetUrl : ''}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="share-popup-btn share-popup-twitter"
                >
                  Share on X
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('I just reserved my dGEN1 device! 🔥 Get 5% off with my referral link!')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="share-popup-btn share-popup-telegram"
                >
                  Share on Telegram
                </a>
              </div>
            </div>

            <button className="share-popup-done" onClick={closeSharePopup}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
