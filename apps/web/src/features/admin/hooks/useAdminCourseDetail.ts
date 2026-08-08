import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminCourseDetail } from '../api/admin-courses.api'
import type { CourseDetail } from '../../courses/types/course.types'

interface UseAdminCourseDetailResult {
  data: CourseDetail | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminCourseDetail(courseId: string): UseAdminCourseDetailResult {
  const [data, setData] = useState<CourseDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const detail = await getAdminCourseDetail(courseId)
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
  }, [courseId, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
