import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminQuizDetail } from '../api/admin-quizzes.api'
import type { AdminQuizDetail } from '../types/admin.types'

interface UseAdminQuizDetailResult {
  data: AdminQuizDetail | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminQuizDetail(quizId: string): UseAdminQuizDetailResult {
  const [data, setData] = useState<AdminQuizDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const detail = await getAdminQuizDetail(quizId)
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
  }, [quizId, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
