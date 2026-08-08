import { httpClient } from '../../../shared/api/http-client'
import type { StudentDocument } from '../types/student-document.types'

export async function getStudentCourseDocuments(
  courseId: string,
): Promise<StudentDocument[]> {
  return httpClient.get<StudentDocument[]>(
    `/student/courses/${courseId}/documents`,
  )
}

/**
 * Fetches the file body as a Blob (with the same session-cookie
 * credentials as every other request) so the caller can trigger a
 * proper named download via an object URL, instead of navigating the
 * browser to a bare backend URL.
 */
export async function downloadStudentDocument(documentId: string): Promise<Blob> {
  return httpClient.getBlob(`/student/documents/${documentId}/download`)
}
