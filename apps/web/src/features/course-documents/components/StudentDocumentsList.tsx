import { useState } from 'react'
import { downloadStudentDocument } from '../api/student-documents.api'
import { useStudentDocuments } from '../hooks/useStudentDocuments'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ApiError } from '../../../shared/api/api-error'

interface StudentDocumentsListProps {
  courseId: string
}

function downloadErrorMessage(error: ApiError): string {
  if (error.status === 401 || error.status === 403) {
    return 'لا تملك صلاحية الوصول لهذا الملف'
  }
  if (error.status === 404) {
    return 'الملف غير موجود أو تم حذفه'
  }
  return 'تعذر تحميل الملف، حاول مرة أخرى'
}

/**
 * Renders a "المواد والملفات" section for enrolled students, listing
 * every completed document in the course. Each row fetches the file as
 * a Blob (same session-cookie credentials as any other request) and
 * triggers a named download via an object URL, rather than navigating
 * the browser to the bare backend URL.
 */
export function StudentDocumentsList({ courseId }: StudentDocumentsListProps) {
  const { data: documents, isLoading, error } = useStudentDocuments(courseId)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})

  async function handleDownload(documentId: string, fileName: string) {
    setDownloadingId(documentId)
    setDownloadErrors((prev) => {
      if (!(documentId in prev)) return prev
      const next = { ...prev }
      delete next[documentId]
      return next
    })

    try {
      const blob = await downloadStudentDocument(documentId)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError('Unknown error', 0)
      setDownloadErrors((prev) => ({ ...prev, [documentId]: downloadErrorMessage(apiError) }))
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading) {
    return (
      <section className="section" id="student-documents-section">
        <div className="section-head">
          <h2>المواد والملفات</h2>
        </div>
        <p className="subtitle">جارٍ تحميل الملفات...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="section" id="student-documents-section">
        <div className="section-head">
          <h2>المواد والملفات</h2>
        </div>
        <p role="alert" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 700 }}>
          تعذر تحميل ملفات الدورة
        </p>
      </section>
    )
  }

  return (
    <section className="section" id="student-documents-section">
      <div className="section-head">
        <h2>المواد والملفات</h2>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="لا توجد مواد حتى الآن"
          message="لما يتم رفع ملفات ومواد للدورة هتظهر هنا"
        />
      ) : (
        <div className="list">
          {documents.map((doc) => {
            const isDownloading = downloadingId === doc.id
            const downloadError = downloadErrors[doc.id]

            return (
              <div key={doc.id} className="list-item">
                <span className="lead">
                  <span className="ms">description</span>
                </span>
                <span className="body">
                  <span className="t">{doc.fileName}</span>
                  <span className="s">
                    {new Date(doc.createdAt).toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                  {downloadError && (
                    <span role="alert" style={{ display: 'block', color: 'var(--error)', fontSize: 12.5, fontWeight: 600 }}>
                      {downloadError}
                    </span>
                  )}
                </span>
                <span className="end">
                  <button
                    type="button"
                    className="btn text"
                    onClick={() => void handleDownload(doc.id, doc.fileName)}
                    disabled={isDownloading}
                  >
                    <span className="ms" aria-hidden="true">
                      {isDownloading ? 'progress_activity' : 'download'}
                    </span>
                    {isDownloading ? 'جارٍ التحميل...' : 'تحميل'}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
