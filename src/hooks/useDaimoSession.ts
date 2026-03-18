import { useState, useCallback } from 'react'

type DaimoSession = {
  sessionId: string
  clientSecret: string
}

type CreateSessionParams = {
  toAddress: string
  chainId: number
  tokenAddress: string
  amountUnits: string
  calldata?: string
  title?: string
  verb?: string
}

export function useDaimoSession(apiUrl: string) {
  const [session, setSession] = useState<DaimoSession | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createSession = useCallback(async (params: CreateSessionParams) => {
    setIsCreating(true)
    setError(null)
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!response.ok) {
        throw new Error(`Session creation failed: ${response.statusText}`)
      }
      const data = await response.json()
      setSession({ sessionId: data.sessionId, clientSecret: data.clientSecret })
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create payment session'
      setError(message)
      throw err
    } finally {
      setIsCreating(false)
    }
  }, [apiUrl])

  const clearSession = useCallback(() => {
    setSession(null)
    setError(null)
  }, [])

  return { session, isCreating, error, createSession, clearSession }
}
