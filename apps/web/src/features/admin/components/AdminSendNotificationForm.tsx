import { useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { sendAdminNotification } from '../api/admin-notifications.api'

interface AdminSendNotificationFormProps {
  targetUserId: string
  targetLabel: string
  relatedEntityType?: string
  relatedEntityId?: string
}

// Reused on the User/Course/Quiz detail pages — the moderation
// counterpart to viewing content: if an admin has a comment on
// anything (a course, a lesson/section inside it, a quiz, an account),
// this sends it straight to the person who owns it.
export function AdminSendNotificationForm({
  targetUserId,
  targetLabel,
  relatedEntityType,
  relatedEntityId,
}: AdminSendNotificationFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    setIsSending(true)
    setError(null)
    try {
      await sendAdminNotification({
        userId: targetUserId,
        title,
        message,
        relatedEntityType,
        relatedEntityId,
      })
      setSent(true)
      setTitle('')
      setMessage('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال الإشعار، حاول مرة أخرى')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="btn text" onClick={() => setIsOpen(true)}>
        <span className="ms">notifications_active</span>
        إرسال إشعار إلى {targetLabel}
      </button>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div className="tf">
        <label htmlFor={`notify-title-${targetUserId}`}>العنوان</label>
        <input
          id={`notify-title-${targetUserId}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={150}
          required
          autoFocus
        />
      </div>

      <div className="tf">
        <label htmlFor={`notify-message-${targetUserId}`}>الرسالة</label>
        <textarea
          id={`notify-message-${targetUserId}`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          rows={3}
          required
        />
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {sent && !error && (
        <p style={{ color: 'var(--primary)', fontSize: 13.5, fontWeight: 600 }}>تم إرسال الإشعار بنجاح</p>
      )}

      <div className="actions">
        <button type="submit" disabled={isSending} className="btn">
          <span className="ms">send</span>
          {isSending ? 'جارٍ الإرسال...' : 'إرسال'}
        </button>
        <button
          type="button"
          className="btn text"
          onClick={() => {
            setIsOpen(false)
            setError(null)
          }}
        >
          إغلاق
        </button>
      </div>
    </form>
  )
}
