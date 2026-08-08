import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The async "teacher asks the AI for an exam" workflow. One row per
 * request; `quiz_id` is null until the worker produces a draft, then
 * stays the same row across regenerate-with-feedback attempts (the
 * draft's questions are replaced in place, not re-created under a new
 * quiz). `quiz_generation_feedback` is the append-only thread of teacher
 * messages that drive each regeneration attempt.
 *
 * Defensive (IF NOT EXISTS / DO-block) rather than a plain CREATE, same
 * as `1785000063000-CreateInterventionMiniQuizzes.ts` and
 * `1785000080000-AddAiExamFieldsToQuizzes.ts` — the app runs with
 * `synchronize: true` (see `app.module.ts`), so these types/tables may
 * already exist from a dev run that started the API before migrations
 * ran here. A plain `CREATE TYPE`/`CREATE TABLE` would fail with
 * "already exists" in that case (confirmed against a real dev DB).
 */
export class CreateQuizGenerationRequests1785000081000 implements MigrationInterface {
  name = 'CreateQuizGenerationRequests1785000081000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_generation_scope_type') THEN
          CREATE TYPE "quiz_generation_scope_type" AS ENUM ('lesson', 'section', 'course');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_generation_request_status') THEN
          CREATE TYPE "quiz_generation_request_status" AS ENUM (
            'queued', 'processing', 'pending_review', 'accepted', 'rejected', 'failed'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quiz_generation_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
        "scope_type" quiz_generation_scope_type NOT NULL,
        "scope_id" UUID NOT NULL,
        "teacher_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "quiz_id" UUID REFERENCES "quizzes"("id") ON DELETE SET NULL,
        "status" quiz_generation_request_status NOT NULL DEFAULT 'queued',
        "difficulty" TEXT NOT NULL,
        "question_spec" JSONB NOT NULL,
        "due_at" TIMESTAMPTZ NOT NULL,
        "attempt_number" INTEGER NOT NULL DEFAULT 1,
        "error_message" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_quiz_gen_requests_course_id" ON "quiz_generation_requests" ("course_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_quiz_gen_requests_teacher_id" ON "quiz_generation_requests" ("teacher_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_quiz_gen_requests_quiz_id" ON "quiz_generation_requests" ("quiz_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quiz_generation_feedback" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" UUID NOT NULL REFERENCES "quiz_generation_requests"("id") ON DELETE CASCADE,
        "message" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_quiz_gen_feedback_request_id" ON "quiz_generation_feedback" ("request_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "quiz_generation_feedback";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quiz_generation_requests";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quiz_generation_request_status";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quiz_generation_scope_type";`);
  }
}
