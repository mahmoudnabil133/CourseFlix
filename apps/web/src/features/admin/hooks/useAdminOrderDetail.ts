import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminOrderDetail } from '../api/admin-orders.api'
import type { AdminOrderDetail } from '../types/admin.types'

interface UseAdminOrderDetailResult {
  data: AdminOrderDetail | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminOrderDetail(orderId: string): UseAdminOrderDetailResult {
  const [data, setData] = useState<AdminOrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const detail = await getAdminOrderDetail(orderId)
        if (!controller.signal.aborted) {
          setData(detail)
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
  }, [orderId, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
