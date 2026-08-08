import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getStudentCourseDocuments } from '../api/student-documents.api'
import type { StudentDocument } from '../types/student-document.types'

interface UseStudentDocumentsResult {
  data: StudentDocument[]
  isLoading: boolean
  error: ApiError | null
}

// Same useEffect/useState pattern as useCourseDocuments.ts — no
// data-fetching library is installed in apps/web.  No polling here:
// student documents only include already-completed files, so there's
// nothing to wait on.
export function useStudentDocuments(courseId: string): UseStudentDocumentsResult {
  const [data, setData] = useState<StudentDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setError(null)

      try {
        const documents = await getStudentCourseDocuments(courseId)
        if (!controller.signal.aborted) {
          setData(documents)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof ApiError ? err : new ApiError('Unknown error', 0),
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => controller.abort()
  }, [courseId])

  return { data, isLoading, error }
}
