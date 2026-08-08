import { Link } from 'react-router'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { useAdminQuizzes } from '../hooks/useAdminQuizzes'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminQuizzesPage() {
  const { data, isLoading, error, refetch } = useAdminQuizzes({})

  return (
    <>
      <PageHeader title="الاختبارات" description="كل الاختبارات على المنصة" />

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState
          title="تعذر تحميل الاختبارات"
          message="لم نتمكن من تحميل قائمة الاختبارات، جرب مرة أخرى."
          onRetry={refetch}
        />
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState fullPage title="لا توجد اختبارات" message="مفيش اختبارات على المنصة حاليًا" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>الاختبار</th>
                <th>الدورة</th>
                <th>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {data.map((quiz) => (
                <tr key={quiz.id}>
                  <td>
                    <Link to={`/admin/quizzes/${quiz.id}`}>
                      <strong>{quiz.title}</strong>
                    </Link>
                  </td>
                  <td>{quiz.courseTitle}</td>
                  <td>{formatDate(quiz.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
