import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { NotFoundState } from '../../../shared/components/NotFoundState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import { useAdminQuizDetail } from '../hooks/useAdminQuizDetail'
import { AdminSendNotificationForm } from '../components/AdminSendNotificationForm'
import { deleteAdminQuiz, updateAdminQuiz } from '../api/admin-quizzes.api'

function getServerMessage(error: ApiError): string | null {
  const details = error.details
  if (details && typeof details === 'object' && 'message' in details) {
    const message = (details as { message?: unknown }).message
    return typeof message === 'string' ? message : null
  }
  return null
}

// Admin edit scope is deliberately limited to the title — full question
// editing already has a dedicated authoring UI for teachers
// (TeacherQuizManager); an admin's job here is audit + quick cleanup,
// not content authoring.
export function AdminQuizDetailPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useAdminQuizDetail(quizId ?? '')

  const [title, setTitle] = useState('')
  const [isSynced, setIsSynced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (data && !isSynced) {
    setTitle(data.title)
    setIsSynced(true)
  }

  async function handleSaveTitle() {
    if (!quizId) return
    setIsSaving(true)
    setActionError(null)
    try {
      await updateAdminQuiz(quizId, { title })
      refetch()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى') : 'حدث خطأ ما، حاول مرة أخرى',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!quizId) return
    if (!window.confirm(`حذف اختبار "${data?.title}"؟`)) return
    setIsSaving(true)
    setActionError(null)
    try {
      await deleteAdminQuiz(quizId)
      navigate(ROUTE_PATHS.ADMIN.QUIZZES)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى') : 'حدث خطأ ما، حاول مرة أخرى',
      )
      setIsSaving(false)
    }
  }

  if (!quizId) return <NotFoundState />
  if (isLoading) return <LoadingState variant="text" />
  if (error) {
    return (
      <ErrorState title="تعذر تحميل الاختبار" message="لم نتمكن من تحميل بيانات هذا الاختبار." onRetry={refetch} />
    )
  }
  if (!data) return <NotFoundState />

  return (
    <>
      <PageHeader title={data.title} description={`${data.courseTitle} — المعلم: ${data.teacherName}`} />

      <div className="detail-grid section">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleSaveTitle()
            }}
            className="card"
          >
            <div className="tf">
              <label htmlFor="admin-quiz-title">العنوان</label>
              <input
                id="admin-quiz-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={1}
                required
              />
            </div>

            {actionError && (
              <p role="alert" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
                {actionError}
              </p>
            )}

            <div className="actions">
              <button type="submit" disabled={isSaving} className="btn">
                <span className="ms">save</span>
                {isSaving ? 'جارٍ الحفظ...' : 'حفظ العنوان'}
              </button>
            </div>
          </form>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>الأسئلة ({data.questions.length})</h3>
            {data.questions.map((question, index) => (
              <div key={question.id} style={{ marginBottom: 12 }}>
                <strong>
                  {index + 1}. {question.text}
                </strong>
                {question.options && (
                  <ul style={{ margin: '4px 0', paddingInlineStart: 20 }}>
                    {question.options.map((option) => (
                      <li key={option} className="meta">
                        {option}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="meta">الإجابة الصحيحة: {question.correctAnswer}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <h3 style={{ marginBottom: 0 }}>التواصل مع المعلم</h3>
            <AdminSendNotificationForm
              targetUserId={data.teacherId}
              targetLabel={`المعلم: ${data.teacherName}`}
              relatedEntityType="quiz"
              relatedEntityId={quizId}
            />
          </div>

          <div className="card" style={{ borderColor: 'var(--error)' }}>
            <h3 style={{ marginBottom: 4 }}>منطقة خطر</h3>
            <p className="meta">حذف هذا الاختبار يخفيه فورًا من كل مكان في المنصة.</p>
            <div className="actions">
              <button type="button" disabled={isSaving} className="btn text" onClick={() => void handleDelete()}>
                <span className="ms">delete</span>
                حذف الاختبار
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
