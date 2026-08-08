import { useCallback, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { askVideoQuestion } from '../api/video-qa.api'
import type { VideoQaChatMessage } from '../types/video-qa.types'

interface UseVideoQaChatResult {
  messages: VideoQaChatMessage[]
  isSending: boolean
  error: ApiError | null
  send: (question: string) => Promise<void>
  retryLast: () => Promise<void>
}

// Video Q&A is intentionally stateless server-side (no persisted
// conversation, unlike the course Tutor) — see video-qa.service.ts for
// why. Messages here only live for the current page visit.
export function useVideoQaChat(videoId: string): UseVideoQaChatResult {
  const [messages, setMessages] = useState<VideoQaChatMessage[]>([])
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const send = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim()
      if (!question || isSending) return

      setError(null)
      setIsSending(true)
      setLastFailedQuestion(null)

      const localId = `local-${Date.now()}`
      setMessages((current) => [...current, { id: localId, role: 'student', text: question }])

      try {
        const response = await askVideoQuestion(videoId, { question })
        setMessages((current) => [
          ...current,
          {
            id: `${localId}-answer`,
            role: 'assistant',
            text: response.answer,
            status: response.status,
            citations: response.citations,
          },
        ])
      } catch (caughtError) {
        const apiError =
          caughtError instanceof ApiError ? caughtError : new ApiError('Unknown error', 0)
        setError(apiError)
        setLastFailedQuestion(question)
        setMessages((current) => [
          ...current,
          {
            id: `${localId}-failed`,
            role: 'assistant',
            text: 'تعذر إرسال السؤال، حاول مرة أخرى',
            failed: true,
          },
        ])
      } finally {
        setIsSending(false)
      }
    },
    [videoId, isSending],
  )

  const retryLast = useCallback(async () => {
    if (lastFailedQuestion) {
      await send(lastFailedQuestion)
    }
  }, [lastFailedQuestion, send])

  return { messages, isSending, error, send, retryLast }
}
