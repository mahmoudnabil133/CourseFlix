import { VideoQaController } from './video-qa.controller';
import { VideoQaService } from './video-qa.service';

describe('VideoQaController', () => {
  let controller: VideoQaController;
  let videoQaService: jest.Mocked<Pick<VideoQaService, 'getStatus' | 'ask'>>;

  const user = {
    id: 'student-1',
    email: 'student@example.com',
    fullName: 'Student',
    role: 'student' as const,
    avatarUrl: null,
  };

  beforeEach(() => {
    videoQaService = {
      getStatus: jest.fn().mockResolvedValue({ status: 'completed' }),
      ask: jest.fn(),
    };
    controller = new VideoQaController(videoQaService as VideoQaService);
  });

  it('reads the video Q&A readiness status for the current student', async () => {
    await expect(controller.getStatus('video-1', user)).resolves.toEqual({
      status: 'completed',
    });
    expect(videoQaService.getStatus).toHaveBeenCalledWith({
      videoId: 'video-1',
      studentId: 'student-1',
    });
  });

  it('forwards the question to the service, scoped to the video and student', async () => {
    videoQaService.ask.mockResolvedValueOnce({
      status: 'answered',
      answer: 'الإجابة من الفيديو.',
      citations: [],
    });

    await expect(
      controller.ask('video-1', user, { question: 'اشرح الدرس' }),
    ).resolves.toEqual({
      status: 'answered',
      answer: 'الإجابة من الفيديو.',
      citations: [],
    });
    expect(videoQaService.ask).toHaveBeenCalledWith({
      videoId: 'video-1',
      studentId: 'student-1',
      question: 'اشرح الدرس',
    });
  });
});
