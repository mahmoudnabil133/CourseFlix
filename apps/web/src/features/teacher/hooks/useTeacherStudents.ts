import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getTeacherStudents } from '../api/teacher.api'
import type { TeacherStudentsResponse } from '../types/teacher.types'

interface UseTeacherStudentsResult {
  data: TeacherStudentsResponse | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useTeacherStudents(studentId?: string): UseTeacherStudentsResult {
  const [data, setData] = useState<TeacherStudentsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const students = await getTeacherStudents({ studentId })
        if (!controller.signal.aborted) {
          setData(students)
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
  }, [studentId, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
