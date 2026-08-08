import { httpClient } from '../../../shared/api/http-client'
import { env } from '../../../shared/lib/env'
import type { AdminDocumentListItem, AdminDocumentsFilter } from '../types/admin.types'

export async function getAdminDocuments(
  filters: AdminDocumentsFilter = {},
): Promise<AdminDocumentListItem[]> {
  return httpClient.get<AdminDocumentListItem[]>('/admin/documents', { searchParams: filters })
}

// Opened as a normal top-level navigation (<a target="_blank">), not
// fetched — the session cookie rides along automatically, and the
// endpoint sets Content-Disposition: inline so a PDF just opens in the
// new tab instead of downloading.
export function getAdminDocumentViewUrl(documentId: string): string {
  return `${env.apiBaseUrl}/admin/documents/${documentId}/download`
}

export async function deleteAdminDocument(documentId: string): Promise<void> {
  await httpClient.delete(`/admin/documents/${documentId}`)
}
