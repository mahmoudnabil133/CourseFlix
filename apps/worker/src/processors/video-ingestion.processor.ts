import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { BunnyCaptionsAdapter } from '../adapters/captions/bunny-captions.adapter';
import { YoutubeCaptionsAdapter } from '../adapters/captions/youtube-captions.adapter';
import { WhisperCaptionsAdapter } from '../adapters/captions/whisper-captions.adapter';
import { CaptionProvider } from '../adapters/captions/caption-provider';
import { ChromaAdapter } from '../adapters/chroma.adapter';
import type { EmbeddingProvider } from '../adapters/embedding.adapter';
import { EMBEDDING_PROVIDER } from '../adapters/embedding.adapter';
import { chunkCaptions, VideoChunk } from '../stages/caption-chunk.stage';
import type { NotificationProducerPort } from '../common/ports/notification-producer.port';
import { NOTIFICATION_PRODUCER_PORT } from '../common/ports/notification-producer.port';

export interface VideoIngestionJobPayload {
  jobId: string;
}

interface TranscriptRecord {
  id: string;
  video_id: string;
  course_id: string;
  provider: 'bunny' | 'youtube' | 'local';
  version: number;
}

interface VideoRecord {
  id: string;
  title: string;
  video_url: string;
}

interface JobRecord {
  target_entity_type: string;
  target_entity_id: string;
}

/**
 * BullMQ worker processor for video caption ingestion:
 * Fetch captions (Bunny/YouTube) → Chunk → Embed → Chroma Upsert →
 * Persist video_chunks → Complete & Notify.
 *
 * Deliberately isolated on its own `video-ingestion` queue/processor
 * (mirrors `IngestionProcessor`'s structure closely, but does not touch
 * or share code with it) so a caption-provider failure can never affect
 * PDF ingestion.
 */
@Processor('video-ingestion')
@Injectable()
export class VideoIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoIngestionProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly bunnyCaptionsAdapter: BunnyCaptionsAdapter,
    private readonly youtubeCaptionsAdapter: YoutubeCaptionsAdapter,
    private readonly whisperCaptionsAdapter: WhisperCaptionsAdapter,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly chromaAdapter: ChromaAdapter,
    @Inject(NOTIFICATION_PRODUCER_PORT)
    private readonly notificationProducer: NotificationProducerPort,
  ) {
    super();
  }

  async process(job: Job<VideoIngestionJobPayload>): Promise<void> {
    const { jobId } = job.data;
    this.logger.log(`[${job.id}] picked up ai_jobs row ${jobId}`);

    const claimed = await this.claim(jobId);
    if (!claimed) {
      this.logger.warn(
        `[${job.id}] ai_jobs row ${jobId} already claimed or completed — skipping`,
      );
      return;
    }

    let transcriptId: string | null = null;
    let teacherId: string | null = null;
    let videoTitle: string | null = null;
    let videoId: string | null = null;

    try {
      const jobRecord = await this.getJobRecord(jobId);
      if (!jobRecord || jobRecord.target_entity_type !== 'video_transcript') {
        throw new Error(`Invalid job target entity for ai_jobs row ${jobId}`);
      }

      transcriptId = jobRecord.target_entity_id;
      const transcript = await this.getTranscriptRecord(transcriptId);
      if (!transcript) {
        throw new Error(`Video transcript not found for ID ${transcriptId}`);
      }

      const video = await this.getVideoRecord(transcript.video_id);
      if (!video) {
        throw new Error(`Video not found for ID ${transcript.video_id}`);
      }
      videoTitle = video.title;
      videoId = video.id;

      teacherId = await this.getCourseTeacherId(transcript.course_id);

      await this.markTranscriptProcessing(transcriptId);

      await this.runStages(transcript, video);

      await this.markCompleted(jobId);
      await this.markTranscriptCompleted(transcriptId);

      if (teacherId) {
        await this.notificationProducer.notify({
          userId: teacherId,
          type: 'video_ingestion_completed',
          title: 'تم تجهيز نص الفيديو',
          message: `تم استخراج محتوى فيديو "${videoTitle}" وإضافته للمساعد الذكي.`,
          relatedEntityType: 'video',
          relatedEntityId: videoId ?? undefined,
        });
      }

      this.logger.log(
        `[${job.id}] ai_jobs row ${jobId} (transcript ${transcriptId}) → completed`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[${job.id}] ai_jobs row ${jobId} → failed: ${message}`,
      );

      await this.markFailed(jobId, message);

      if (transcriptId) {
        await this.markTranscriptFailed(transcriptId, message);
        await this.deactivatePartialChunks(transcriptId);

        if (teacherId) {
          await this.notificationProducer.notify({
            userId: teacherId,
            type: 'video_ingestion_failed',
            title: 'فشل تجهيز نص الفيديو',
            message: `تعذر استخراج محتوى فيديو "${videoTitle ?? ''}": ${message}`,
            relatedEntityType: 'video',
            relatedEntityId: videoId ?? undefined,
          });
        }
      }

      throw err;
    }
  }

  private async runStages(
    transcript: TranscriptRecord,
    video: VideoRecord,
  ): Promise<void> {
    const provider: CaptionProvider =
      transcript.provider === 'bunny'
        ? this.bunnyCaptionsAdapter
        : transcript.provider === 'youtube'
          ? this.youtubeCaptionsAdapter
          : this.whisperCaptionsAdapter;

    const cues = await provider.fetchCaptions(video.video_url);

    const chunks: VideoChunk[] = chunkCaptions({
      videoTranscriptId: transcript.id,
      version: transcript.version,
      cues,
    });

    if (chunks.length === 0) {
      throw new Error('Video produced zero chunks after processing');
    }

    const texts = chunks.map((c) => c.text);
    const vectors = await this.embeddingProvider.embed(texts);
    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${chunks.length}, got ${vectors.length}`,
      );
    }

    await this.upsertVideoChunks(transcript, chunks, vectors);
    await this.persistVideoChunks(transcript.id, chunks);

    if (transcript.version > 1) {
      await this.deactivateSupersededVersions(transcript.id, transcript.version);
    }
  }

  // `video:` prefix keeps these vector IDs disjoint from
  // `document_chunks.vector_id` (`${documentId}:${version}:${chunkIndex}`)
  // so the existing tutor retrieval path — which joins Chroma hits back
  // to `document_chunks` — can never accidentally match a video chunk.
  private async upsertVideoChunks(
    transcript: TranscriptRecord,
    chunks: VideoChunk[],
    vectors: number[][],
  ): Promise<void> {
    const collection = await this.chromaAdapter.getCollection();

    const ids = chunks.map(
      (chunk) => `video:${transcript.id}:${chunk.version}:${chunk.chunkIndex}`,
    );
    const documents = chunks.map((chunk) => chunk.text);
    const metadatas = chunks.map((chunk) => ({
      courseId: transcript.course_id,
      videoTranscriptId: transcript.id,
      chunkIndex: chunk.chunkIndex,
      startSeconds: chunk.startSeconds,
      isActive: true,
    }));

    await collection.upsert({ ids, embeddings: vectors, documents, metadatas });
  }

  private async persistVideoChunks(
    videoTranscriptId: string,
    chunks: VideoChunk[],
  ): Promise<void> {
    for (const chunk of chunks) {
      const textPreview = chunk.text.slice(0, 300);
      const vectorId = `video:${videoTranscriptId}:${chunk.version}:${chunk.chunkIndex}`;

      await this.dataSource.query(
        `INSERT INTO video_chunks (
          video_transcript_id, chunk_index, text_preview, vector_id, start_seconds, end_seconds, token_count, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [
          videoTranscriptId,
          chunk.chunkIndex,
          textPreview,
          vectorId,
          chunk.startSeconds,
          chunk.endSeconds,
          chunk.tokenCount,
        ],
      );
    }
  }

  private async deactivateSupersededVersions(
    videoTranscriptId: string,
    currentVersion: number,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE video_chunks
          SET is_active = false
        WHERE video_transcript_id = $1
          AND vector_id NOT LIKE $2`,
      [videoTranscriptId, `video:${videoTranscriptId}:${currentVersion}:%`],
    );
  }

  private async deactivatePartialChunks(videoTranscriptId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE video_chunks SET is_active = false WHERE video_transcript_id = $1`,
      [videoTranscriptId],
    );
  }

  // ---------------------------------------------------------------------------
  // SQL Helpers
  // ---------------------------------------------------------------------------

  private async claim(jobId: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `UPDATE ai_jobs
          SET status = 'processing', started_at = NOW()
        WHERE id = $1
          AND status IN ('queued', 'failed')
        RETURNING id`,
      [jobId],
    )) as unknown as Array<{ id: string }>;
    return rows.length > 0;
  }

  private async getJobRecord(jobId: string): Promise<JobRecord | null> {
    const rows = (await this.dataSource.query(
      `SELECT target_entity_type, target_entity_id FROM ai_jobs WHERE id = $1`,
      [jobId],
    )) as unknown as JobRecord[];
    return rows[0] || null;
  }

  private async getTranscriptRecord(
    transcriptId: string,
  ): Promise<TranscriptRecord | null> {
    const rows = (await this.dataSource.query(
      `SELECT id, video_id, course_id, provider, version FROM video_transcripts WHERE id = $1`,
      [transcriptId],
    )) as unknown as TranscriptRecord[];
    return rows[0] || null;
  }

  private async getVideoRecord(videoId: string): Promise<VideoRecord | null> {
    const rows = (await this.dataSource.query(
      `SELECT id, title, video_url FROM videos WHERE id = $1`,
      [videoId],
    )) as unknown as VideoRecord[];
    return rows[0] || null;
  }

  private async getCourseTeacherId(courseId: string): Promise<string | null> {
    const rows = (await this.dataSource.query(
      `SELECT teacher_id FROM courses WHERE id = $1`,
      [courseId],
    )) as unknown as Array<{ teacher_id: string }>;
    return rows[0]?.teacher_id ?? null;
  }

  private async markCompleted(jobId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ai_jobs SET status = 'completed', finished_at = NOW() WHERE id = $1`,
      [jobId],
    );
  }

  private async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ai_jobs
          SET status = 'failed',
              finished_at = NOW(),
              error_message = $2,
              retries = retries + 1
        WHERE id = $1`,
      [jobId, errorMessage],
    );
  }

  private async markTranscriptProcessing(transcriptId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE video_transcripts SET processing_status = 'processing' WHERE id = $1`,
      [transcriptId],
    );
  }

  private async markTranscriptCompleted(transcriptId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE video_transcripts SET processing_status = 'completed', error_message = NULL WHERE id = $1`,
      [transcriptId],
    );
  }

  private async markTranscriptFailed(
    transcriptId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE video_transcripts SET processing_status = 'failed', error_message = $2 WHERE id = $1`,
      [transcriptId, errorMessage],
    );
  }
}
