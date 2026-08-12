import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobsService } from '../jobs/jobs.service';
import { VideoEntity } from '../lessons/entities/video.entity';
import {
  VideoTranscriptEntity,
  VideoTranscriptProvider,
} from './entities/video-transcript.entity';

/**
 * YouTube and Bunny Stream have a captions API we can call directly; any
 * other http(s) host — a self-hosted or otherwise directly-linked MP4 —
 * has no captions to fetch, so it's routed to `local`, which the worker
 * transcribes via Whisper instead. Only an unparseable URL is skipped.
 */
function detectCaptionProvider(
  videoUrl: string,
): VideoTranscriptProvider | null {
  let hostname: string;
  try {
    hostname = new URL(videoUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }

  if (['youtube.com', 'youtu.be', 'm.youtube.com'].includes(hostname)) {
    return 'youtube';
  }
  if (
    ['iframe.mediadelivery.net', 'player.mediadelivery.net'].includes(hostname)
  ) {
    return 'bunny';
  }
  return 'local';
}

@Injectable()
export class VideoIngestionService {
  private readonly logger = new Logger(VideoIngestionService.name);

  constructor(
    @InjectRepository(VideoTranscriptEntity)
    private readonly transcriptsRepository: Repository<VideoTranscriptEntity>,
    private readonly jobsService: JobsService,
  ) {}

  /**
   * Called by `CoursesService` right after a lesson's video row is
   * created or its URL changes. Fire-and-forget by design (same as
   * ingestion elsewhere) — a caption-fetch failure must never block
   * saving the lesson itself; the worker records the failure on the
   * transcript row instead.
   */
  async enqueueForVideo(video: VideoEntity): Promise<void> {
    const provider = detectCaptionProvider(video.videoUrl);
    if (!provider) {
      this.logger.log(
        `No caption provider for video ${video.id} (${video.videoUrl}); skipping ingestion.`,
      );
      return;
    }

    const existing = await this.transcriptsRepository.findOne({
      where: { videoId: video.id },
    });

    const transcript = existing
      ? await this.transcriptsRepository.save({
          ...existing,
          courseId: video.courseId,
          sectionId: video.sectionId,
          lessonId: video.lessonId,
          provider,
          processingStatus: 'pending' as const,
          errorMessage: null,
          version: existing.version + 1,
        })
      : await this.transcriptsRepository.save(
          this.transcriptsRepository.create({
            videoId: video.id,
            courseId: video.courseId,
            sectionId: video.sectionId,
            lessonId: video.lessonId,
            provider,
            processingStatus: 'pending',
            version: 1,
          }),
        );

    await this.jobsService.enqueueVideoIngestion(
      transcript.id,
      transcript.version,
    );
  }
}
