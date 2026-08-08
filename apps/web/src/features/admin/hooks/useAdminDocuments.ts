import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminDocuments } from '../api/admin-documents.api'
import type { AdminDocumentListItem, AdminDocumentsFilter } from '../types/admin.types'

interface UseAdminDocumentsResult {
  data: AdminDocumentListItem[] | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminDocuments(filters: AdminDocumentsFilter): UseAdminDocumentsResult {
  const [data, setData] = useState<AdminDocumentListItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const documents = await getAdminDocuments(filters)
        if (!controller.signal.aborted) {
          setData(documents)
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
