import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { ORDER_STATUS_LABEL } from '../lib/order-labels'
import { useAdminOrders } from '../hooks/useAdminOrders'
import type { OrderStatus } from '../types/admin.types'

type StatusFilter = OrderStatus | 'all'

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString('ar-EG')} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminOrdersPage() {
  const [status, setStatus] = useState<StatusFilter>('all')
  const { data, isLoading, error, refetch } = useAdminOrders({
    status: status === 'all' ? undefined : status,
  })

  return (
    <>
      <PageHeader title="الطلبات" description="كل طلبات الشراء على المنصة" />

      <div className="actions section" style={{ flexWrap: 'wrap', gap: 8 }}>
        {(['all', 'pending', 'paid', 'failed'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip clickable outline${status === option ? ' selected' : ''}`}
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
          >
            {option === 'all' ? 'كل الحالات' : ORDER_STATUS_LABEL[option].label}
          </button>
        ))}
      </div>

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState
          title="تعذر تحميل الطلبات"
          message="لم نتمكن من تحميل قائمة الطلبات، جرب مرة أخرى."
          onRetry={refetch}
        />
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState fullPage title="لا توجد طلبات" message="مفيش طلبات مطابقة للفلتر الحالي" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>الحالة</th>
                <th>حالة الدفع</th>
                <th>الإجمالي</th>
                <th>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {data.map((order) => {
                const statusLabel = ORDER_STATUS_LABEL[order.status]
                const paymentLabel = ORDER_STATUS_LABEL[order.paymentStatus]
                return (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/admin/orders/${order.id}`}>
                        <strong>{order.studentName}</strong>
                      </Link>
                    </td>
                    <td>
                      <span className={`chip ${statusLabel.chip}`}>{statusLabel.label}</span>
                    </td>
                    <td>
                      <span className={`chip ${paymentLabel.chip}`}>{paymentLabel.label}</span>
                    </td>
                    <td>
                      <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
