import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import {
  createExamGenerationRequest,
  getCourseExamGenerationRequests,
} from '../api/exam-generation.api'
import type {
  CreateExamGenerationRequestPayload,
  ExamGenerationRequestSummary,
} from '../types/exam-generation.types'

const POLL_INTERVAL_MS = 5000

interface UseExamGenerationRequestsResult {
  data: ExamGenerationRequestSummary[]
  isLoading: boolean
  error: ApiError | null
  create: (payload: CreateExamGenerationRequestPayload) => Promise<void>
  refetch: () => void
}

// Same plain useEffect/useState + silent-poll pattern as
// useCourseDocuments.ts — no data-fetching library in apps/web yet.
export function useExamGenerationRequests(courseId: string): UseExamGenerationRequestsResult {
  const [data, setData] = useState<ExamGenerationRequestSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [refetchToken, setRefetchToken] = useState(0)

  const hasPendingWork = data.some(
    (request) => request.status === 'queued' || request.status === 'processing',
  )

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setError(null)
      try {
        const requests = await getCourseExamGenerationRequests(courseId)
        if (!controller.signal.aborted) {
          setData(requests)
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
  }, [courseId, refetchToken])

  useEffect(() => {
    if (!hasPendingWork) return

    const timer = setInterval(() => {
      setRefetchToken((token) => token + 1)
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [hasPendingWork])

  async function create(payload: CreateExamGenerationRequestPayload) {
    await createExamGenerationRequest(payload)
    setRefetchToken((token) => token + 1)
  }

  return {
    data,
    isLoading,
    error,
    create,
    refetch: () => setRefetchToken((token) => token + 1),
  }
}
