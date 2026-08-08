import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminCourses } from '../api/admin-courses.api'
import type { AdminCourseListItem, AdminCoursesFilter } from '../types/admin.types'

interface UseAdminCoursesResult {
  data: AdminCourseListItem[] | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminCourses(filters: AdminCoursesFilter): UseAdminCoursesResult {
  const [data, setData] = useState<AdminCourseListItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const courses = await getAdminCourses(filters)
        if (!controller.signal.aborted) {
          setData(courses)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is a plain object recreated by callers each render; status/teacherId/search are the real deps.
  }, [filters.status, filters.teacherId, filters.search, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
