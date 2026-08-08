import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { AiJobEntity } from './entities/ai_jobs.entity';
import { DocumentChunkEntity } from './entities/document-chunk.entity';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let jobsService: JobsService;
  let queryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };
  let aiJobsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    increment: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let ingestionQueue: { add: jest.Mock; getJob: jest.Mock };
  let videoIngestionQueue: { add: jest.Mock; getJob: jest.Mock };
  let examGenerationQueue: { add: jest.Mock; getJob: jest.Mock };

  const documentId = 'document-1';

  beforeEach(async () => {
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    aiJobsRepository = {
      create: jest.fn((data: Record<string, unknown>) => data),
      save: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    ingestionQueue = { add: jest.fn(), getJob: jest.fn() };
    videoIngestionQueue = { add: jest.fn(), getJob: jest.fn() };
    examGenerationQueue = { add: jest.fn(), getJob: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getRepositoryToken(AiJobEntity),
          useValue: aiJobsRepository,
        },
        {
          provide: getRepositoryToken(DocumentChunkEntity),
          useValue: {},
        },
        { provide: getQueueToken('ingestion'), useValue: ingestionQueue },
        {
          provide: getQueueToken('video-ingestion'),
          useValue: videoIngestionQueue,
        },
        {
          provide: getQueueToken('exam-generation'),
          useValue: examGenerationQueue,
        },
      ],
    }).compile();

    jobsService = moduleRef.get(JobsService);
  });

  it('is defined', () => {
    expect(jobsService).toBeDefined();
  });

  describe('enqueueDocumentIngestion', () => {
    it('creates a new ai_jobs row and a deterministic BullMQ job when none exists', async () => {
      ingestionQueue.getJob.mockResolvedValue(undefined);
      aiJobsRepository.save.mockResolvedValue({ id: 'ai-job-1' });

      const bullJobId = await jobsService.enqueueDocumentIngestion(
        documentId,
        1,
      );

      expect(bullJobId).toBe(`ingest:${documentId}:v1`);
      expect(ingestionQueue.getJob).toHaveBeenCalledWith(bullJobId);
      expect(aiJobsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'ingestion',
          targetEntityType: 'document',
          targetEntityId: documentId,
        }),
      );
      expect(ingestionQueue.add).toHaveBeenCalledWith(
        'ingestion',
        { jobId: 'ai-job-1' },
        expect.objectContaining({ jobId: bullJobId, attempts: 3 }),
      );
    });

    it('does not duplicate a job that is still active', async () => {
      ingestionQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('active'),
      });

      await jobsService.enqueueDocumentIngestion(documentId, 1);

      expect(aiJobsRepository.save).not.toHaveBeenCalled();
      expect(ingestionQueue.add).not.toHaveBeenCalled();
    });

    it('renews the same ai_jobs row and retries the same BullMQ job when the previous attempt failed', async () => {
      const retry = jest.fn().mockResolvedValue(undefined);
      ingestionQueue.getJob.mockResolvedValue({
        data: { jobId: 'ai-job-1' },
        getState: jest.fn().mockResolvedValue('failed'),
        retry,
      });

      const bullJobId = await jobsService.enqueueDocumentIngestion(
        documentId,
        1,
      );

      expect(bullJobId).toBe(`ingest:${documentId}:v1`);
      expect(aiJobsRepository.update).toHaveBeenCalledWith(
        'ai-job-1',
        expect.objectContaining({ status: 'queued', errorMessage: null }),
      );
      expect(retry).toHaveBeenCalledWith('failed');
      // No second row, no second BullMQ job.
      expect(aiJobsRepository.save).not.toHaveBeenCalled();
      expect(ingestionQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('enqueueVideoIngestion', () => {
    it('creates a new ai_jobs row and a deterministic BullMQ job when none exists', async () => {
      videoIngestionQueue.getJob.mockResolvedValue(undefined);
      aiJobsRepository.save.mockResolvedValue({ id: 'ai-job-2' });

      const bullJobId = await jobsService.enqueueVideoIngestion(
        'transcript-1',
        1,
      );

      expect(bullJobId).toBe('video-ingest:transcript-1:v1');
      expect(aiJobsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'video_ingestion',
          targetEntityType: 'video_transcript',
          targetEntityId: 'transcript-1',
        }),
      );
      expect(videoIngestionQueue.add).toHaveBeenCalledWith(
        'video-ingestion',
        { jobId: 'ai-job-2' },
        expect.objectContaining({ jobId: bullJobId, attempts: 3 }),
      );
    });

    it('does not duplicate a job that is still active', async () => {
      videoIngestionQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('active'),
      });

      await jobsService.enqueueVideoIngestion('transcript-1', 1);

      expect(aiJobsRepository.save).not.toHaveBeenCalled();
      expect(videoIngestionQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('enqueueExamGeneration', () => {
    it('creates a new ai_jobs row per attempt and enqueues it', async () => {
      aiJobsRepository.save.mockResolvedValue({ id: 'ai-job-3' });

      const bullJobId = await jobsService.enqueueExamGeneration('request-1');

      expect(bullJobId).toBe('exam-generation:request-1:ai-job-3');
      expect(aiJobsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'exam_generation',
          targetEntityType: 'quiz_generation_request',
          targetEntityId: 'request-1',
        }),
      );
      expect(examGenerationQueue.add).toHaveBeenCalledWith(
        'exam-generation',
        { jobId: 'ai-job-3' },
        expect.objectContaining({ jobId: bullJobId }),
      );
    });
  });

  describe('claim', () => {
    it('returns true when it wins the atomic claim', async () => {
      queryBuilder.execute.mockResolvedValue({ affected: 1 });

      await expect(jobsService.claim('ai-job-1')).resolves.toBe(true);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'status != :completed',
        { completed: 'completed' },
      );
    });

    it('returns false when the row was already completed (or missing)', async () => {
      queryBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(jobsService.claim('ai-job-1')).resolves.toBe(false);
    });
  });

  describe('status transitions', () => {
    it('markCompleted sets status and finishedAt', async () => {
      await jobsService.markCompleted('ai-job-1');

      expect(aiJobsRepository.update).toHaveBeenCalledWith(
        'ai-job-1',
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('markFailed persists the error message', async () => {
      await jobsService.markFailed('ai-job-1', 'boom');

      expect(aiJobsRepository.update).toHaveBeenCalledWith(
        'ai-job-1',
        expect.objectContaining({ status: 'failed', errorMessage: 'boom' }),
      );
    });

    it('incrementRetry bumps the retries counter', async () => {
      await jobsService.incrementRetry('ai-job-1');

      expect(aiJobsRepository.increment).toHaveBeenCalledWith(
        { id: 'ai-job-1' },
        'retries',
        1,
      );
    });
  });
});
