import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { useAuth } from '../hooks/useAuth'
import { getRoleHomePath } from '../utils/get-role-home-path'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Client-side mirror of LoginDto's shape (IsEmail + MinLength(8)) so
// "required"/format problems are caught before a round trip — never the
// actual authority, the API still validates independently.
function resolveClientError(email: string, password: string): string | null {
  const trimmedEmail = email.trim()
  if (!trimmedEmail && !password) {
    return 'من فضلك أدخل البريد الإلكتروني وكلمة المرور'
  }
  if (!trimmedEmail) {
    return 'البريد الإلكتروني مطلوب'
  }
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return 'صيغة البريد الإلكتروني غير صحيحة'
  }
  if (!password) {
    return 'كلمة المرور مطلوبة'
  }
  if (password.length < 8) {
    return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
  }
  return null
}

// Never distinguish "email not found" from "wrong password" — that would
// let an attacker enumerate registered emails. 401 always stays this one
// combined message; everything else can be as specific as it wants.
function resolveApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مرة أخرى'
  }
  if (error.status === 401) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
  }
  if (error.status === 400) {
    return 'تأكد من صحة البريد الإلكتروني وكلمة المرور وحاول مرة أخرى'
  }
  if (error.status === 429) {
    return 'محاولات كثيرة جدًا، حاول مرة أخرى بعد قليل'
  }
  if (error.status === 0 || error.status >= 500) {
    return 'تعذر الوصول إلى الخادم الآن، حاول مرة أخرى لاحقًا'
  }
  return 'حدث خطأ ما، حاول مرة أخرى'
}

export function LoginForm() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const clientError = resolveClientError(email, password)
    if (clientError) {
      setError(clientError)
      return
    }

    setIsSubmitting(true)
    try {
      const user = await login({ email, password })
      navigate(getRoleHomePath(user.role), { replace: true })
    } catch (caughtError) {
      setError(resolveApiError(caughtError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="tf">
        <label htmlFor="email">البريد الإلكتروني</label>
        <input
          type="email"
          id="email"
          placeholder="name@example.com"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="tf">
        <label htmlFor="password">كلمة المرور</label>
        <input
          type="password"
          id="password"
          placeholder="********"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <span className="error-text" role="alert">
            {error}
          </span>
        )}
      </div>

      <button className="btn big" type="submit" disabled={isSubmitting} style={{ width: '100%' }}>
        <span className="ms">login</span>
        {isSubmitting ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
      </button>
    </form>
  )
}
