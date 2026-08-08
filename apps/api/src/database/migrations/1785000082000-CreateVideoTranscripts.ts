import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mirrors `documents`/`document_chunks` for video content: a video's
 * captions (fetched from its hosting provider — Bunny Stream or
 * YouTube) are extracted, chunked, embedded, and upserted into the same
 * ChromaDB collection as PDF chunks, isolated by a `video:` vector-id
 * prefix so they never collide with `document_chunks.vector_id` lookups
 * in the existing tutor retrieval path.
 *
 * Reuses `processing_status_type` (created by
 * `1785000030000-CreateFilesAndDocuments.ts`) instead of a new enum.
 *
 * Defensive (IF NOT EXISTS / DO-block) rather than a plain CREATE — see
 * `1785000081000-CreateQuizGenerationRequests.ts`'s docblock for why:
 * `synchronize: true` may have already created this type/these tables
 * from the entities before migrations ran.
 */
export class CreateVideoTranscripts1785000082000 implements MigrationInterface {
  name = 'CreateVideoTranscripts1785000082000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'video_transcript_provider') THEN
          CREATE TYPE "video_transcript_provider" AS ENUM ('bunny', 'youtube');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "video_transcripts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "video_id" UUID NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
        "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
        "section_id" UUID,
        "lesson_id" UUID,
        "provider" video_transcript_provider NOT NULL,
        "processing_status" processing_status_type NOT NULL DEFAULT 'pending',
        "error_message" TEXT,
        "version" INTEGER NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_video_transcripts_video_id" ON "video_transcripts" ("video_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_video_transcripts_course_id" ON "video_transcripts" ("course_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_video_transcripts_lesson_id" ON "video_transcripts" ("lesson_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_video_transcripts_section_id" ON "video_transcripts" ("section_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "video_chunks" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "video_transcript_id" UUID NOT NULL REFERENCES "video_transcripts"("id") ON DELETE CASCADE,
        "chunk_index" INTEGER NOT NULL,
        "text_preview" TEXT,
        "vector_id" TEXT NOT NULL UNIQUE,
        "start_seconds" INTEGER,
        "end_seconds" INTEGER,
        "token_count" INTEGER,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "deleted_at" TIMESTAMPTZ
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_video_chunks_transcript_id" ON "video_chunks" ("video_transcript_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_video_chunks_vector_id" ON "video_chunks" ("vector_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "video_chunks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "video_transcripts";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "video_transcript_provider";`);
  }
}
