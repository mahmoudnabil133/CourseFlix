import { Route, Routes } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { env } from '../../../shared/lib/env'
import { server } from '../../../testing/mocks/server'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import type { AuthContextValue } from '../../auth/context/AuthContext'
import { StudentLessonPage } from './StudentLessonPage'

function renderPage(
  initialEntries = ['/student/lessons/lesson-1'],
  auth?: AuthContextValue,
) {
  return renderWithProviders(
    <Routes>
      <Route path="/student/lessons/:lessonId" element={<StudentLessonPage />} />
      <Route path="/teacher/lessons/:lessonId" element={<StudentLessonPage />} />
    </Routes>,
    { initialEntries, auth },
  )
}

describe('StudentLessonPage', () => {
  const studentAuth: AuthContextValue = {
    user: {
      id: '6205c1fd-034c-4700-8a96-f79a6de16bb0',
      email: 'student@example.com',
      fullName: 'طالب',
      role: 'student',
      avatarUrl: null,
    },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }

  it('renders YouTube lesson URLs as an embedded player', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/lessons/lesson-1`, () =>
        HttpResponse.json({
          id: 'lesson-1',
          title: 'قانون نيوتن الأول',
          video: {
            id: 'video-1',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationSeconds: null,
          },
          course: {
            id: 'course-1',
            title: 'فيزياء',
            currentSectionId: 'section-1',
            sections: [
              {
                id: 'section-1',
                title: 'الحركة',
                sortOrder: 1,
                lessons: [
                  { id: 'lesson-1', title: 'قانون نيوتن الأول', sortOrder: 1 },
                  { id: 'lesson-2', title: 'قانون نيوتن الثاني', sortOrder: 2 },
                ],
              },
            ],
          },
          progress: {
            lastPositionSeconds: 0,
            watchedPercentage: 0,
            status: 'not_started',
          },
        }),
      ),
    )

    renderPage()

    const player = await screen.findByTitle('قانون نيوتن الأول')
    expect(player).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&enablejsapi=1',
    )
  })

  it('shows a subtle student id watermark over the player', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/lessons/lesson-1`, () =>
        HttpResponse.json({
          id: 'lesson-1',
          title: 'قانون نيوتن الأول',
          video: {
            id: 'video-1',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationSeconds: null,
          },
          course: {
            id: 'course-1',
            title: 'فيزياء',
            currentSectionId: 'section-1',
            sections: [
              {
                id: 'section-1',
                title: 'الحركة',
                sortOrder: 1,
                lessons: [{ id: 'lesson-1', title: 'قانون نيوتن الأول', sortOrder: 1 }],
              },
            ],
          },
          progress: {
            lastPositionSeconds: 0,
            watchedPercentage: 0,
            status: 'not_started',
          },
        }),
      ),
    )

    renderPage(['/student/lessons/lesson-1'], studentAuth)

    expect(await screen.findByTestId('student-video-watermark')).toHaveTextContent(
      'ID 6205C1FD03',
    )
    expect(screen.getAllByText('ID 6205C1FD03')).toHaveLength(10)
  })

  it('renders Bunny Stream iframe embed codes as an embedded player', async () => {
    const bunnyEmbed =
      '<div style="position:relative;padding-top:56.25%;"><iframe src="https://player.mediadelivery.net/embed/663132/b40c3ee1-00ee-4fd8-ab8e-2e0993b11030?autoplay=true&amp;loop=false&amp;muted=true&amp;preload=true&amp;responsive=true" loading="lazy"></iframe></div>'

    server.use(
      http.get(`${env.apiBaseUrl}/lessons/lesson-1`, () =>
        HttpResponse.json({
          id: 'lesson-1',
          title: 'درس Bunny',
          video: {
            id: 'video-1',
            url: bunnyEmbed,
            durationSeconds: null,
          },
          course: {
            id: 'course-1',
            title: 'فيزياء',
            currentSectionId: 'section-1',
            sections: [
              {
                id: 'section-1',
                title: 'الحركة',
                sortOrder: 1,
                lessons: [{ id: 'lesson-1', title: 'درس Bunny', sortOrder: 1 }],
              },
            ],
          },
          progress: {
            lastPositionSeconds: 0,
            watchedPercentage: 0,
            status: 'not_started',
          },
        }),
      ),
    )

    renderPage()

    const player = await screen.findByTitle('درس Bunny')
    expect(player).toHaveAttribute(
      'src',
      'https://player.mediadelivery.net/embed/663132/b40c3ee1-00ee-4fd8-ab8e-2e0993b11030?autoplay=true&loop=false&muted=true&preload=true&responsive=true',
    )
  })

  it('sends progress heartbeats for embedded YouTube and Bunny players', async () => {
    let progressPayload: unknown
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((handler: TimerHandler) => {
        if (typeof handler === 'function') {
          handler()
        }
        return 1 as unknown as ReturnType<typeof setInterval>
      })

    server.use(
      http.get(`${env.apiBaseUrl}/lessons/lesson-1`, () =>
        HttpResponse.json({
          id: 'lesson-1',
          title: 'درس Bunny',
          video: {
            id: 'video-1',
            url: 'https://player.mediadelivery.net/embed/663132/b40c3ee1-00ee-4fd8-ab8e-2e0993b11030',
            durationSeconds: null,
          },
          course: {
            id: 'course-1',
            title: 'فيزياء',
            currentSectionId: 'section-1',
            sections: [
              {
                id: 'section-1',
                title: 'الحركة',
                sortOrder: 1,
                lessons: [{ id: 'lesson-1', title: 'درس Bunny', sortOrder: 1 }],
              },
            ],
          },
          progress: {
            lastPositionSeconds: 0,
            watchedPercentage: 0,
            status: 'not_started',
          },
        }),
      ),
      http.post(`${env.apiBaseUrl}/lessons/lesson-1/progress`, async ({ request }) => {
        progressPayload = await request.json()
        return HttpResponse.json({
          watchedPercentage: 2.5,
          status: 'in_progress',
          attendanceAwarded: false,
        })
      }),
    )

    try {
      renderPage()
      expect(await screen.findByTitle('درس Bunny')).toBeInTheDocument()

      await waitFor(() => {
        expect(progressPayload).toEqual({
          positionSeconds: 15,
          watchedSeconds: 15,
          durationSeconds: 600,
        })
      })
      expect(screen.getByText('3%')).toBeInTheDocument()
    } finally {
      setIntervalSpy.mockRestore()
    }
  })

  it('marks completed lessons in the course playlist', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/lessons/lesson-1`, () =>
        HttpResponse.json({
          id: 'lesson-1',
          title: 'قانون نيوتن الأول',
          video: {
            id: 'video-1',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationSeconds: null,
          },
          course: {
            id: 'course-1',
            title: 'فيزياء',
            currentSectionId: 'section-1',
            sections: [
              {
                id: 'section-1',
                title: 'الحركة',
                sortOrder: 1,
                lessons: [
                  {
                    id: 'lesson-1',
                    title: 'قانون نيوتن الأول',
                    sortOrder: 1,
                    progressStatus: 'in_progress',
                    watchedPercentage: 30,
                  },
                  {
                    id: 'lesson-2',
                    title: 'درس مكتمل',
                    sortOrder: 2,
                    progressStatus: 'completed',
                    watchedPercentage: 100,
                  },
                ],
              },
            ],
          },
          progress: {
            lastPositionSeconds: 0,
            watchedPercentage: 30,
            status: 'in_progress',
          },
        }),
      ),
    )

    renderPage()

    await screen.findByText('تمت المشاهدة')
    const completedLesson = screen
      .getAllByRole('link')
      .find((link) => link.classList.contains('lesson-nav-item') && link.textContent?.includes('درس مكتمل'))

    if (!completedLesson) {
      throw new Error('completed playlist lesson was not rendered')
    }
    expect(completedLesson).toHaveTextContent('done_all')
    expect(completedLesson).toHaveTextContent('تمت المشاهدة')
  })

  it('shows the course lesson menu and highlights the current lesson for teachers', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/teacher/lessons/lesson-1/player`, () =>
        HttpResponse.json({
          id: 'lesson-1',
          title: 'قانون نيوتن الأول',
          video: {
            id: 'video-1',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationSeconds: null,
          },
          course: {
            id: 'course-1',
            title: 'فيزياء',
            currentSectionId: 'section-1',
            sections: [
              {
                id: 'section-1',
                title: 'الحركة',
                sortOrder: 1,
                lessons: [
                  { id: 'lesson-1', title: 'قانون نيوتن الأول', sortOrder: 1 },
                  { id: 'lesson-2', title: 'قانون نيوتن الثاني', sortOrder: 2 },
                ],
              },
            ],
          },
          progress: {
            lastPositionSeconds: 0,
            watchedPercentage: 0,
            status: 'not_started',
          },
        }),
      ),
    )

    renderPage(['/teacher/lessons/lesson-1'], {
      user: {
        id: 'teacher-1',
        email: 'teacher@example.com',
        fullName: 'معلم الفيزياء',
        role: 'teacher',
        avatarUrl: null,
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    })

    expect(await screen.findByRole('heading', { name: 'فيزياء' })).toBeInTheDocument()
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('قانون نيوتن الأول')
    const nextLessonLinks = screen.getAllByRole('link', { name: /قانون نيوتن الثاني/ })
    expect(nextLessonLinks).toHaveLength(2)
    nextLessonLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/teacher/lessons/lesson-2')
    })
    expect(screen.getByText('معاينة المدرس')).toBeInTheDocument()
  })
})
