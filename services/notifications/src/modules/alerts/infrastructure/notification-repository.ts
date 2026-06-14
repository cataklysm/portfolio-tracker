import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { NewNotification, NotificationRepository, StoredNotification } from '../application/ports.js';

/** Kysely adapter for `notifications.notifications`. */
export class KyselyNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async insert(n: NewNotification): Promise<string> {
    const row = await this.db
      .insertInto('notifications.notifications')
      .values({
        user_id: n.userId,
        type: n.type,
        severity: n.severity,
        title: n.title,
        body: n.body,
        instrument_id: n.instrumentId,
        listing_id: n.listingId,
        data: JSON.stringify(n.data),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async listForUser(userId: string, limit: number): Promise<StoredNotification[]> {
    const rows = await this.db
      .selectFrom('notifications.notifications')
      .select(['id', 'type', 'severity', 'title', 'body', 'instrument_id', 'listing_id', 'data', 'read_at', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      body: row.body,
      instrument_id: row.instrument_id,
      listing_id: row.listing_id,
      data: row.data,
      read_at: toIso(row.read_at),
      created_at: toIso(row.created_at) ?? new Date(0).toISOString(),
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    const row = await this.db
      .selectFrom('notifications.notifications')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return row ? Number(row.n) : 0;
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('notifications.notifications')
      .set({ read_at: sql`now()` })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.db
      .updateTable('notifications.notifications')
      .set({ read_at: sql`now()` })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0n);
  }
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
