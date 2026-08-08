import { useMemo, useState } from 'react'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { COURSE_STATUS, ENROLLMENT_STATUS } from '../../../shared/lib/status-labels'
import { useTeacherStudents } from '../hooks/useTeacherStudents'

type Filter = 'all' | 'subscribed' | 'unsubscribed'

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString('ar-EG')} ${currency}`
}

export function TeacherStudentsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [studentIdSearch, setStudentIdSearch] = useState('')
  const { data, isLoading, error, refetch } = useTeacherStudents(
    studentIdSearch.trim() || undefined,
  )

  const students = useMemo(() => {
    if (!data) return []
    if (filter === 'subscribed') {
      return data.students.filter((student) => student.isSubscribedToAnyCourse)
    }
    if (filter === 'unsubscribed') {
      return data.students.filter((student) => !student.isSubscribedToAnyCourse)
    }
    return data.students
  }, [data, filter])

  if (isLoading) return <LoadingState variant="cards" />

  if (error) {
    return (
      <ErrorState
        title="تعذر تحميل الطلاب"
        message="لم نتمكن من تحميل بيانات الطلاب، جرب مرة أخرى."
        onRetry={refetch}
      />
    )
  }

  if (!data) return <EmptyState title="لا توجد بيانات" message="لا توجد بيانات طلاب حالياً" />

  return (
    <>
      <h1 className="page-title">الطلاب</h1>
      <p className="subtitle">كل الطلاب وحالة اشتراكهم في دوراتك وإجمالي المدفوع منهم</p>

      <section className="tiles section">
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">groups</span>
          </span>
          <span className="lbl">كل الطلاب</span>
          <span className="num">{data.totals.studentCount}</span>
        </div>
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">how_to_reg</span>
          </span>
          <span className="lbl">مشتركين</span>
          <span className="num">{data.totals.subscribedStudentCount}</span>
        </div>
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">person_off</span>
          </span>
          <span className="lbl">غير مشتركين</span>
          <span className="num">{data.totals.unsubscribedStudentCount}</span>
        </div>
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">payments</span>
          </span>
          <span className="lbl">إجمالي الإيراد</span>
          <span className="num" style={{ wordBreak: 'break-word' }}>
            {formatMoney(data.totals.revenueMinor, data.currency)}
          </span>
        </div>
      </section>

      <div className="tf section" style={{ maxWidth: 360 }}>
        <label htmlFor="teacher-students-id-search">البحث بمعرف تتبع الفيديو (ID)</label>
        <input
          id="teacher-students-id-search"
          dir="ltr"
          value={studentIdSearch}
          onChange={(event) => setStudentIdSearch(event.target.value)}
          placeholder="الصق الكود الظاهر على الفيديو المسرّب..."
        />
      </div>

      <div className="actions section">
        {[
          { label: 'الكل', value: 'all' },
          { label: 'مشتركين', value: 'subscribed' },
          { label: 'غير مشتركين', value: 'unsubscribed' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={`chip clickable outline${filter === option.value ? ' selected' : ''}`}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value as Filter)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {students.length === 0 ? (
        <EmptyState title="لا توجد نتائج" message="غيّر الفلتر لعرض طلاب آخرين" />
      ) : (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>ID</th>
                <th>حالة الاشتراك</th>
                <th>الكورسات</th>
                <th>إجمالي المدفوع</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>
                    <strong>{student.fullName}</strong>
                    <span className="meta" style={{ display: 'block' }}>
                      {student.email}
                    </span>
                  </td>
                  <td>
                    <code dir="ltr">{student.id}</code>
                  </td>
                  <td>
                    <span className={`chip ${student.isSubscribedToAnyCourse ? 'green' : 'outline'}`}>
                      {student.isSubscribedToAnyCourse ? 'مشترك' : 'غير مشترك'}
                    </span>
                  </td>
                  <td>
                    {student.courses.length === 0 ? (
                      <span className="meta">لا يوجد اشتراك في دوراتك</span>
                    ) : (
                      <div className="student-course-stack">
                        {student.courses.map((course) => {
                          const courseStatus = COURSE_STATUS[course.status]
                          const enrollmentStatus = ENROLLMENT_STATUS[course.enrollmentStatus]

                          return (
                            <div key={course.id} className="student-course-pill">
                              <span>{course.title}</span>
                              <span className={`chip ${courseStatus.chip}`}>{courseStatus.label}</span>
                              <span className={`chip ${enrollmentStatus.chip}`}>{enrollmentStatus.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </td>
                  <td>
                    <strong>{formatMoney(student.totalRevenueMinor, data.currency)}</strong>
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
