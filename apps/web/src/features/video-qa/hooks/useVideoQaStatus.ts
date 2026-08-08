import { useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { getVideoQaStatus } from '../api/video-qa.api'
import type { VideoQaTranscriptStatus } from '../types/video-qa.types'

interface UseVideoQaStatusResult {
  status: VideoQaTranscriptStatus | null
  isLoading: boolean
  error: ApiError | null
}

// Same useEffect/useState fetch pattern as useStudentDocuments.ts — no
// data-fetching library is installed in apps/web. Drives whether the
// assistant panel is enabled for the currently playing video.
export function useVideoQaStatus(videoId: string): UseVideoQaStatusResult {
  const [status, setStatus] = useState<VideoQaTranscriptStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!videoId) {
      setStatus(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    getVideoQaStatus(videoId)
      .then((response) => {
        if (!controller.signal.aborted) {
          setStatus(response.status)
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof ApiError ? err : new ApiError('Unknown error', 0))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [videoId])

  return { status, isLoading, error }
}
