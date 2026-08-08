export type VideoQaAnswerStatus = 'answered' | 'no_answer' | 'not_ready'

export type VideoQaTranscriptStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'not_available'

export interface VideoQaCitation {
  chunkId: string
  startSeconds: number | null
  endSeconds: number | null
  excerpt: string
}

export interface VideoQaAskRequest {
  question: string
}

export interface VideoQaAskResponse {
  status: VideoQaAnswerStatus
  answer: string
  citations: VideoQaCitation[]
}

export interface VideoQaStatusResponse {
  status: VideoQaTranscriptStatus
}

export interface VideoQaChatMessage {
  id: string
  role: 'student' | 'assistant'
  text: string
  status?: VideoQaAnswerStatus
  citations?: VideoQaCitation[]
  failed?: boolean
}
