import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  NotificationProducerPort,
  NotifyInput,
} from '../common/ports/notification-producer.port';

/**
 * `notifications.type` is a strict Postgres enum (hw_assigned,
 * quiz_ready, progress_report, announcement, course_update, system) —
 * see `1785000031000-CreateNotifications.ts`. The port's `type` field is
 * intentionally a plain string (documented in
 * `notification-producer.port.ts` as avoiding a cross-module import
 * cycle), so callers here pass ad-hoc values like
 * `document_ingestion_completed`. Anything that isn't one of the six
 * real enum values is coerced to `system` rather than left to hit a
 * Postgres "invalid input value for enum" error.
 */
const NOTIFICATION_TYPE_ENUM = new Set([
  'hw_assigned',
  'quiz_ready',
  'progress_report',
  'announcement',
  'course_update',
  'system',
]);

function toEnumType(type: string): string {
  if (NOTIFICATION_TYPE_ENUM.has(type)) {
    return type;
  }
  if (type.startsWith('exam_generation')) {
    return 'quiz_ready';
  }
  return 'system';
}

/**
 * Real, DB-backed `NotificationProducerPort` for the worker. Replaces
 * `NoopNotificationProducer` (which only logged and never persisted
 * anything, so ingestion-completion notifications never actually
 * reached a teacher) with a direct insert via the same raw-SQL
 * `DataSource` the rest of the worker already uses — the worker runs as
 * a standalone process with no access to the API's NestJS DI container
 * (and therefore no `NotificationsService`), so this is the only way to
 * write a notification from here.
 */
@Injectable()
export class DbNotificationProducer implements NotificationProducerPort {
  private readonly logger = new Logger(DbNotificationProducer.name);

  constructor(private readonly dataSource: DataSource) {}

  async notify(input: NotifyInput): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO notifications (
        user_id, type, title, message, related_entity_type, related_entity_id
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.userId,
        toEnumType(input.type),
        input.title,
        input.message,
        input.relatedEntityType ?? null,
        input.relatedEntityId ?? null,
      ],
    );
    this.logger.log(`notify ${input.userId}: ${input.type}`);
  }
}
