import { useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { useAdminNotifications } from '../hooks/useAdminNotifications'
import { deleteAdminNotification } from '../api/admin-notifications.api'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
}

// Platform-wide audit view of every user's notifications — distinct
// from the admin's own personal inbox (reused NotificationsPage under
// ROUTE_PATHS.ADMIN.NOTIFICATIONS / the Topbar bell).
export function AdminNotificationsLogPage() {
  const { data, isLoading, error, refetch } = useAdminNotifications({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!window.confirm('حذف هذا الإشعار؟')) return
    setDeletingId(id)
    setActionError(null)
    try {
      await deleteAdminNotification(id)
      refetch()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر حذف الإشعار، حاول مرة أخرى')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeader title="سجل كل الإشعارات" description="كل الإشعارات المرسلة لكل المستخدمين على المنصة" />

      {actionError && (
        <p role="alert" className="section" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
          {actionError}
        </p>
      )}

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState title="تعذر تحميل الإشعارات" message="لم نتمكن من تحميل السجل." onRetry={refetch} />
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState fullPage title="لا توجد إشعارات" message="مفيش إشعارات مسجلة حاليًا" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>العنوان</th>
                <th>مقروء</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.userName}</td>
                  <td>
                    <strong>{item.title}</strong>
                    <span className="meta" style={{ display: 'block' }}>
                      {item.message}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${item.isRead ? 'green' : 'outline'}`}>
                      {item.isRead ? 'مقروء' : 'غير مقروء'}
                    </span>
                  </td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn text"
                      disabled={deletingId === item.id}
                      onClick={() => void handleDelete(item.id)}
                    >
                      <span className="ms">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
