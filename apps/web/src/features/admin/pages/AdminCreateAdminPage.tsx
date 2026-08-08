import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { ROUTE_PATHS } from '../../../app/routes/route-paths'
import { createAdminAccount } from '../api/admin-users.api'

export function AdminCreateAdminPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const admin = await createAdminAccount({ fullName, email, password })
      navigate(`/admin/users/${admin.id}`, { replace: true })
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError && caughtError.status === 400
          ? 'البريد الإلكتروني مستخدم بالفعل أو البيانات غير صحيحة'
          : 'تعذر إنشاء حساب الأدمن، حاول مرة أخرى',
      )
      setIsSaving(false)
    }
  }

  return (
    <>
      <h1 className="page-title">حساب أدمن جديد</h1>
      <p className="subtitle">
        هذا الحساب هيقدر يدخل بنفس صفحة تسجيل الدخول، وهيكون عنده نفس صلاحياتك بالكامل
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="card" style={{ maxWidth: 640, marginInline: 'auto' }}>
        <div className="tf">
          <label htmlFor="new-admin-name">الاسم الكامل</label>
          <input
            id="new-admin-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={3}
            maxLength={150}
            required
            autoFocus
          />
        </div>

        <div className="tf">
          <label htmlFor="new-admin-email">البريد الإلكتروني</label>
          <input
            id="new-admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="tf">
          <label htmlFor="new-admin-password">كلمة المرور</label>
          <input
            id="new-admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
            {error}
          </p>
        )}

        <div className="actions">
          <button type="submit" disabled={isSaving} className="btn">
            <span className="ms">person_add</span>
            {isSaving ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
          </button>
          <button type="button" className="btn text" onClick={() => navigate(ROUTE_PATHS.ADMIN.USERS)}>
            إلغاء
          </button>
        </div>
      </form>
    </>
  )
}
