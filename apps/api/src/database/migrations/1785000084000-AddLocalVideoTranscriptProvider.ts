import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `local` to `video_transcript_provider` so a self-hosted/direct MP4
 * URL (anything that isn't a YouTube or Bunny Stream host — see
 * `video-ingestion.service.ts#detectCaptionProvider`) can be queued for
 * ingestion instead of being silently skipped. The worker transcribes
 * these via `WhisperCaptionsAdapter` rather than fetching a captions API.
 *
 * `ALTER TYPE ... ADD VALUE` cannot run inside the same transaction as a
 * later statement that uses the new value, but this migration only adds
 * the value — nothing here reads it — so the default transactional
 * migration runner is fine.
 */
export class AddLocalVideoTranscriptProvider1785000084000
  implements MigrationInterface
{
  name = 'AddLocalVideoTranscriptProvider1785000084000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'local'
            AND enumtypid = 'video_transcript_provider'::regtype
        ) THEN
          ALTER TYPE "video_transcript_provider" ADD VALUE 'local';
        END IF;
      END
      $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a single enum value; reverting would require
    // rebuilding the type and rewriting `video_transcripts.provider`,
    // which risks destroying data for a value that's safe to just keep.
  }
}
