import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { env } from '../../../shared/lib/env'
import { server } from '../../../testing/mocks/server'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import type { CourseDetail } from '../../courses/types/course.types'
import { StudentDocumentsList } from './StudentDocumentsList'

const courseId = 'course-1'

function renderSection(id = courseId) {
  return renderWithProviders(<StudentDocumentsList courseId={id} />)
}

function mockDocumentsList() {
  server.use(
    http.get(`${env.apiBaseUrl}/student/courses/${courseId}/documents`, () =>
      HttpResponse.json([
        {
          id: 'doc-1',
          fileName: 'ملخص الفصل الأول.pdf',
          createdAt: '2026-08-01T10:00:00.000Z',
        },
        {
          id: 'doc-2',
          fileName: 'slides.pdf',
          createdAt: '2026-08-02T10:00:00.000Z',
        },
      ]),
    ),
  )
}

describe('StudentDocumentsList', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the list of documents with a download button per row', async () => {
    mockDocumentsList()

    renderSection()

    expect(await screen.findByText('ملخص الفصل الأول.pdf')).toBeInTheDocument()
    expect(screen.getByText('slides.pdf')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'تحميل' })).toHaveLength(2)
  })

  it('downloads the file as a blob and triggers a named download on click', async () => {
    mockDocumentsList()
    server.use(
      http.get(`${env.apiBaseUrl}/student/documents/doc-1/download`, () =>
        new HttpResponse(new Blob(['%PDF-1.4 fake content'], { type: 'application/pdf' }), {
          status: 200,
        }),
      ),
    )

    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const user = userEvent.setup()
    renderSection()

    const buttons = await screen.findAllByRole('button', { name: 'تحميل' })
    await user.click(buttons[0])

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    // the anchor that was clicked carried the real file name, not a generic one
    expect(clickSpy.mock.instances[0]).toHaveProperty('download', 'ملخص الفصل الأول.pdf')
  })

  it('shows a loading state on the row while the download is in flight', async () => {
    mockDocumentsList()
    server.use(
      http.get(`${env.apiBaseUrl}/student/documents/doc-1/download`, async () => {
        // Delay resolution so the in-flight loading state is observable —
        // without this the mocked fetch can resolve within the same
        // microtask flush userEvent.click() awaits internally.
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new HttpResponse(new Blob(['fake']), { status: 200 })
      }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const user = userEvent.setup()
    renderSection()

    const buttons = await screen.findAllByRole('button', { name: 'تحميل' })
    await user.click(buttons[0])

    const loadingButton = screen.getByRole('button', { name: 'جارٍ التحميل...' })
    expect(loadingButton).toBeDisabled()

    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'تحميل' })).toHaveLength(2))
  })

  it('shows a row-level error when the download request fails, without crashing the page', async () => {
    mockDocumentsList()
    server.use(
      http.get(`${env.apiBaseUrl}/student/documents/doc-1/download`, () =>
        HttpResponse.json({ statusCode: 404, message: 'Not found' }, { status: 404 }),
      ),
    )

    const user = userEvent.setup()
    renderSection()

    const buttons = await screen.findAllByRole('button', { name: 'تحميل' })
    await user.click(buttons[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('الملف غير موجود أو تم حذفه')
    // the row recovers — button is usable again, rest of the page is intact
    expect(screen.getAllByRole('button', { name: 'تحميل' })).toHaveLength(2)
    expect(screen.getByText('slides.pdf')).toBeInTheDocument()
  })

  it('shows an empty state when no documents exist', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/student/courses/${courseId}/documents`, () =>
        HttpResponse.json([]),
      ),
    )

    renderSection()

    expect(await screen.findByText('لا توجد مواد حتى الآن')).toBeInTheDocument()
  })

  it('shows an error message when the API request fails', async () => {
    server.use(
      http.get(`${env.apiBaseUrl}/student/courses/${courseId}/documents`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'Internal error' },
          { status: 500 },
        ),
      ),
    )

    renderSection()

    expect(await screen.findByText('تعذر تحميل ملفات الدورة')).toBeInTheDocument()
  })

  it('shows a loading state initially', () => {
    // Don't override the handler — the default returns [] eventually,
    // but we check the intermediate loading text before it resolves.
    renderSection()

    expect(screen.getByText('جارٍ تحميل الملفات...')).toBeInTheDocument()
  })
})
