import { httpClient } from '../../../shared/api/http-client'
import type {
  CreateExamGenerationRequestPayload,
  ExamGenerationRequestDetail,
  ExamGenerationRequestSummary,
} from '../types/exam-generation.types'

export async function createExamGenerationRequest(
  payload: CreateExamGenerationRequestPayload,
): Promise<ExamGenerationRequestSummary> {
  return httpClient.post<ExamGenerationRequestSummary>(
    '/teacher/exam-generation-requests',
    payload,
  )
}

export async function getCourseExamGenerationRequests(
  courseId: string,
): Promise<ExamGenerationRequestSummary[]> {
  return httpClient.get<ExamGenerationRequestSummary[]>(
    `/teacher/courses/${courseId}/exam-generation-requests`,
  )
}

export async function getExamGenerationRequest(
  requestId: string,
): Promise<ExamGenerationRequestDetail> {
  return httpClient.get<ExamGenerationRequestDetail>(
    `/teacher/exam-generation-requests/${requestId}`,
  )
}

export async function acceptExamGenerationRequest(
  requestId: string,
): Promise<ExamGenerationRequestSummary> {
  return httpClient.post<ExamGenerationRequestSummary>(
    `/teacher/exam-generation-requests/${requestId}/accept`,
  )
}

export async function rejectExamGenerationRequest(
  requestId: string,
): Promise<ExamGenerationRequestSummary> {
  return httpClient.post<ExamGenerationRequestSummary>(
    `/teacher/exam-generation-requests/${requestId}/reject`,
  )
}

export async function sendExamGenerationFeedback(
  requestId: string,
  message: string,
): Promise<ExamGenerationRequestSummary> {
  return httpClient.post<ExamGenerationRequestSummary>(
    `/teacher/exam-generation-requests/${requestId}/feedback`,
    { message },
  )
}
