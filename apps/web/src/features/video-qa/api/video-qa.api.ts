import { httpClient } from '../../../shared/api/http-client'
import type {
  VideoQaAskRequest,
  VideoQaAskResponse,
  VideoQaStatusResponse,
} from '../types/video-qa.types'

export async function getVideoQaStatus(videoId: string): Promise<VideoQaStatusResponse> {
  return httpClient.get<VideoQaStatusResponse>(`/student/videos/${videoId}/qa-status`)
}

export async function askVideoQuestion(
  videoId: string,
  payload: VideoQaAskRequest,
): Promise<VideoQaAskResponse> {
  return httpClient.post<VideoQaAskResponse>(`/student/videos/${videoId}/ask`, payload)
}
