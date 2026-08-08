import { httpClient } from '../../../shared/api/http-client'
import type {
  AdminQuizDetail,
  AdminQuizListItem,
  AdminQuizzesFilter,
  UpdateAdminQuizPayload,
} from '../types/admin.types'

export async function getAdminQuizzes(
  filters: AdminQuizzesFilter = {},
): Promise<AdminQuizListItem[]> {
  return httpClient.get<AdminQuizListItem[]>('/admin/quizzes', { searchParams: filters })
}

export async function getAdminQuizDetail(quizId: string): Promise<AdminQuizDetail> {
  return httpClient.get<AdminQuizDetail>(`/admin/quizzes/${quizId}`)
}

export async function updateAdminQuiz(
  quizId: string,
  payload: UpdateAdminQuizPayload,
): Promise<AdminQuizDetail> {
  return httpClient.patch<AdminQuizDetail>(`/admin/quizzes/${quizId}`, payload)
}

export async function deleteAdminQuiz(quizId: string): Promise<void> {
  await httpClient.delete(`/admin/quizzes/${quizId}`)
}
