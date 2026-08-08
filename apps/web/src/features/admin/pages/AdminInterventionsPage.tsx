import { useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { useAdminInterventions } from '../hooks/useAdminInterventions'
import {
  deleteAdminIntervention,
  updateAdminInterventionStatus,
} from '../api/admin-interventions.api'
import type { InterventionStatus } from '../types/admin.types'

const RULE_LABELS: Record<string, string> = {
  low_quiz_score: 'نتيجة اختبار منخفضة',
  explicit_confusion_phrase: 'صعوبة في الفهم',
  repeated_concept_question: 'سؤال متكرر',
}

type StatusFilter = InterventionStatus | 'all'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminInterventionsPage() {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { data, isLoading, error, refetch } = useAdminInterventions({
    status: status === 'all' ? undefined : status,
  })

  async function handleToggleStatus(id: string, current: InterventionStatus) {
    setBusyId(id)
    setActionError(null)
    try {
      await updateAdminInterventionStatus(id, current === 'active' ? 'resolved' : 'active')
      refetch()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحديث الحالة، حاول مرة أخرى')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('حذف هذا التنبيه نهائيًا؟')) return
    setBusyId(id)
    setActionError(null)
    try {
      await deleteAdminIntervention(id)
      refetch()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر حذف التنبيه، حاول مرة أخرى')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader title="تنبيهات المتابعة" description="كل تنبيهات الطلاب المتعثرين على المنصة" />

      <div className="actions section" style={{ flexWrap: 'wrap', gap: 8 }}>
        {(['all', 'active', 'resolved'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip clickable outline${status === option ? ' selected' : ''}`}
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
          >
            {option === 'all' ? 'الكل' : option === 'active' ? 'نشط' : 'تم الحل'}
          </button>
        ))}
      </div>

      {actionError && (
        <p role="alert" className="section" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
          {actionError}
        </p>
      )}

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState title="تعذر تحميل التنبيهات" message="لم نتمكن من تحميل قائمة التنبيهات." onRetry={refetch} />
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState fullPage title="لا توجد تنبيهات" message="مفيش تنبيهات مطابقة للفلتر الحالي" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>المعلم</th>
                <th>السبب</th>
                <th>الحالة</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.studentName}</td>
                  <td>{item.teacherName}</td>
                  <td>
                    {RULE_LABELS[item.ruleKey] ?? item.ruleKey}
                    <span className="meta" style={{ display: 'block' }}>
                      {item.weakConcept}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${item.status === 'active' ? 'red' : 'green'}`}>
                      {item.status === 'active' ? 'نشط' : 'تم الحل'}
                    </span>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn text"
                        disabled={busyId === item.id}
                        onClick={() => void handleToggleStatus(item.id, item.status)}
                      >
                        {item.status === 'active' ? 'وضع كمحلول' : 'إعادة فتح'}
                      </button>
                      <button
                        type="button"
                        className="btn text"
                        disabled={busyId === item.id}
                        onClick={() => void handleDelete(item.id)}
                      >
                        <span className="ms">delete</span>
                      </button>
                    </div>
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
