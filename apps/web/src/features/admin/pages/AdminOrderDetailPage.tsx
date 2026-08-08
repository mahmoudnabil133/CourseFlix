import { useParams } from 'react-router'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { NotFoundState } from '../../../shared/components/NotFoundState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { ORDER_STATUS_LABEL } from '../lib/order-labels'
import { useAdminOrderDetail } from '../hooks/useAdminOrderDetail'
import { AdminSendNotificationForm } from '../components/AdminSendNotificationForm'

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString('ar-EG')} ${currency}`
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
}

// Read-only over the order itself — see AdminOrdersService's docblock
// (backend) for why orders have no admin-mutable actions. Messaging the
// student is still available, same as every other detail page.
export function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { data, isLoading, error, refetch } = useAdminOrderDetail(orderId ?? '')

  if (!orderId) return <NotFoundState />
  if (isLoading) return <LoadingState variant="text" />
  if (error) {
    return (
      <ErrorState
        title="تعذر تحميل الطلب"
        message="لم نتمكن من تحميل بيانات هذا الطلب."
        onRetry={refetch}
      />
    )
  }
  if (!data) return <NotFoundState />

  const statusLabel = ORDER_STATUS_LABEL[data.status]
  const paymentLabel = ORDER_STATUS_LABEL[data.paymentStatus]

  return (
    <>
      <PageHeader
        title={`طلب ${data.studentName}`}
        description={formatDateTime(data.createdAt)}
        badges={
          <>
            <span className={`chip ${statusLabel.chip}`}>{statusLabel.label}</span>
            <span className={`chip ${paymentLabel.chip}`}>{paymentLabel.label}</span>
          </>
        }
      />

      <div className="detail-grid section">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>عناصر الطلب</h3>
            {data.items.length === 0 ? (
              <p className="meta">لا توجد عناصر</p>
            ) : (
              data.items.map((item) => (
                <div
                  key={item.courseId}
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}
                >
                  <span>{item.title}</span>
                  <strong>{formatMoney(item.priceMinor, data.currency)}</strong>
                </div>
              ))
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--outline-variant)',
              }}
            >
              <strong>الإجمالي</strong>
              <strong>{formatMoney(data.totalMinor, data.currency)}</strong>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>محاولات الدفع</h3>
            {data.payments.length === 0 ? (
              <p className="meta">لا توجد محاولات دفع بعد</p>
            ) : (
              <div className="table-wrap">
                <table className="mtable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>الحالة</th>
                      <th>الطريقة</th>
                      <th>المرجع</th>
                      <th>التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => {
                      const paymentAttemptLabel = ORDER_STATUS_LABEL[payment.status]
                      return (
                        <tr key={payment.id}>
                          <td>{payment.attemptNo}</td>
                          <td>
                            <span className={`chip ${paymentAttemptLabel.chip}`}>{paymentAttemptLabel.label}</span>
                          </td>
                          <td>{payment.method}</td>
                          <td>
                            <code dir="ltr">{payment.externalRef ?? '—'}</code>
                          </td>
                          <td>{formatDateTime(payment.createdAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 0 }}>التواصل مع الطالب</h3>
          <AdminSendNotificationForm
            targetUserId={data.studentId}
            targetLabel={data.studentName}
            relatedEntityType="order"
            relatedEntityId={orderId}
          />
        </div>
      </div>
    </>
  )
}
