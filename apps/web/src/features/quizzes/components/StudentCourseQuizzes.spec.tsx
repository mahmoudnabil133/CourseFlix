import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { env } from '../../../shared/lib/env'
import { server } from '../../../testing/mocks/server'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import { StudentCourseQuizzes } from './StudentCourseQuizzes'

describe('StudentCourseQuizzes', () => {
  it('shows course quizzes to enrolled students', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/courses/course-1/quizzes`, () =>
        HttpResponse.json([
          {
            id: 'quiz-1',
            title: 'اختبار قوانين نيوتن',
            courseId: 'course-1',
            sectionId: 'section-1',
            lessonId: 'lesson-1',
            questionCount: 2,
            dueAt: null,
            submission: null,
          },
        ]),
      ),
    )

    renderWithProviders(<StudentCourseQuizzes courseId="course-1" />)

    expect(await screen.findByText('اختبار قوانين نيوتن')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /اختبار قوانين نيوتن/ })).toHaveAttribute(
      'href',
      '/student/quizzes/quiz-1',
    )
    expect(screen.getByText(/جاهز للحل/)).toBeInTheDocument()
  })
})
