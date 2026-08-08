import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import { USER_ROLE_LABEL, USER_STATUS_LABEL } from '../lib/user-labels'
import { useAdminUsers } from '../hooks/useAdminUsers'
import type { UserRole } from '../../auth/types/auth.types'
import type { UserStatus } from '../types/admin.types'

type RoleFilter = UserRole | 'all'
type StatusFilter = UserStatus | 'all'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminUsersPage() {
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, error, refetch } = useAdminUsers({
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  })

  return (
    <>
      <PageHeader
        title="المستخدمون"
        description="كل الطلاب والمعلمين والأدمنز على المنصة"
        actions={
          <Link to={ROUTE_PATHS.ADMIN.CREATE_ADMIN} className="btn">
            <span className="ms">person_add</span>
            أدمن جديد
          </Link>
        }
      />

      <div className="actions section" style={{ flexWrap: 'wrap', gap: 8 }}>
        {(['all', 'student', 'teacher', 'admin'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip clickable outline${role === option ? ' selected' : ''}`}
            aria-pressed={role === option}
            onClick={() => setRole(option)}
          >
            {option === 'all' ? 'كل الأدوار' : USER_ROLE_LABEL[option].label}
          </button>
        ))}

        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--outline-variant)' }} />

        {(['all', 'active', 'suspended', 'inactive'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip clickable outline${status === option ? ' selected' : ''}`}
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
          >
            {option === 'all' ? 'كل الحالات' : USER_STATUS_LABEL[option].label}
          </button>
        ))}
      </div>

      <div className="tf section" style={{ maxWidth: 360 }}>
        <label htmlFor="admin-users-search">بحث بالاسم أو البريد أو معرف تتبع الفيديو (ID)</label>
        <input
          id="admin-users-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="اسم، بريد إلكتروني، أو الكود الظاهر على فيديو مسرّب..."
        />
      </div>

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState
          title="تعذر تحميل المستخدمين"
          message="لم نتمكن من تحميل قائمة المستخدمين، جرب مرة أخرى."
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
                <th>المستخدم</th>
                <th>ID</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>آخر دخول</th>
                <th>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {data.map((user) => {
                const roleLabel = USER_ROLE_LABEL[user.role]
                const statusLabel = USER_STATUS_LABEL[user.status]
                return (
                  <tr key={user.id}>
                    <td>
                      <Link to={`/admin/users/${user.id}`}>
                        <strong>{user.fullName}</strong>
                      </Link>
                      <span className="meta" style={{ display: 'block' }}>
                        {user.email}
                      </span>
                    </td>
                    <td>
                      <code dir="ltr">{user.id}</code>
                    </td>
                    <td>
                      <span className={`chip ${roleLabel.chip}`}>{roleLabel.label}</span>
                    </td>
                    <td>
                      <span className={`chip ${statusLabel.chip}`}>{statusLabel.label}</span>
                    </td>
                    <td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : 'لم يسجل دخول بعد'}</td>
                    <td>{formatDate(user.createdAt)}</td>
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
