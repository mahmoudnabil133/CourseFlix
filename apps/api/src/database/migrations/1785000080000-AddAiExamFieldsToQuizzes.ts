import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the review workflow + deadline fields the AI exam generator needs
 * on top of `quizzes`/`questions`. Neither table has its own creation
 * migration (they're synchronize-managed, see
 * `1785000063000-CreateInterventionMiniQuizzes.ts`'s docblock) so this
 * follows the same additive-ALTER precedent as
 * `1785000032000-AddErrorMessageToDocuments.ts` instead of editing a
 * migration that doesn't exist.
 *
 * `status` defaults to 'published' so every pre-existing (manually
 * created) quiz stays exactly as visible to students as it is today —
 * only new AI-generated drafts start out hidden in 'pending_review'.
 */
export class AddAiExamFieldsToQuizzes1785000080000 implements MigrationInterface {
  name = 'AddAiExamFieldsToQuizzes1785000080000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "status" quiz_status NOT NULL DEFAULT 'published';
    `);
    await queryRunner.query(`
      ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMPTZ;
    `);

    await queryRunner.query(`
      ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "difficulty" TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "questions" DROP COLUMN IF EXISTS "difficulty";`);
    await queryRunner.query(`ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "due_at";`);
    await queryRunner.query(`ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "status";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quiz_status";`);
  }
}
