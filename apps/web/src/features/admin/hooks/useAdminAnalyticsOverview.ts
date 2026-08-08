import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminAnalyticsOverview } from '../api/admin-analytics.api'
import type { AdminAnalyticsOverview } from '../types/admin.types'

interface UseAdminAnalyticsOverviewResult {
  data: AdminAnalyticsOverview | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminAnalyticsOverview(): UseAdminAnalyticsOverviewResult {
  const [data, setData] = useState<AdminAnalyticsOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const overview = await getAdminAnalyticsOverview()
        if (!controller.signal.aborted) {
          setData(overview)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiError ? err : new ApiError('Unknown error', 0))
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => controller.abort()
  }, [refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
