import type { Kysely } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { NotificationEventStore, NotificationType } from '../application/ports.js';

/**
 * Writes `notifications.created` events to `notifications.outbox_events`; the
 * platform OutboxPublisher forwards them to the `notifications` Redis stream for
 * any downstream consumer (none today — e.g. a future push/email delivery).
 */
export class KyselyNotificationEventStore implements NotificationEventStore {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async enqueueCreated(input: { notificationId: string; userId: string; type: NotificationType }): Promise<void> {
    await this.db
      .insertInto('notifications.outbox_events')
      .values({
        event_type: 'notifications.created',
        event_version: 1,
        aggregate_type: 'notification',
        aggregate_id: input.notificationId,
        aggregate_version: Date.now(),
        payload: JSON.stringify({
          notification_id: input.notificationId,
          user_id: input.userId,
          type: input.type,
        }),
        correlation_id: null,
        causation_id: null,
      })
      .execute();
  }
}
