/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import {
  RETRIEVAL_PORT,
  RetrievalPort,
  RetrievedVideoChunk,
} from '../../common/ports/retrieval.port';
import { LLM_PROVIDER, LlmProvider } from '../tutor/adapters/llm.adapter';
import { AnswerPolicyService } from '../tutor/prompt/answer-policy.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { VideoEntity } from '../lessons/entities/video.entity';
import { VideoTranscriptEntity } from '../video-ingestion/entities/video-transcript.entity';
import { VideoQaService } from './video-qa.service';

describe('VideoQaService', () => {
  let service: VideoQaService;
  let enrollmentsService: jest.Mocked<
    Pick<EnrollmentsService, 'assertStudentEnrolled'>
  >;
  let retrievalPort: jest.Mocked<RetrievalPort>;
  let llmProvider: jest.Mocked<LlmProvider>;
  let videosRepository: jest.Mocked<Pick<Repository<VideoEntity>, 'findOne'>>;
  let transcriptsRepository: jest.Mocked<
    Pick<Repository<VideoTranscriptEntity>, 'findOne'>
  >;

  const video = {
    id: 'video-1',
    courseId: 'course-1',
  } as VideoEntity;

  const completedTranscript = {
    id: 'transcript-1',
    videoId: 'video-1',
    courseId: 'course-1',
    processingStatus: 'completed',
  } as VideoTranscriptEntity;

  const relevantChunk: RetrievedVideoChunk = {
    chunkId: 'video-chunk-1',
    vectorId: 'video:transcript-1:1:0',
    videoTranscriptId: 'transcript-1',
    startSeconds: 225,
    endSeconds: 240,
    excerpt: 'في الدقيقة الرابعة يشرح المحاضر قانون نيوتن الثالث.',
    score: 0.1,
  };

  beforeEach(async () => {
    enrollmentsService = {
      assertStudentEnrolled: jest
        .fn()
        .mockResolvedValue({ id: 'enrollment-1' }),
    };
    retrievalPort = {
      search: jest.fn(),
      searchVideo: jest.fn().mockResolvedValue([relevantChunk]),
    };
    llmProvider = {
      generateAnswer: jest.fn().mockResolvedValue({
        answer: 'حسب الفيديو، قانون نيوتن الثالث ينص على أن لكل فعل رد فعل.',
        citedChunkIds: ['video-chunk-1'],
        modelName: 'mock-model',
        provider: 'mock',
        tokensUsed: 12,
      }),
    };
    videosRepository = {
      findOne: jest.fn().mockResolvedValue(video),
    };
    transcriptsRepository = {
      findOne: jest.fn().mockResolvedValue(completedTranscript),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VideoQaService,
        {
          provide: EnrollmentsService,
          useValue: enrollmentsService,
        },
        {
          provide: AnswerPolicyService,
          useValue: {
            getRelevantChunks: (chunks: RetrievedVideoChunk[]) =>
              chunks.filter((chunk) => chunk.score <= 1.35),
          },
        },
        {
          provide: RETRIEVAL_PORT,
          useValue: retrievalPort,
        },
        {
          provide: LLM_PROVIDER,
          useValue: llmProvider,
        },
        {
          provide: getRepositoryToken(VideoEntity),
          useValue: videosRepository,
        },
        {
          provide: getRepositoryToken(VideoTranscriptEntity),
          useValue: transcriptsRepository,
        },
      ],
    }).compile();

    service = moduleRef.get(VideoQaService);
  });

  it('rejects empty questions', async () => {
    await expect(
      service.ask({ videoId: 'video-1', studentId: 'student-1', question: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws not found when the video does not exist', async () => {
    videosRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.ask({
        videoId: 'missing-video',
        studentId: 'student-1',
        question: 'ما هو قانون نيوتن الثالث؟',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects students who are not enrolled in the video course', async () => {
    enrollmentsService.assertStudentEnrolled.mockRejectedValueOnce(
      new ForbiddenException('not enrolled'),
    );

    await expect(
      service.ask({
        videoId: 'video-1',
        studentId: 'student-1',
        question: 'ما هو قانون نيوتن الثالث؟',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(retrievalPort.searchVideo).not.toHaveBeenCalled();
  });

  it.each(['pending', 'processing', 'failed'] as const)(
    'returns not_ready without searching when transcript status is %s',
    async (status) => {
      transcriptsRepository.findOne.mockResolvedValueOnce({
        ...completedTranscript,
        processingStatus: status,
      });

      const result = await service.ask({
        videoId: 'video-1',
        studentId: 'student-1',
        question: 'ما هو قانون نيوتن الثالث؟',
      });

      expect(result.status).toBe('not_ready');
      expect(result.citations).toEqual([]);
      expect(retrievalPort.searchVideo).not.toHaveBeenCalled();
      expect(llmProvider.generateAnswer).not.toHaveBeenCalled();
    },
  );

  it('returns not_ready when no transcript row exists for the video', async () => {
    transcriptsRepository.findOne.mockResolvedValueOnce(null);

    const result = await service.ask({
      videoId: 'video-1',
      studentId: 'student-1',
      question: 'ما هو قانون نيوتن الثالث؟',
    });

    expect(result.status).toBe('not_ready');
    expect(retrievalPort.searchVideo).not.toHaveBeenCalled();
  });

  it('returns no_answer without calling the provider when zero chunks are retrieved', async () => {
    retrievalPort.searchVideo.mockResolvedValueOnce([]);

    const result = await service.ask({
      videoId: 'video-1',
      studentId: 'student-1',
      question: 'سؤال خارج محتوى الفيديو',
    });

    expect(result.status).toBe('no_answer');
    expect(result.citations).toEqual([]);
    expect(llmProvider.generateAnswer).not.toHaveBeenCalled();
  });

  it('returns no_answer without calling the provider when relevance is too low', async () => {
    retrievalPort.searchVideo.mockResolvedValueOnce([
      { ...relevantChunk, score: 5 },
    ]);

    const result = await service.ask({
      videoId: 'video-1',
      studentId: 'student-1',
      question: 'سؤال خارج محتوى الفيديو',
    });

    expect(result.status).toBe('no_answer');
    expect(llmProvider.generateAnswer).not.toHaveBeenCalled();
  });

  it('returns a grounded answer with timestamped citations on the happy path', async () => {
    const result = await service.ask({
      videoId: 'video-1',
      studentId: 'student-1',
      question: 'ما هو قانون نيوتن الثالث؟',
    });

    expect(result).toEqual({
      status: 'answered',
      answer: 'حسب الفيديو، قانون نيوتن الثالث ينص على أن لكل فعل رد فعل.',
      citations: [
        {
          chunkId: 'video-chunk-1',
          startSeconds: 225,
          endSeconds: 240,
          excerpt: relevantChunk.excerpt,
        },
      ],
    });
    expect(retrievalPort.searchVideo).toHaveBeenCalledWith({
      videoTranscriptId: 'transcript-1',
      query: 'ما هو قانون نيوتن الثالث؟',
      topK: 5,
    });
  });

  it('downgrades invented citations to no_answer', async () => {
    llmProvider.generateAnswer.mockResolvedValueOnce({
      answer: 'إجابة بلا مصدر حقيقي.',
      citedChunkIds: ['invented-chunk'],
      modelName: 'mock-model',
      provider: 'mock',
      tokensUsed: 12,
    });

    const result = await service.ask({
      videoId: 'video-1',
      studentId: 'student-1',
      question: 'ما هو قانون نيوتن الثالث؟',
    });

    expect(result.status).toBe('no_answer');
    expect(result.citations).toEqual([]);
  });

  it('returns safe 503 when the provider fails', async () => {
    llmProvider.generateAnswer.mockRejectedValueOnce(new Error('raw failure'));

    await expect(
      service.ask({
        videoId: 'video-1',
        studentId: 'student-1',
        question: 'ما هو قانون نيوتن الثالث؟',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  describe('getStatus', () => {
    it('checks enrollment before revealing transcript status', async () => {
      enrollmentsService.assertStudentEnrolled.mockRejectedValueOnce(
        new ForbiddenException('not enrolled'),
      );

      await expect(
        service.getStatus({ videoId: 'video-1', studentId: 'student-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transcriptsRepository.findOne).not.toHaveBeenCalled();
    });

    it('returns not_available when no transcript row exists', async () => {
      transcriptsRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.getStatus({
        videoId: 'video-1',
        studentId: 'student-1',
      });

      expect(result).toEqual({ status: 'not_available' });
    });

    it('returns the transcript processing status when it exists', async () => {
      const result = await service.getStatus({
        videoId: 'video-1',
        studentId: 'student-1',
      });

      expect(result).toEqual({ status: 'completed' });
    });
  });
});
