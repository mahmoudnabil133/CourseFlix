import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { AiJobEntity } from './entities/ai_jobs.entity';
import { DocumentChunkEntity } from './entities/document-chunk.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(AiJobEntity)
    private readonly aiJobsRepository: Repository<AiJobEntity>,

    @InjectRepository(DocumentChunkEntity)
    private readonly documentChunksRepository: Repository<DocumentChunkEntity>,

    @InjectQueue('ingestion')
    private readonly ingestionQueue: Queue,

    @InjectQueue('video-ingestion')
    private readonly videoIngestionQueue: Queue,

    @InjectQueue('exam-generation')
    private readonly examGenerationQueue: Queue,
  ) {}

  /**
   * Generic ai_jobs creator for any job type. Dispatches into BullMQ
   * without a deterministic job ID — fine for job types that don't need
   * the document-version idempotency rule below.
   */
  async createJob(
    jobType: string,
    targetEntityType: string,
    targetEntityId: string,
  ): Promise<AiJobEntity> {
    const job = this.aiJobsRepository.create({
      jobType,
      targetEntityType,
      targetEntityId,
    });

    const savedJob = await this.aiJobsRepository.save(job);

    await this.ingestionQueue.add('ingestion', {
      jobId: savedJob.id,
    });

    return savedJob;
  }

  /**
   * Real implementation backing JobQueuePort.enqueueDocumentIngestion
   * (see apps/api/src/common/ports/job-queue.port.ts and
   * sprint2-plan.md E-2's idempotency rule).
   *
   * The BullMQ job ID is deterministic — `ingest:${documentId}:v${version}`
   * — so re-enqueueing the same document version never creates a second
   * job: an in-flight or completed job is left alone, and a *failed*
   * job is renewed in place (same ai_jobs row, same BullMQ job, retried)
   * rather than duplicated. Only a version with no existing job at all
   * creates a fresh ai_jobs row.
   */
  async enqueueDocumentIngestion(
    documentId: string,
    version: number,
  ): Promise<string> {
    const bullJobId = `ingest:${documentId}:v${version}`;
    const existingJob = await this.ingestionQueue.getJob(bullJobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === 'failed') {
        // Renewed attempt: reset the *same* ai_jobs row and
        // re-queue the *same* BullMQ job. This is the "retry a
        // failed document" path — it must never create a second
        // row for the same document version.
        const jobData = existingJob.data as { jobId: string };
        await this.aiJobsRepository.update(jobData.jobId, {
          status: 'queued',
          startedAt: null,
          finishedAt: null,
          errorMessage: null,
        });
        await existingJob.retry('failed');
        return bullJobId;
      }

      // waiting/active/delayed: already in flight — don't duplicate.
      // completed: already done — re-enqueueing the same version is
      // a no-op by design.
      return bullJobId;
    }

    const savedJob = await this.aiJobsRepository.save(
      this.aiJobsRepository.create({
        jobType: 'ingestion',
        targetEntityType: 'document',
        targetEntityId: documentId,
      }),
    );

    await this.ingestionQueue.add(
      'ingestion',
      { jobId: savedJob.id },
      {
        jobId: bullJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );

    return bullJobId;
  }

  /**
   * Same idempotency shape as {@link enqueueDocumentIngestion} — one
   * video never gets two in-flight caption-ingestion jobs — but on its
   * own queue so a stuck video job can never block PDF ingestion.
   */
  async enqueueVideoIngestion(
    videoTranscriptId: string,
    version: number,
  ): Promise<string> {
    // `version` lives in the job ID (not just `videoTranscriptId`) so a
    // teacher re-pointing a lesson at a new video URL — which bumps the
    // same transcript row's version — always gets a fresh job instead of
    // being treated as a no-op because the old version already completed.
    const bullJobId = `video-ingest:${videoTranscriptId}:v${version}`;
    const existingJob = await this.videoIngestionQueue.getJob(bullJobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === 'failed') {
        const jobData = existingJob.data as { jobId: string };
        await this.aiJobsRepository.update(jobData.jobId, {
          status: 'queued',
          startedAt: null,
          finishedAt: null,
          errorMessage: null,
        });
        await existingJob.retry('failed');
        return bullJobId;
      }

      return bullJobId;
    }

    const savedJob = await this.aiJobsRepository.save(
      this.aiJobsRepository.create({
        jobType: 'video_ingestion',
        targetEntityType: 'video_transcript',
        targetEntityId: videoTranscriptId,
      }),
    );

    await this.videoIngestionQueue.add(
      'video-ingestion',
      { jobId: savedJob.id },
      {
        jobId: bullJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );

    return bullJobId;
  }

  /**
   * Each call is a distinct attempt (first generation or a
   * regenerate-with-feedback retry), so unlike the two enqueue methods
   * above there is no bullJobId idempotency key to dedupe against —
   * `ExamGenerationService` is the one deciding when a new attempt is
   * allowed (only from `pending_review`/`failed`).
   */
  async enqueueExamGeneration(requestId: string): Promise<string> {
    const savedJob = await this.aiJobsRepository.save(
      this.aiJobsRepository.create({
        jobType: 'exam_generation',
        targetEntityType: 'quiz_generation_request',
        targetEntityId: requestId,
      }),
    );

    const bullJobId = `exam-generation:${requestId}:${savedJob.id}`;
    await this.examGenerationQueue.add(
      'exam-generation',
      { jobId: savedJob.id },
      {
        jobId: bullJobId,
        attempts: 1,
      },
    );

    return bullJobId;
  }

  private async updateJob(
    jobId: string,
    data: Partial<AiJobEntity>,
  ): Promise<void> {
    await this.aiJobsRepository.update(jobId, data);
  }

  /**
   * Atomically transitions a job from 'queued' to 'processing'.
   * Uses a conditional UPDATE (WHERE status = 'queued') instead of a
   * plain SELECT-then-UPDATE, so two workers racing to pick up the same
   * job can never both "win" the claim.
   *
   * Returns true if this call performed the transition, false if the
   * job was already claimed (or doesn't exist) — callers should treat
   * `false` as "skip, someone else has it" rather than an error.
   */
  async claim(jobId: string): Promise<boolean> {
    const result = await this.aiJobsRepository
      .createQueryBuilder()
      .update(AiJobEntity)
      .set({ status: 'processing', startedAt: new Date() })
      .where('id = :jobId', { jobId })
      .andWhere('status != :completed', { completed: 'completed' })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async markProcessing(jobId: string): Promise<void> {
    await this.updateJob(jobId, {
      status: 'processing',
      startedAt: new Date(),
    });
  }

  async markCompleted(jobId: string): Promise<void> {
    await this.updateJob(jobId, {
      status: 'completed',
      finishedAt: new Date(),
    });
  }

  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.updateJob(jobId, {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage,
    });
  }

  /** Bumps the retry counter — called before re-dispatching a failed job. */
  async incrementRetry(jobId: string): Promise<void> {
    await this.aiJobsRepository.increment({ id: jobId }, 'retries', 1);
  }
}
