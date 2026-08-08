import { useState } from 'react'
import { useParams } from 'react-router'
import { CourseDetailView } from '../../courses/components/CourseDetailView'
import { useCourseDetail } from '../../courses/hooks/useCourseDetail'
import { DocumentStatusList } from '../../documents/components/DocumentStatusList'
import { DocumentUploader } from '../../documents/components/DocumentUploader'
import { useCourseDocuments } from '../../documents/hooks/useCourseDocuments'
import { ExamGenerationManager } from '../../exam-generation/components/ExamGenerationManager'
import { TeacherQuizManager } from '../../quizzes/components/TeacherQuizManager'
import { ErrorState } from '../../../shared/components/ErrorState'
import { ForbiddenState } from '../../../shared/components/ForbiddenState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { NotFoundState } from '../../../shared/components/NotFoundState'
import { TeacherContentManager } from '../components/TeacherContentManager'
import { TeacherCourseForm } from '../components/TeacherCourseForm'

type CourseDetailTab = 'content' | 'quizzes' | 'ai-exam' | 'files'

export function TeacherCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const { data, isLoading, error, refetch } = useCourseDetail(courseId ?? '')
  const documents = useCourseDocuments(courseId ?? '')
  const [activeTab, setActiveTab] = useState<CourseDetailTab>('content')

  if (isLoading) {
    return <LoadingState variant="text" />
  }

  if (error) {
    if (error.status === 403) {
      return <ForbiddenState />
    }
    if (error.status === 404) {
      return <NotFoundState />
    }
    return <ErrorState onRetry={refetch} />
  }

  if (!data) {
    return <NotFoundState />
  }

  return (
    <>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'content'}
          onClick={() => setActiveTab('content')}
          className={`tab${activeTab === 'content' ? ' active' : ''}`}
        >
          المحتوى
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'quizzes'}
          onClick={() => setActiveTab('quizzes')}
          className={`tab${activeTab === 'quizzes' ? ' active' : ''}`}
        >
          الاختبارات
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ai-exam'}
          onClick={() => setActiveTab('ai-exam')}
          className={`tab${activeTab === 'ai-exam' ? ' active' : ''}`}
        >
          امتحان بالذكاء الاصطناعي
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'files'}
          onClick={() => setActiveTab('files')}
          className={`tab${activeTab === 'files' ? ' active' : ''}`}
        >
          الملفات
        </button>
      </div>

      {activeTab === 'content' && (
        <>
          <CourseDetailView course={data} />

          {data.canEdit && <TeacherContentManager course={data} onChange={refetch} />}

          {data.canEdit && (
            <TeacherCourseForm
              course={{
                id: data.id,
                title: data.title,
                description: data.description,
                coverImageUrl: data.coverImageUrl,
                gradeLevel: data.gradeLevel,
                status: data.status,
              }}
              onSaved={refetch}
            />
          )}
        </>
      )}

      {activeTab === 'quizzes' && <TeacherQuizManager course={data} />}

      {activeTab === 'ai-exam' && <ExamGenerationManager course={data} />}

      {activeTab === 'files' && (
        <section className="section">
          <DocumentUploader onUpload={documents.upload} />

          <div style={{ marginTop: 22 }}>
            {documents.isLoading ? (
              <LoadingState variant="list" />
            ) : documents.error ? (
              <ErrorState onRetry={documents.refetch} />
            ) : (
              <DocumentStatusList documents={documents.data} onRetry={documents.retry} />
            )}
          </div>
        </section>
      )}
    </>
  )
}
