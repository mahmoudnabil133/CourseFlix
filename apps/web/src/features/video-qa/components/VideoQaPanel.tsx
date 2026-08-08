import { useState, type FormEvent } from 'react'
import { useVideoQaChat } from '../hooks/useVideoQaChat'
import { useVideoQaStatus } from '../hooks/useVideoQaStatus'
import type { VideoQaTranscriptStatus } from '../types/video-qa.types'
import { VideoQaCitationList } from './VideoQaCitationList'

interface VideoQaPanelProps {
  videoId: string
  // Whether the currently mounted player exposes a seek API — see
  // StudentLessonPage.tsx for how this is derived per player type.
  canSeek: boolean
  onSeek?: (seconds: number) => void
}

const NOT_READY_MESSAGES: Record<Exclude<VideoQaTranscriptStatus, 'completed'>, string> = {
  pending: 'المساعد لسه بيجهز محتوى هذا الفيديو، جرب تاني بعد شوية.',
  processing: 'المساعد لسه بيجهز محتوى هذا الفيديو، جرب تاني بعد شوية.',
  failed: 'تعذر تجهيز محتوى هذا الفيديو للمساعد الذكي.',
  not_available: 'المساعد الذكي غير متاح لهذا الفيديو.',
}

/**
 * Collapsible per-video Q&A panel — scoped to a single video's transcript,
 * unlike the course-wide Tutor. Mirrors the Tutor chat UI conventions
 * (features/tutor) but stays disabled until the video's transcript
 * finishes processing.
 */
export function VideoQaPanel({ videoId, canSeek, onSeek }: VideoQaPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { status, isLoading: isStatusLoading } = useVideoQaStatus(videoId)
  const { messages, isSending, error, send, retryLast } = useVideoQaChat(videoId)
  const [draft, setDraft] = useState('')

  const isReady = status === 'completed'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = draft.trim()
    if (!question) return
    setDraft('')
    await send(question)
  }

  return (
    <div className="card" style={{ gap: 12, marginTop: 18 }}>
      <button
        type="button"
        className="btn tonal"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span className="ms">smart_toy</span>
        اسأل عن هذا الفيديو
        <span className="ms">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </button>

      {isOpen && (
        <div style={{ display: 'grid', gap: 12 }}>
          {isStatusLoading ? (
            <span className="meta">جارٍ التحقق من جاهزية المساعد...</span>
          ) : !isReady ? (
            <span className="chip outline" role="status">
              <span className="ms">info</span>
              {NOT_READY_MESSAGES[status ?? 'not_available']}
            </span>
          ) : (
            <>
              {messages.length === 0 ? (
                <span className="meta">اسأل أي سؤال عن محتوى هذا الفيديو تحديدًا</span>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className="card"
                      style={{
                        maxWidth: message.role === 'student' ? 480 : 560,
                        marginInlineStart: message.role === 'student' ? 'auto' : 0,
                        background:
                          message.role === 'student'
                            ? 'var(--primary-container)'
                            : 'var(--surface-container-low)',
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span className="lead">
                          <span className="ms">
                            {message.role === 'student' ? 'person' : 'smart_toy'}
                          </span>
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
                            {message.text}
                          </p>
                          {message.status === 'no_answer' && (
                            <span className="chip outline" style={{ marginTop: 8 }}>
                              بدون مصادر
                            </span>
                          )}
                          {!message.failed && message.status === 'answered' && (
                            <VideoQaCitationList
                              citations={message.citations ?? []}
                              canSeek={canSeek}
                              onSeek={onSeek}
                            />
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {isSending && <span className="meta">المساعد بيجهز الرد...</span>}

              {error && !isSending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    role="alert"
                    style={{ color: 'var(--error)', fontSize: 12.5, fontWeight: 600 }}
                  >
                    تعذر إرسال السؤال
                  </span>
                  <button type="button" className="btn text" onClick={() => void retryLast()}>
                    إعادة المحاولة
                  </button>
                </div>
              )}

              <form
                onSubmit={(event) => void handleSubmit(event)}
                style={{ display: 'flex', gap: 8 }}
              >
                <div className="tf" style={{ flex: 1 }}>
                  <label htmlFor={`video-qa-question-${videoId}`}>سؤالك عن الفيديو</label>
                  <input
                    id={`video-qa-question-${videoId}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={1000}
                    placeholder="مثلاً: ايه اللي اتقال في الدقيقة الثالثة؟"
                    disabled={isSending}
                  />
                </div>
                <button
                  className="btn big"
                  type="submit"
                  aria-label="إرسال السؤال"
                  disabled={isSending || draft.trim().length === 0}
                >
                  <span className="ms">send</span>
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}
