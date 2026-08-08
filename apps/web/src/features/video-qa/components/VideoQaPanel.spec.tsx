import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { env } from '../../../shared/lib/env'
import { server } from '../../../testing/mocks/server'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import { VideoQaPanel } from './VideoQaPanel'

const videoId = 'video-1'

function mockStatus(status: string) {
  server.use(
    http.get(`${env.apiBaseUrl}/student/videos/${videoId}/qa-status`, () =>
      HttpResponse.json({ status }),
    ),
  )
}

async function openPanel() {
  const user = userEvent.setup()
  renderWithProviders(<VideoQaPanel videoId={videoId} canSeek onSeek={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /اسأل عن هذا الفيديو/ }))
  return user
}

async function waitForQuestionInput() {
  const input = await screen.findByLabelText('سؤالك عن الفيديو')
  await waitFor(() => {
    expect(input).not.toBeDisabled()
  })
  return input
}

describe('VideoQaPanel', () => {
  it('disables the assistant with a clear message when the transcript is still processing', async () => {
    mockStatus('processing')

    await openPanel()

    expect(
      await screen.findByText('المساعد لسه بيجهز محتوى هذا الفيديو، جرب تاني بعد شوية.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('سؤالك عن الفيديو')).not.toBeInTheDocument()
  });

  it('disables the assistant when no transcript exists for the video', async () => {
    mockStatus('not_available')

    await openPanel()

    expect(
      await screen.findByText('المساعد الذكي غير متاح لهذا الفيديو.'),
    ).toBeInTheDocument();
  });

  it('sends a question and renders a clickable timestamp citation once the transcript is ready', async () => {
    mockStatus('completed');
    server.use(
      http.post(`${env.apiBaseUrl}/student/videos/${videoId}/ask`, () =>
        HttpResponse.json({
          status: 'answered',
          answer: 'حسب الفيديو، في الدقيقة الثالثة يشرح المحاضر قانون نيوتن الثالث.',
          citations: [
            {
              chunkId: 'video-chunk-1',
              startSeconds: 185,
              endSeconds: 210,
              excerpt: 'شرح قانون نيوتن الثالث بالتفصيل.',
            },
          ],
        }),
      ),
    );

    const onSeek = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<VideoQaPanel videoId={videoId} canSeek onSeek={onSeek} />);
    await user.click(screen.getByRole('button', { name: /اسأل عن هذا الفيديو/ }));

    const input = await waitForQuestionInput();
    await user.type(input, 'ايه اللي اتقال في الدقيقة الثالثة؟');
    await user.click(screen.getByRole('button', { name: 'إرسال السؤال' }));

    expect(
      await screen.findByText(/حسب الفيديو، في الدقيقة الثالثة/),
    ).toBeInTheDocument();

    const timestampButton = screen.getByRole('button', { name: /عند 3:05/ });
    await user.click(timestampButton);
    expect(onSeek).toHaveBeenCalledWith(185);
  });

  it('renders no clickable citation when the player cannot seek', async () => {
    mockStatus('completed');
    server.use(
      http.post(`${env.apiBaseUrl}/student/videos/${videoId}/ask`, () =>
        HttpResponse.json({
          status: 'answered',
          answer: 'إجابة من الفيديو.',
          citations: [
            {
              chunkId: 'video-chunk-1',
              startSeconds: 60,
              endSeconds: 75,
              excerpt: 'مقتطف من النص.',
            },
          ],
        }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<VideoQaPanel videoId={videoId} canSeek={false} />);
    await user.click(screen.getByRole('button', { name: /اسأل عن هذا الفيديو/ }));

    const input = await waitForQuestionInput();
    await user.type(input, 'سؤال');
    await user.click(screen.getByRole('button', { name: 'إرسال السؤال' }));

    expect(await screen.findByText(/إجابة من الفيديو/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /عند 1:00/ })).not.toBeInTheDocument();
    expect(screen.getByText(/عند 1:00/)).toBeInTheDocument();
  });

  it('renders no citations for the no-answer state', async () => {
    mockStatus('completed');
    server.use(
      http.post(`${env.apiBaseUrl}/student/videos/${videoId}/ask`, () =>
        HttpResponse.json({
          status: 'no_answer',
          answer: 'محتوى هذا الفيديو لا يغطي هذا السؤال.',
          citations: [],
        }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<VideoQaPanel videoId={videoId} canSeek onSeek={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /اسأل عن هذا الفيديو/ }));

    const input = await waitForQuestionInput();
    await user.type(input, 'سؤال خارج محتوى الفيديو');
    await user.click(screen.getByRole('button', { name: 'إرسال السؤال' }));

    expect(
      await screen.findByText('محتوى هذا الفيديو لا يغطي هذا السؤال.'),
    ).toBeInTheDocument();
    expect(screen.getByText('بدون مصادر')).toBeInTheDocument();
  });

  it('shows retry when the ask request fails', async () => {
    mockStatus('completed');
    server.use(
      http.post(`${env.apiBaseUrl}/student/videos/${videoId}/ask`, () =>
        HttpResponse.json({ message: 'unavailable' }, { status: 503 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<VideoQaPanel videoId={videoId} canSeek onSeek={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /اسأل عن هذا الفيديو/ }));

    const input = await waitForQuestionInput();
    await user.type(input, 'سؤال');
    await user.click(screen.getByRole('button', { name: 'إرسال السؤال' }));

    expect(await screen.findByText('تعذر إرسال السؤال')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });
});
