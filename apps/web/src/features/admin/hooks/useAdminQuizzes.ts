import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminQuizzes } from '../api/admin-quizzes.api'
import type { AdminQuizListItem, AdminQuizzesFilter } from '../types/admin.types'

interface UseAdminQuizzesResult {
  data: AdminQuizListItem[] | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminQuizzes(filters: AdminQuizzesFilter): UseAdminQuizzesResult {
  const [data, setData] = useState<AdminQuizListItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const quizzes = await getAdminQuizzes(filters)
        if (!controller.signal.aborted) {
          setData(quizzes)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is a plain object recreated by callers each render; courseId is the real dep.
  }, [filters.courseId, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
