import { config } from 'dotenv';
import { resolve } from 'path';

// The single .env file lives at the repo root, not inside apps/api — same
// issue data-source.ts already works around. `npm run ... --prefix
// apps/api` runs this with cwd set to apps/api, so AppModule's
// ConfigModule.forRoot({ isGlobal: true }) (which defaults to a
// cwd-relative `.env` lookup) would otherwise silently find nothing,
// leaving DATABASE_URL/REDIS_HOST etc. undefined and TypeORM/BullMQ
// falling back to bogus defaults. This has to run before importing
// AppModule, since Nest reads process.env at module-evaluation time.
config({ path: resolve(process.cwd(), '../../.env') });

import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { VideoEntity } from '../modules/lessons/entities/video.entity';
import { VideoTranscriptEntity } from '../modules/video-ingestion/entities/video-transcript.entity';
import { VideoIngestionService } from '../modules/video-ingestion/video-ingestion.service';
import { VIDEO_SOURCES } from './seeds/video.seed';

const SEED_VIDEO_URLS = new Set(VIDEO_SOURCES.map((source) => source.url));

interface BackfillOptions {
  // Before seedVideoTranscripts was scoped to only the known MDN seed
  // URLs (see that file), every `./dev.sh` restart clobbered real videos'
  // transcripts with fake `completed` demo data — a real ingestion result
  // never got the chance to land, or got silently overwritten if it had.
  // This forces any non-seed video back through the real pipeline
  // regardless of its current (possibly fake) status, to undo that damage
  // without a raw DB write. One-time cleanup; safe to run again — it's a
  // no-op once every real video has a genuine transcript.
  forceNonSeedVideos?: boolean;
}

// Ingestion only ever fires from CoursesService.syncLessonVideo, on create
// or URL change of a lesson's video (see video-ingestion.service.ts) — it
// is not retroactive. Any video saved before that wiring existed (or
// before the video-qa feature existed at all) has no `video_transcripts`
// row, which is what makes the student-facing panel show "not available"
// forever. This backfills those, plus any row stuck on `failed` (e.g. a
// transient captions-API error) — `pending`/`processing`/`completed` rows
// are left alone so this doesn't waste OpenAI/Bunny calls re-queuing work
// that's already in flight or done.
export async function backfillVideoTranscripts(
  options: BackfillOptions = {},
): Promise<{ enqueued: number; skipped: number }> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const videosRepository = app.get<Repository<VideoEntity>>(
      getRepositoryToken(VideoEntity),
    );
    const transcriptsRepository = app.get<Repository<VideoTranscriptEntity>>(
      getRepositoryToken(VideoTranscriptEntity),
    );
    const videoIngestionService = app.get(VideoIngestionService);

    // Sequential, not Promise.all — TypeORM's default pool can hand both
    // calls the same client, and running two queries at once on one
    // client is deprecated in pg.
    const videos = await videosRepository.find();
    const transcripts = await transcriptsRepository.find();
    const transcriptByVideoId = new Map(
      transcripts.map((transcript) => [transcript.videoId, transcript]),
    );

    let enqueued = 0;
    let skipped = 0;

    for (const video of videos) {
      const transcript = transcriptByVideoId.get(video.id);
      const isForcedRealVideo =
        Boolean(options.forceNonSeedVideos) &&
        !SEED_VIDEO_URLS.has(video.videoUrl);
      const needsIngestion =
        isForcedRealVideo ||
        !transcript ||
        transcript.processingStatus === 'failed';

      if (!needsIngestion) {
        skipped += 1;
        continue;
      }

      await videoIngestionService.enqueueForVideo(video);
      enqueued += 1;
      console.log(
        `Enqueued transcript ingestion for video ${video.id} (${video.videoUrl}).`,
      );
    }

    console.log(
      `Backfill complete: ${enqueued} enqueued, ${skipped} already up to date.`,
    );
    return { enqueued, skipped };
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  const forceNonSeedVideos = process.argv.includes('--force-real');
  backfillVideoTranscripts({ forceNonSeedVideos })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Video transcript backfill failed:', err);
      process.exit(1);
    });
}
