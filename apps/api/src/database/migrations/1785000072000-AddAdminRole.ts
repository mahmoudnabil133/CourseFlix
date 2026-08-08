import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin dashboard foundation. Adds `admin` as a third value of the
 * existing `user_role` enum (created in 1752975600000-CreateUsersTable).
 *
 * `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction as a
 * statement that *reads* the new value — this migration only adds it and
 * touches nothing else, so it's safe standalone. `IF NOT EXISTS` keeps it
 * idempotent for repeated reseed/reset runs.
 *
 * Postgres has no clean way to remove a single enum value (would require
 * rebuilding the type and every column/index that uses it), so `down()`
 * intentionally does not attempt a partial, unsafe revert.
 */
export class AddAdminRole1785000072000 implements MigrationInterface {
  name = 'AddAdminRole1785000072000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'admin';
    `);
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddAdminRole1785000072000 is not reversible: Postgres cannot drop a ' +
        'single enum value without rebuilding the "user_role" type and every ' +
        'column/index that depends on it. Restore from a pre-migration backup instead.',
    );
  }
}
