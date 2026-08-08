import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { COURSE_STATUS } from '../../../shared/lib/status-labels'
import { useAdminCourses } from '../hooks/useAdminCourses'
import type { CourseStatus } from '../../courses/types/course.types'

type StatusFilter = CourseStatus | 'all'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminCoursesPage() {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, error, refetch } = useAdminCourses({
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  })

  return (
    <>
      <PageHeader title="الدورات" description="كل الدورات على المنصة، بغض النظر عن المعلم" />

      <div className="actions section" style={{ flexWrap: 'wrap', gap: 8 }}>
        {(['all', 'draft', 'published', 'archived'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip clickable outline${status === option ? ' selected' : ''}`}
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
          >
            {option === 'all' ? 'كل الحالات' : COURSE_STATUS[option].label}
          </button>
        ))}
      </div>

      <div className="tf section" style={{ maxWidth: 360 }}>
        <label htmlFor="admin-courses-search">بحث بعنوان الدورة</label>
        <input
          id="admin-courses-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="اكتب عنوان الدورة..."
        />
      </div>

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState
          title="تعذر تحميل الدورات"
          message="لم نتمكن من تحميل قائمة الدورات، جرب مرة أخرى."
          onRetry={refetch}
        />
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState fullPage title="لا توجد نتائج" message="غيّر الفلاتر أو مصطلح البحث" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>الدورة</th>
                <th>المعلم</th>
                <th>الحالة</th>
                <th>الصف الدراسي</th>
                <th>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {data.map((course) => {
                const statusLabel = COURSE_STATUS[course.status]
                return (
                  <tr key={course.id}>
                    <td>
                      <Link to={`/admin/courses/${course.id}`}>
                        <strong>{course.title}</strong>
                      </Link>
                    </td>
                    <td>{course.teacherName}</td>
                    <td>
                      <span className={`chip ${statusLabel.chip}`}>{statusLabel.label}</span>
                    </td>
                    <td>{course.gradeLevel ?? '—'}</td>
                    <td>{formatDate(course.createdAt)}</td>
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
