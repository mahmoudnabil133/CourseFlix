import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../../../shared/components/EmptyState'
import { COURSE_STATUS } from '../../../shared/lib/status-labels'
import { StudentDocumentsList } from '../../course-documents/components/StudentDocumentsList'
import type { QuizSummary } from '../../quizzes/types/quiz.types'
import type { CourseDetail } from '../types/course.types'

interface CourseDetailViewProps {
  course: CourseDetail
  courseQuizzes?: QuizSummary[]
  areQuizzesLoading?: boolean
  quizzesError?: boolean
}

/**
 * Shared student/teacher course-detail presentation. Both
 * StudentCourseDetailPage and TeacherCourseDetailPage render this against
 * the same GET /api/v1/courses/:courseId response — the owning teacher
 * additionally renders TeacherCourseForm alongside it.
 */
export function CourseDetailView({
  course,
  courseQuizzes = [],
  areQuizzesLoading = false,
  quizzesError = false,
}: CourseDetailViewProps) {
  const [activeMediaTab, setActiveMediaTab] = useState<'videos' | 'files'>('videos')
  const lessonCount = course.sections.reduce(
    (total, section) => total + section.lessons.length,
    0,
  )
  const status = COURSE_STATUS[course.status]
  const visibleQuizzes = course.canEdit ? [] : courseQuizzes
  const courseLevelQuizzes = visibleQuizzes.filter((quiz) => !quiz.sectionId && !quiz.lessonId)

  function quizzesForLesson(lessonId: string): QuizSummary[] {
    return visibleQuizzes.filter((quiz) => quiz.lessonId === lessonId)
  }

  function quizzesForSection(sectionId: string): QuizSummary[] {
    return visibleQuizzes.filter((quiz) => quiz.sectionId === sectionId && !quiz.lessonId)
  }

  const videosSection =
    course.sections.length === 0 ? (
      <EmptyState
        title="لسه مفيش محتوى في الدورة دي"
        message="لما يتم إضافة أقسام ودروس هتظهر هنا"
      />
    ) : (
      course.sections.map((section) => (
        <section key={section.id} className="section">
          <div className="section-head">
            <h2>{section.title}</h2>
          </div>

          {section.lessons.length === 0 ? (
            <p className="subtitle">لا يوجد دروس في هذا القسم بعد</p>
          ) : (
            <div className="list">
              {section.lessons.map((lesson) => {
                const lessonPath = course.canEdit
                  ? `/teacher/lessons/${lesson.id}`
                  : `/student/lessons/${lesson.id}`
                const canOpenLesson = !course.canEdit || Boolean(lesson.videoUrl)
                const lessonQuizzes = quizzesForLesson(lesson.id)

                return (
                  <Fragment key={lesson.id}>
                    {canOpenLesson ? (
                      <Link to={lessonPath} className="list-item">
                        <span className="lead">
                          <span className="ms">play_circle</span>
                        </span>
                        <span className="body">
                          <span className="t">{lesson.title}</span>
                          {course.canEdit && <span className="s">فتح الدرس ومتابعة محتوى الكورس</span>}
                        </span>
                      </Link>
                    ) : (
                      <div className="list-item">
                        <span className="lead">
                          <span className="ms">play_circle</span>
                        </span>
                        <span className="body">
                          <span className="t">{lesson.title}</span>
                          <span className="s">أضف رابط فيديو عشان تفتح المعاينة</span>
                        </span>
                      </div>
                    )}
                    {lessonQuizzes.map((quiz) => (
                      <QuizListItem key={quiz.id} quiz={quiz} contextLabel="اختبار بعد الدرس" />
                    ))}
                  </Fragment>
                )
              })}
              {quizzesForSection(section.id).map((quiz) => (
                <QuizListItem key={quiz.id} quiz={quiz} contextLabel="اختبار القسم" />
              ))}
            </div>
          )}
        </section>
      ))
    )

  return (
    <>
      <div className="section-head">
        <div>
          <h1 className="page-title">{course.title}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {[course.gradeLevel, course.teacher.fullName, `${lessonCount} درسًا`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {!course.canEdit && course.status === 'published' && (
            <Link to={`/student/checkout/${course.id}`} className="btn">
              <span className="ms">shopping_cart</span>
              شراء الدورة
            </Link>
          )}
          {!course.canEdit && (
            <Link to={`/student/courses/${course.id}/assistant`} className="btn tonal">
              <span className="ms">smart_toy</span>
              اسأل المساعد
            </Link>
          )}
          <span className={`chip ${status.chip}`}>{status.label}</span>
        </div>
      </div>

      {course.description && <p className="subtitle">{course.description}</p>}

      {course.canEdit ? (
        videosSection
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeMediaTab === 'videos'}
              onClick={() => setActiveMediaTab('videos')}
              className={`tab${activeMediaTab === 'videos' ? ' active' : ''}`}
            >
              فيديوهات
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMediaTab === 'files'}
              onClick={() => setActiveMediaTab('files')}
              className={`tab${activeMediaTab === 'files' ? ' active' : ''}`}
            >
              ملفات
            </button>
          </div>

          {activeMediaTab === 'videos' ? videosSection : <StudentDocumentsList courseId={course.id} />}
        </>
      )}

      {!course.canEdit && areQuizzesLoading && (
        <p className="subtitle">جارٍ تحميل اختبارات الدورة...</p>
      )}

      {!course.canEdit && quizzesError && (
        <p role="alert" style={{ color: 'var(--error)', fontSize: 13.5, fontWeight: 700 }}>
          تعذر تحميل اختبارات الدورة
        </p>
      )}

      {courseLevelQuizzes.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>اختبارات عامة على الدورة</h2>
          </div>
          <div className="list">
            {courseLevelQuizzes.map((quiz) => (
              <QuizListItem key={quiz.id} quiz={quiz} contextLabel="اختبار الدورة" />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function QuizListItem({
  quiz,
  contextLabel,
}: {
  quiz: QuizSummary
  contextLabel: string
}) {
  return (
    <Link to={`/student/quizzes/${quiz.id}`} className="list-item quiz-after-lesson">
      <span className="lead">
        <span className="ms">quiz</span>
      </span>
      <span className="body">
        <span className="t">{quiz.title}</span>
        <span className="s">
          {contextLabel} - {quiz.questionCount} سؤال
          {quiz.submission
            ? ` - تم الحل: ${quiz.submission.score} / ${quiz.submission.total}`
            : ' - جاهز للحل'}
        </span>
      </span>
      <span className="end">
        <span className={`chip${quiz.submission ? ' green' : ''}`}>
          {quiz.submission ? 'تم الحل' : 'ابدأ'}
        </span>
      </span>
    </Link>
  )
}
