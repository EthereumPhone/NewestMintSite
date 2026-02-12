import { useReadContracts, useWatchContractEvent } from 'wagmi'
import { keccak256, stringToBytes } from 'viem'
import { ENV } from '../config/env'
import { targetChain } from '../config/wagmi'

// NFT Contract ABI - updated for referral system and redemption
export const NFT_ABI = [
  // Events
  {
    name: 'NFTMinted',
    type: 'event',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'pricePaid', type: 'uint256', indexed: false },
      { name: 'referrer', type: 'address', indexed: true },
      { name: 'referrerReward', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'NFTRedeemed',
    type: 'event',
    inputs: [
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  // View functions
  {
    name: 'totalMinted',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'remainingSupply',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'MAX_SUPPLY',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'mintPrice',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'saleActive',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'getMintPrice',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getDiscountedPrice',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getReferrerReward',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'canMint',
    type: 'function',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'mintCount',
    type: 'function',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getMintCount',
    type: 'function',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getReferralStats',
    type: 'function',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [
      { name: 'earnings', type: 'uint256' },
      { name: 'count', type: 'uint256' },
      { name: 'isEligibleReferrer', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'referralEarnings',
    type: 'function',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'referralCount',
    type: 'function',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'mint',
    type: 'function',
    inputs: [{ name: 'referrer', type: 'address' }],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    name: 'mintFor',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'referrer', type: 'address' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    name: 'mintForBatch',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'referrer', type: 'address' },
      { name: 'quantity', type: 'uint256' },
    ],
    outputs: [{ name: 'firstTokenId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    name: 'withdrawReferralEarnings',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Redemption functions
  {
    name: 'redeem',
    type: 'function',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'commitmentHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'redeemBatch',
    type: 'function',
    inputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'commitmentHashes', type: 'bytes32[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'verifyRedemption',
    type: 'function',
    inputs: [{ name: 'commitmentHash', type: 'bytes32' }],
    outputs: [
      { name: 'isValid', type: 'bool' },
      { name: 'redeemer', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'redeemedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'isTokenRedeemed',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'redeemed', type: 'bool' },
      { name: 'commitmentHash', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getRedemptionCount',
    type: 'function',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getRedemptionByToken',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'redeemed', type: 'bool' },
      { name: 'commitmentHash', type: 'bytes32' },
      { name: 'redeemer', type: 'address' },
      { name: 'redeemedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'totalRedemptions',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'tokenOfOwnerByIndex',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const contractConfig = {
  address: ENV.nftContractAddress,
  abi: NFT_ABI,
  chainId: targetChain.id,
} as const

/**
 * Hook to read all NFT contract data at once with live updates
 */
export function useNFTContractData() {
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      {
        ...contractConfig,
        functionName: 'totalMinted',
      },
      {
        ...contractConfig,
        functionName: 'remainingSupply',
      },
      {
        ...contractConfig,
        functionName: 'MAX_SUPPLY',
      },
      {
        ...contractConfig,
        functionName: 'mintPrice',
      },
      {
        ...contractConfig,
        functionName: 'saleActive',
      },
      {
        ...contractConfig,
        functionName: 'getDiscountedPrice',
      },
      {
        ...contractConfig,
        functionName: 'getReferrerReward',
      },
    ],
    query: {
      refetchInterval: 30000, // Background refresh every 30 seconds
      staleTime: 10000,
    },
  })

  // Debug: Log raw contract read results
  console.log('[useNFTContractData] Raw data:', {
    data,
    isLoading,
    isError,
    contractAddress: contractConfig.address,
    chainId: contractConfig.chainId,
  })

  // Watch for NFTMinted events and refetch data in real-time
  useWatchContractEvent({
    ...contractConfig,
    eventName: 'NFTMinted',
    onLogs: () => {
      // Immediately refetch when a new NFT is minted
      refetch()
    },
  })

  // Parse results
  const totalMinted = data?.[0]?.result as bigint | undefined
  const remainingSupply = data?.[1]?.result as bigint | undefined
  const maxSupply = data?.[2]?.result as bigint | undefined
  const mintPrice = data?.[3]?.result as bigint | undefined
  const saleActive = data?.[4]?.result as boolean | undefined
  const discountedPrice = data?.[5]?.result as bigint | undefined
  const referrerReward = data?.[6]?.result as bigint | undefined

  return {
    // Raw BigInt values
    totalMinted,
    remainingSupply,
    maxSupply,
    mintPrice,
    saleActive,
    discountedPrice,
    referrerReward,
    
    // Parsed number values (for display)
    totalMintedNum: totalMinted !== undefined ? Number(totalMinted) : undefined,
    remainingSupplyNum: remainingSupply !== undefined ? Number(remainingSupply) : undefined,
    maxSupplyNum: maxSupply !== undefined ? Number(maxSupply) : undefined,
    // USDC has 6 decimals
    mintPriceUsdc: mintPrice !== undefined ? Number(mintPrice) / 1e6 : undefined,
    discountedPriceUsdc: discountedPrice !== undefined ? Number(discountedPrice) / 1e6 : undefined,
    referrerRewardUsdc: referrerReward !== undefined ? Number(referrerReward) / 1e6 : undefined,
    
    // Loading states
    isLoading,
    isError,
    refetch,
  }
}

/**
 * Hook to check if a referrer is valid (owns a dGEN1 NFT)
 */
export function useReferrerCheck(referrerAddress: string | undefined) {
  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts: referrerAddress ? [
      {
        ...contractConfig,
        functionName: 'balanceOf',
        args: [referrerAddress as `0x${string}`],
      },
    ] : [],
    query: {
      enabled: !!referrerAddress,
    },
  })

  const balance = data?.[0]?.result as bigint | undefined
  const isValidReferrer = balance !== undefined && balance > 0n
  // IMPORTANT:
  // - If we have a referrerAddress but no balance yet, treat status as "checking" (not "invalid").
  // - If the RPC call errors, surface "error" so the UI can block mint until it can verify.
  const status: 'idle' | 'checking' | 'valid' | 'invalid' | 'error' =
    !referrerAddress ? 'idle'
    : isError ? 'error'
    : isLoading ? 'checking'
    : balance === undefined ? 'checking'
    : isValidReferrer ? 'valid'
    : 'invalid'

  // Debug logging
  console.log('[useReferrerCheck]', {
    referrerAddress,
    data,
    balance: balance?.toString(),
    isValidReferrer,
    isLoading,
    isError,
    error,
    status,
  })

  return {
    isValidReferrer,
    isLoading,
    isError,
    error,
    status,
    refetch,
  }
}

/**
 * Hook to check mint count for an address
 */
export function useCanMint(address: string | undefined) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: address ? [
      {
        ...contractConfig,
        functionName: 'mintCount',
        args: [address as `0x${string}`],
      },
    ] : [],
    query: {
      enabled: !!address,
    },
  })

  const mintCount = data?.[0]?.result as bigint | undefined
  const mintCountNum = mintCount !== undefined ? Number(mintCount) : 0

  // Debug logging
  console.log('[useCanMint]', {
    address,
    data,
    mintCount: mintCountNum,
    isLoading,
  })

  return {
    mintCount: mintCountNum,
    hasMinted: mintCountNum > 0,
    canMint: true, // Always can mint now (supply check is done elsewhere)
    isLoading,
    refetch,
  }
}

// ============ Redemption Hooks ============

/**
 * Generate a UUID v4 for redemption commitment
 */
export function generateRedemptionUUID(): string {
  return crypto.randomUUID()
}

/**
 * Compute the commitment hash from a UUID
 * This must match the Solidity: keccak256(abi.encodePacked(uuid))
 * And the backend: keccak256(toUtf8Bytes(uuid)) from ethers
 */
export function computeCommitmentHash(uuid: string): `0x${string}` {
  // Use stringToBytes for explicit UTF-8 encoding (matches ethers.toUtf8Bytes)
  return keccak256(stringToBytes(uuid))
}

/**
 * Hook to check if a specific token has been redeemed
 */
export function useIsTokenRedeemed(tokenId: number | undefined) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: tokenId !== undefined ? [
      {
        ...contractConfig,
        functionName: 'isTokenRedeemed',
        args: [BigInt(tokenId)],
      },
    ] : [],
    query: {
      enabled: tokenId !== undefined,
    },
  })

  const result = data?.[0]?.result as [boolean, `0x${string}`] | undefined

  return {
    isRedeemed: result?.[0] ?? false,
    commitmentHash: result?.[1],
    isLoading,
    refetch,
  }
}

/**
 * Hook to get redemption count for an address
 */
export function useRedemptionCount(address: string | undefined) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: address ? [
      {
        ...contractConfig,
        functionName: 'getRedemptionCount',
        args: [address as `0x${string}`],
      },
    ] : [],
    query: {
      enabled: !!address,
    },
  })

  const count = data?.[0]?.result as bigint | undefined

  return {
    redemptionCount: count !== undefined ? Number(count) : 0,
    isLoading,
    refetch,
  }
}

/**
 * @deprecated Use useIsTokenRedeemed instead - kept for backwards compatibility during transition
 */
export function useHasRedeemed(_address: string | undefined) {
  // This is now a stub that returns false - use useIsTokenRedeemed for token-specific checks
  return {
    hasRedeemed: false,
    commitmentHash: undefined,
    tokenId: undefined,
    redeemedAt: undefined,
    isLoading: false,
    refetch: () => Promise.resolve(),
  }
}

/**
 * Hook to get all of the user's token IDs (for redemption)
 */
export function useUserTokenId(address: string | undefined) {
  // First get the balance
  const { data: balanceData, isLoading: balanceLoading, refetch } = useReadContracts({
    contracts: address ? [
      {
        ...contractConfig,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      },
    ] : [],
    query: {
      enabled: !!address,
      staleTime: 5000,
    },
  })

  const balance = balanceData?.[0]?.result as bigint | undefined
  const balanceNum = balance !== undefined ? Number(balance) : 0
  const hasNFT = balanceNum > 0

  // Debug logging
  console.log('[useUserTokenId]', {
    address,
    balanceData,
    balance: balance?.toString(),
    balanceNum,
    hasNFT,
    balanceLoading,
  })

  // Build contracts array for all token indices
  const tokenContracts = address && balanceNum > 0
    ? Array.from({ length: balanceNum }, (_, i) => ({
        ...contractConfig,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [address as `0x${string}`, BigInt(i)],
      }))
    : []

  const { data: tokenData, isLoading: tokensLoading } = useReadContracts({
    contracts: tokenContracts,
    query: {
      enabled: !!address && balanceNum > 0,
      staleTime: 5000,
    },
  })

  // Extract all token IDs
  const tokenIds: number[] = []
  if (tokenData) {
    for (const result of tokenData) {
      if (result.result !== undefined) {
        tokenIds.push(Number(result.result as bigint))
      }
    }
  }

  return {
    hasNFT,
    balance: balanceNum,
    tokenIds,
    // For backwards compatibility, return the first token ID
    tokenId: tokenIds.length > 0 ? tokenIds[0] : undefined,
    isLoading: balanceLoading || tokensLoading,
    refetch,
  }
}

/**
 * Hook to verify a redemption by commitment hash (for backend verification)
 */
export function useVerifyRedemption(commitmentHash: `0x${string}` | undefined) {
  const { data, isLoading } = useReadContracts({
    contracts: commitmentHash ? [
      {
        ...contractConfig,
        functionName: 'verifyRedemption',
        args: [commitmentHash],
      },
    ] : [],
    query: {
      enabled: !!commitmentHash,
    },
  })

  const result = data?.[0]?.result as [boolean, `0x${string}`, bigint, bigint] | undefined

  return {
    isValid: result?.[0] ?? false,
    redeemer: result?.[1],
    tokenId: result?.[2] !== undefined ? Number(result[2]) : undefined,
    redeemedAt: result?.[3] !== undefined ? Number(result[3]) : undefined,
    isLoading,
  }
}
