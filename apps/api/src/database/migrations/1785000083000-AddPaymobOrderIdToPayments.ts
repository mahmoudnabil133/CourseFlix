import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 addition (real Paymob payments, CF-S4). Stores Paymob's order
 * id per payment attempt so the browser GET redirect callback (which only
 * carries Paymob's order id) can be mapped back to our order and course.
 *
 * Idempotent on purpose: the app runtime runs with `synchronize: true`
 * (app.module.ts), so the column may already exist when migrations run
 * against an already-synced local schema.
 */
export class AddPaymobOrderIdToPayments1785000083000 implements MigrationInterface {
  name = 'AddPaymobOrderIdToPayments1785000083000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "paymob_order_id" TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN IF EXISTS "paymob_order_id";
    `);
  }
}
