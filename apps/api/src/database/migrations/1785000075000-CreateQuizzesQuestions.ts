import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `quizzes` and `questions` tables plus their shared enum
 * types. Neither table had its own creation migration — they were only
 * ever created by the runtime's `synchronize: true` when the API booted.
 * That breaks a fresh DB (migrations run before the API in `dev.sh`),
 * because `1785000080000-AddAiExamFieldsToQuizzes.ts` ALTERs both tables
 * before they exist (Postgres 42P01 undefined_table).
 *
 * The column set mirrors `QuizEntity`/`QuestionEntity` exactly, including
 * the review-workflow columns (`status`, `due_at`, `difficulty`) so the
 * later additive-ALTER migration becomes a no-op on a fresh DB while
 * still upgrading pre-existing synced schemas.
 *
 * Defensive (DO-block / IF NOT EXISTS) like the other synchronize-aware
 * migrations — on a DB where the API already ran, the types/tables may
 * already exist and a plain CREATE would fail.
 */
export class CreateQuizzesQuestions1785000075000 implements MigrationInterface {
  name = 'CreateQuizzesQuestions1785000075000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_generation_type') THEN
          CREATE TYPE "quiz_generation_type" AS ENUM ('manual', 'rag_generated');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_status') THEN
          CREATE TYPE "quiz_status" AS ENUM ('draft', 'pending_review', 'published', 'rejected');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type') THEN
          CREATE TYPE "question_type" AS ENUM ('mcq', 'true_false');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quizzes" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "course_id"       uuid NOT NULL,
        "section_id"      uuid,
        "lesson_id"       uuid,
        "created_by"      uuid,
        "generation_type" quiz_generation_type NOT NULL DEFAULT 'manual',
        "title"           text NOT NULL,
        "status"          quiz_status NOT NULL DEFAULT 'published',
        "due_at"          timestamptz,
        "version"         integer NOT NULL DEFAULT 1,
        "deleted_at"      timestamptz,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_quizzes_course_id" ON "quizzes" ("course_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_quizzes_lesson_id" ON "quizzes" ("lesson_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "questions" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "course_id"      uuid NOT NULL,
        "type"           question_type NOT NULL,
        "text"           text NOT NULL,
        "options"        text[],
        "correct_answer" text NOT NULL,
        "difficulty"     text,
        "deleted_at"     timestamptz,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_questions_course_id" ON "questions" ("course_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_questions_course_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questions";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quizzes_lesson_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quizzes_course_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quizzes";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "question_type";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quiz_status";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quiz_generation_type";`);
  }
}
