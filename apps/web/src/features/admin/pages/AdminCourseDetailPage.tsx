import { useState, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { NotFoundState } from '../../../shared/components/NotFoundState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import { COURSE_STATUS } from '../../../shared/lib/status-labels'
import { useAdminCourseDetail } from '../hooks/useAdminCourseDetail'
import { AdminSendNotificationForm } from '../components/AdminSendNotificationForm'
import { deleteAdminCourse, updateAdminCourse } from '../api/admin-courses.api'

function getServerMessage(error: ApiError): string | null {
  const details = error.details
  if (details && typeof details === 'object' && 'message' in details) {
    const message = (details as { message?: unknown }).message
    return typeof message === 'string' ? message : null
  }
  return null
}

// Same host check StudentLessonPage uses — most seeded/ingested lesson
// videos are plain MP4 URLs (playable with a <video> tag), only Bunny
// Stream lessons need an <iframe> embed.
function isBunnyStreamPlayerHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return ['iframe.mediadelivery.net', 'player.mediadelivery.net'].includes(hostname)
  } catch {
    return false
  }
}

export function AdminCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useAdminCourseDetail(courseId ?? '')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [isSynced, setIsSynced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null)

  // Same one-time sync pattern as AdminUserDetailPage — avoids clobbering
  // in-progress edits on a refetch after saving.
  if (data && !isSynced) {
    setTitle(data.title)
    setDescription(data.description ?? '')
    setCoverImageUrl(data.coverImageUrl ?? '')
    setGradeLevel(data.gradeLevel ?? '')
    setIsSynced(true)
  }

  async function handleSaveProfile() {
    if (!courseId) return
    setIsSaving(true)
    setActionError(null)
    try {
      await updateAdminCourse(courseId, {
        title,
        description: description || null,
        coverImageUrl: coverImageUrl || null,
        gradeLevel: gradeLevel || null,
      })
      refetch()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى') : 'حدث خطأ ما، حاول مرة أخرى',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(status: 'draft' | 'published') {
    if (!courseId) return
    setIsSaving(true)
    setActionError(null)
    try {
      await updateAdminCourse(courseId, { status })
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
    if (!courseId) return
    if (!window.confirm('حذف هذه الدورة؟ يمكن استرجاعها لاحقًا من قاعدة البيانات، لكنها ستختفي من كل القوائم فورًا.')) {
      return
    }
    setIsSaving(true)
    setActionError(null)
    try {
      await deleteAdminCourse(courseId)
      navigate(ROUTE_PATHS.ADMIN.COURSES)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى') : 'حدث خطأ ما، حاول مرة أخرى',
      )
      setIsSaving(false)
    }
  }

  if (!courseId) return <NotFoundState />
  if (isLoading) return <LoadingState variant="text" />
  if (error) {
    return (
      <ErrorState
        title="تعذر تحميل الدورة"
        message="لم نتمكن من تحميل بيانات هذه الدورة."
        onRetry={refetch}
      />
    )
  }
  if (!data) return <NotFoundState />

  const statusLabel = COURSE_STATUS[data.status]

  return (
    <>
      <PageHeader
        title={data.title}
        description={`المعلم: ${data.teacher.fullName}`}
        badges={<span className={`chip ${statusLabel.chip}`}>{statusLabel.label}</span>}
      />

      <div className="detail-grid section">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleSaveProfile()
            }}
            className="card"
          >
            <div className="tf">
              <label htmlFor="admin-course-title">العنوان</label>
              <input
                id="admin-course-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={3}
                maxLength={150}
                required
              />
            </div>

            <div className="tf">
              <label htmlFor="admin-course-description">الوصف</label>
              <textarea
                id="admin-course-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={5000}
                rows={4}
              />
            </div>

            <div className="tf">
              <label htmlFor="admin-course-cover">رابط صورة الغلاف</label>
              <input
                id="admin-course-cover"
                value={coverImageUrl}
                onChange={(event) => setCoverImageUrl(event.target.value)}
                type="url"
                placeholder="https://..."
              />
            </div>

            <div className="tf">
              <label htmlFor="admin-course-grade">الصف الدراسي</label>
              <input
                id="admin-course-grade"
                value={gradeLevel}
                onChange={(event) => setGradeLevel(event.target.value)}
                maxLength={100}
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
                {isSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </form>

          {/* Full lesson-by-lesson breakdown with an inline video preview
              per lesson — lets an admin actually watch the content (not
              just see a title) to check it's appropriate, without needing
              a separate student/teacher impersonation mode. */}
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>المحتوى</h3>
            {data.sections.length === 0 ? (
              <p className="meta">لا توجد أقسام في هذه الدورة بعد</p>
            ) : (
              data.sections.map((section) => (
                <div key={section.id} style={{ marginBottom: 16 }}>
                  <strong>{section.title}</strong>
                  {section.lessons.length === 0 ? (
                    <p className="meta">لا توجد دروس في هذا القسم</p>
                  ) : (
                    section.lessons.map((lesson) => (
                      <Fragment key={lesson.id}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderTop: '1px solid var(--outline-variant)',
                          }}
                        >
                          <span>{lesson.title}</span>
                          {lesson.videoUrl ? (
                            <button
                              type="button"
                              className="btn text"
                              onClick={() =>
                                setExpandedLessonId((current) => (current === lesson.id ? null : lesson.id))
                              }
                            >
                              <span className="ms">
                                {expandedLessonId === lesson.id ? 'expand_less' : 'play_circle'}
                              </span>
                              {expandedLessonId === lesson.id ? 'إخفاء' : 'مشاهدة'}
                            </button>
                          ) : (
                            <span className="meta">بدون فيديو</span>
                          )}
                        </div>
                        {expandedLessonId === lesson.id && lesson.videoUrl && (
                          <div style={{ position: 'relative', paddingTop: '56.25%', marginBottom: 8 }}>
                            {isBunnyStreamPlayerHost(lesson.videoUrl) ? (
                              <iframe
                                src={lesson.videoUrl}
                                allow="autoplay; fullscreen"
                                allowFullScreen
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 12 }}
                              />
                            ) : (
                              <video
                                src={lesson.videoUrl}
                                controls
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 12, background: '#000' }}
                              />
                            )}
                          </div>
                        )}
                      </Fragment>
                    ))
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {data.status !== 'archived' && (
            <div className="card">
              <div className="tf">
                <label htmlFor="admin-course-status">الحالة</label>
                <select
                  id="admin-course-status"
                  value={data.status}
                  disabled={isSaving}
                  onChange={(event) => void handleStatusChange(event.target.value as 'draft' | 'published')}
                >
                  <option value="draft">مسودة</option>
                  <option value="published">منشورة</option>
                </select>
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: 0 }}>التواصل مع المعلم</h3>
            <AdminSendNotificationForm
              targetUserId={data.teacher.id}
              targetLabel={`المعلم: ${data.teacher.fullName}`}
              relatedEntityType="course"
              relatedEntityId={courseId}
            />
          </div>

          <div className="card" style={{ borderColor: 'var(--error)' }}>
            <h3 style={{ marginBottom: 4 }}>منطقة خطر</h3>
            <p className="meta">حذف هذه الدورة يخفيها فورًا من كل مكان في المنصة.</p>
            <div className="actions">
              <button type="button" disabled={isSaving} className="btn text" onClick={() => void handleDelete()}>
                <span className="ms">delete</span>
                حذف الدورة
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
