import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { NotFoundState } from '../../../shared/components/NotFoundState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import { USER_ROLE_LABEL, USER_STATUS_LABEL } from '../lib/user-labels'
import { useAdminUserDetail } from '../hooks/useAdminUserDetail'
import { AdminSendNotificationForm } from '../components/AdminSendNotificationForm'
import {
  hardDeleteAdminUser,
  softDeleteAdminUser,
  updateAdminUser,
  updateAdminUserRole,
  updateAdminUserStatus,
} from '../api/admin-users.api'
import type { UserRole } from '../../auth/types/auth.types'
import type { UserStatus } from '../types/admin.types'

function getServerMessage(error: ApiError): string | null {
  const details = error.details
  if (details && typeof details === 'object' && 'message' in details) {
    const message = (details as { message?: unknown }).message
    return typeof message === 'string' ? message : null
  }
  return null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useAdminUserDetail(userId ?? '')

  const [fullName, setFullName] = useState('')
  const [isSyncedName, setIsSyncedName] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Sync the editable field from freshly loaded data exactly once per
  // load — avoids clobbering in-progress edits on an unrelated refetch.
  if (data && !isSyncedName) {
    setFullName(data.fullName)
    setIsSyncedName(true)
  }

  async function withAction<T>(action: () => Promise<T>): Promise<T | null> {
    setIsSaving(true)
    setActionError(null)
    try {
      const result = await action()
      refetch()
      return result
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى')
          : 'حدث خطأ ما، حاول مرة أخرى',
      )
      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveProfile() {
    if (!userId) return
    await withAction(() => updateAdminUser(userId, { fullName }))
  }

  async function handleRoleChange(role: UserRole) {
    if (!userId) return
    if (!window.confirm(`تغيير دور المستخدم إلى "${USER_ROLE_LABEL[role].label}"؟`)) return
    await withAction(() => updateAdminUserRole(userId, role))
  }

  async function handleStatusChange(status: UserStatus) {
    if (!userId) return
    await withAction(() => updateAdminUserStatus(userId, status))
  }

  // Deliberately not routed through withAction: on success we navigate
  // away immediately, so there's nothing left on this page to refetch.
  async function handleSoftDelete() {
    if (!userId) return
    if (!window.confirm('حذف هذا المستخدم؟ يمكن التراجع عن هذا لاحقًا من قاعدة البيانات، لكنه سيختفي من كل القوائم فورًا.')) {
      return
    }
    setIsSaving(true)
    setActionError(null)
    try {
      await softDeleteAdminUser(userId)
      navigate(ROUTE_PATHS.ADMIN.USERS)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى') : 'حدث خطأ ما، حاول مرة أخرى',
      )
      setIsSaving(false)
    }
  }

  async function handleHardDelete() {
    if (!userId) return
    if (
      !window.confirm(
        'حذف نهائي لا يمكن التراجع عنه. سينجح فقط إذا لم يكن للمستخدم أي بيانات مرتبطة (دورات، تسجيلات، طلبات). متأكد؟',
      )
    ) {
      return
    }
    setIsSaving(true)
    setActionError(null)
    try {
      await hardDeleteAdminUser(userId)
      navigate(ROUTE_PATHS.ADMIN.USERS)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (getServerMessage(err) ?? 'حدث خطأ ما، حاول مرة أخرى') : 'حدث خطأ ما، حاول مرة أخرى',
      )
      setIsSaving(false)
    }
  }

  if (!userId) return <NotFoundState />
  if (isLoading) return <LoadingState variant="text" />
  if (error) {
    return (
      <ErrorState
        title="تعذر تحميل المستخدم"
        message="لم نتمكن من تحميل بيانات هذا المستخدم."
        onRetry={refetch}
      />
    )
  }
  if (!data) return <NotFoundState />

  const roleLabel = USER_ROLE_LABEL[data.role]
  const statusLabel = USER_STATUS_LABEL[data.status]
  const hasDependents =
    data.dependentRecordCounts.coursesTaught > 0 ||
    data.dependentRecordCounts.enrollments > 0 ||
    data.dependentRecordCounts.orders > 0

  return (
    <>
      <PageHeader
        title={data.fullName}
        description={data.email}
        badges={
          <>
            <span className={`chip ${roleLabel.chip}`}>{roleLabel.label}</span>
            <span className={`chip ${statusLabel.chip}`}>{statusLabel.label}</span>
          </>
        }
      />

      <div className="grid-3 section">
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">menu_book</span>
          </span>
          <span className="lbl">دورات يُدرّسها</span>
          <span className="num">{data.dependentRecordCounts.coursesTaught}</span>
        </div>
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">how_to_reg</span>
          </span>
          <span className="lbl">تسجيلات</span>
          <span className="num">{data.dependentRecordCounts.enrollments}</span>
        </div>
        <div className="tile">
          <span className="lead-ic">
            <span className="ms">receipt_long</span>
          </span>
          <span className="lbl">طلبات شراء</span>
          <span className="num">{data.dependentRecordCounts.orders}</span>
        </div>
      </div>

      <div className="detail-grid section">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void handleSaveProfile()
          }}
          className="card"
        >
          <div className="tf">
            <label htmlFor="admin-user-name">الاسم الكامل</label>
            <input
              id="admin-user-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              maxLength={150}
              required
            />
          </div>

          <div className="tf">
            <label>تاريخ الإنشاء</label>
            <input value={formatDateTime(data.createdAt)} disabled readOnly />
          </div>

          <div className="tf">
            <label>آخر دخول</label>
            <input value={data.lastLoginAt ? formatDateTime(data.lastLoginAt) : 'لم يسجل دخول بعد'} disabled readOnly />
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <div className="tf">
              <label htmlFor="admin-user-role">الدور</label>
              <select
                id="admin-user-role"
                value={data.role}
                disabled={isSaving}
                onChange={(event) => void handleRoleChange(event.target.value as UserRole)}
              >
                {(['student', 'teacher', 'admin'] as const).map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABEL[role].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="tf">
              <label htmlFor="admin-user-status">الحالة</label>
              <select
                id="admin-user-status"
                value={data.status}
                disabled={isSaving}
                onChange={(event) => void handleStatusChange(event.target.value as UserStatus)}
              >
                {(['active', 'suspended', 'inactive'] as const).map((status) => (
                  <option key={status} value={status}>
                    {USER_STATUS_LABEL[status].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 0 }}>التواصل</h3>
            <AdminSendNotificationForm
              targetUserId={data.id}
              targetLabel={data.fullName}
              relatedEntityType="user"
              relatedEntityId={data.id}
            />
          </div>

          <div className="card" style={{ borderColor: 'var(--error)' }}>
            <h3 style={{ marginBottom: 4 }}>منطقة خطر</h3>
            <p className="meta">
              {hasDependents
                ? 'لهذا المستخدم بيانات مرتبطة — الحذف النهائي لن ينجح إلا بعد إزالتها. استخدم الحذف العادي بدلاً من ذلك.'
                : 'لا توجد بيانات مرتبطة بهذا المستخدم — الحذف النهائي سينجح.'}
            </p>
            <div className="actions">
              <button type="button" disabled={isSaving} className="btn text" onClick={() => void handleSoftDelete()}>
                <span className="ms">delete</span>
                حذف المستخدم
              </button>
              <button type="button" disabled={isSaving} className="btn text" onClick={() => void handleHardDelete()}>
                <span className="ms">delete_forever</span>
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
