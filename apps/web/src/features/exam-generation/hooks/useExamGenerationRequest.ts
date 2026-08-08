import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import {
  acceptExamGenerationRequest,
  getExamGenerationRequest,
  rejectExamGenerationRequest,
  sendExamGenerationFeedback,
} from '../api/exam-generation.api'
import type { ExamGenerationRequestDetail } from '../types/exam-generation.types'

const POLL_INTERVAL_MS = 5000

interface UseExamGenerationRequestResult {
  data: ExamGenerationRequestDetail | null
  isLoading: boolean
  error: ApiError | null
  accept: () => Promise<void>
  reject: () => Promise<void>
  sendFeedback: (message: string) => Promise<void>
  refetch: () => void
}

export function useExamGenerationRequest(
  requestId: string | null,
): UseExamGenerationRequestResult {
  const [data, setData] = useState<ExamGenerationRequestDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  const isPending = data?.status === 'queued' || data?.status === 'processing'

  useEffect(() => {
    if (!requestId) {
      setData(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()

    async function load() {
      setError(null)
      try {
        const detail = await getExamGenerationRequest(requestId as string)
        if (!controller.signal.aborted) {
          setData(detail)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiError ? err : new ApiError('Unknown error', 0))
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [requestId, refetchToken])

  useEffect(() => {
    if (!isPending) return

    const timer = setInterval(() => {
      setRefetchToken((token) => token + 1)
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [isPending])

  async function accept() {
    if (!requestId) return
    await acceptExamGenerationRequest(requestId)
    setRefetchToken((token) => token + 1)
  }

  async function reject() {
    if (!requestId) return
    await rejectExamGenerationRequest(requestId)
    setRefetchToken((token) => token + 1)
  }

  async function sendFeedback(message: string) {
    if (!requestId) return
    await sendExamGenerationFeedback(requestId, message)
    setRefetchToken((token) => token + 1)
  }

  return {
    data,
    isLoading,
    error,
    accept,
    reject,
    sendFeedback,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
