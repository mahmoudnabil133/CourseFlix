import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getAdminNotifications } from '../api/admin-notifications.api'
import type { AdminNotificationListItem, AdminNotificationsFilter } from '../types/admin.types'

interface UseAdminNotificationsResult {
  data: AdminNotificationListItem[] | null
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
}

export function useAdminNotifications(
  filters: AdminNotificationsFilter,
): UseAdminNotificationsResult {
  const [data, setData] = useState<AdminNotificationListItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const notifications = await getAdminNotifications(filters)
        if (!controller.signal.aborted) {
          setData(notifications)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is a plain object recreated by callers each render; userId is the real dep.
  }, [filters.userId, refetchToken])

  return {
    data,
    isLoading,
    error,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
