import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { env } from '../../../shared/lib/env'
import { server } from '../../../testing/mocks/server'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import type { QuizSummary } from '../../quizzes/types/quiz.types'
import type { CourseDetail } from '../types/course.types'
import { CourseDetailView } from './CourseDetailView'

const course: CourseDetail = {
  id: 'course-1',
  title: 'الميكانيكا الكلاسيكية',
  slug: 'mechanics',
  description: null,
  coverImageUrl: null,
  gradeLevel: null,
  status: 'published',
  teacher: {
    id: 'teacher-1',
    fullName: 'أ. سارة',
  },
  canEdit: false,
  sections: [
    {
      id: 'section-1',
      title: 'قوانين نيوتن',
      sortOrder: 1,
      status: 'published',
      lessons: [
        {
          id: 'lesson-1',
          title: 'القانون الأول',
          videoUrl: 'https://example.com/video.mp4',
          sortOrder: 1,
          status: 'published',
        },
      ],
    },
  ],
}

const quizzes: QuizSummary[] = [
  {
    id: 'quiz-1',
    title: 'اختبار القانون الأول',
    courseId: 'course-1',
    sectionId: 'section-1',
    lessonId: 'lesson-1',
    questionCount: 2,
    submission: null,
  },
]

describe('CourseDetailView', () => {
  it('renders a lesson quiz directly after its lesson', () => {
    renderWithProviders(<CourseDetailView course={course} courseQuizzes={quizzes} />)

    const lessonLink = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/student/lessons/lesson-1')
    const quizLink = screen.getByRole('link', { name: /اختبار القانون الأول/ })

    expect(lessonLink).toBeDefined()
    expect(quizLink).toHaveAttribute('href', '/student/quizzes/quiz-1')
    expect(lessonLink!.compareDocumentPosition(quizLink)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByText(/اختبار بعد الدرس/)).toBeInTheDocument()
  })

  it('defaults to the videos tab and does not fetch the files list until switched', () => {
    renderWithProviders(<CourseDetailView course={course} />)

    const videosTab = screen.getByRole('tab', { name: 'فيديوهات' })
    const filesTab = screen.getByRole('tab', { name: 'ملفات' })

    expect(videosTab).toHaveAttribute('aria-selected', 'true')
    expect(filesTab).toHaveAttribute('aria-selected', 'false')
    expect(
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/student/lessons/lesson-1'),
    ).toBeDefined()
  })

  it('switches to the files tab and shows StudentDocumentsList, replacing the videos view', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/student/courses/${course.id}/documents`, () =>
        HttpResponse.json([
          { id: 'doc-1', fileName: 'ملخص الفصل الأول.pdf', createdAt: '2026-08-01T10:00:00.000Z' },
        ]),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(<CourseDetailView course={course} />)

    await user.click(screen.getByRole('tab', { name: 'ملفات' }))

    expect(await screen.findByText('ملخص الفصل الأول.pdf')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ملفات' })).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.queryAllByRole('link').find((link) => link.getAttribute('href') === '/student/lessons/lesson-1'),
    ).toBeUndefined()

    await user.click(screen.getByRole('tab', { name: 'فيديوهات' }))

    await waitFor(() => {
      expect(
        screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/student/lessons/lesson-1'),
      ).toBeDefined()
    })
  })

  it('shows no video/files tabs for a teacher/owner viewing their own course', () => {
    const ownedCourse: CourseDetail = { ...course, canEdit: true }

    renderWithProviders(<CourseDetailView course={ownedCourse} />)

    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/teacher/lessons/lesson-1'),
    ).toBeDefined()
  })
})
