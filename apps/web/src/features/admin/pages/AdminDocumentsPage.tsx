import { useState } from 'react'
import { ApiError } from '../../../shared/api/api-error'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ErrorState } from '../../../shared/components/ErrorState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { PageHeader } from '../../../shared/components/PageHeader'
import { DOCUMENT_STATUS } from '../../../shared/lib/status-labels'
import { useAdminDocuments } from '../hooks/useAdminDocuments'
import { deleteAdminDocument, getAdminDocumentViewUrl } from '../api/admin-documents.api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function AdminDocumentsPage() {
  const { data, isLoading, error, refetch } = useAdminDocuments({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(documentId: string, fileName: string) {
    if (!window.confirm(`حذف المستند "${fileName}"؟`)) return
    setDeletingId(documentId)
    setActionError(null)
    try {
      await deleteAdminDocument(documentId)
      refetch()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر حذف المستند، حاول مرة أخرى')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeader title="المستندات" description="كل المستندات المرفوعة على المنصة" />

      {actionError && (
        <p role="alert" className="section" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 600 }}>
          {actionError}
        </p>
      )}

      {isLoading && <LoadingState variant="list" />}

      {!isLoading && error && (
        <ErrorState
          title="تعذر تحميل المستندات"
          message="لم نتمكن من تحميل قائمة المستندات، جرب مرة أخرى."
          onRetry={refetch}
        />
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState fullPage title="لا توجد مستندات" message="مفيش مستندات مرفوعة على المنصة حاليًا" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="table-wrap section">
          <table className="mtable">
            <thead>
              <tr>
                <th>الملف</th>
                <th>الدورة</th>
                <th>الحالة</th>
                <th>الإصدار</th>
                <th>تاريخ الرفع</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((document) => {
                const statusLabel = DOCUMENT_STATUS[document.processingStatus]
                return (
                  <tr key={document.id}>
                    <td>
                      <strong>{document.fileName}</strong>
                      {document.errorMessage && (
                        <span className="meta" style={{ display: 'block', color: 'var(--error)' }}>
                          {document.errorMessage}
                        </span>
                      )}
                    </td>
                    <td>{document.courseTitle}</td>
                    <td>
                      <span className={`chip ${statusLabel.chip}`}>
                        <span className="ms" style={{ fontSize: 16 }}>
                          {statusLabel.icon}
                        </span>
                        {statusLabel.label}
                      </span>
                    </td>
                    <td>{document.version}</td>
                    <td>{formatDate(document.createdAt)}</td>
                    <td>
                      <div className="actions">
                        <a
                          href={getAdminDocumentViewUrl(document.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn text"
                        >
                          <span className="ms">visibility</span>
                          عرض
                        </a>
                        <button
                          type="button"
                          className="btn text"
                          disabled={deletingId === document.id}
                          onClick={() => void handleDelete(document.id, document.fileName)}
                        >
                          <span className="ms">delete</span>
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
