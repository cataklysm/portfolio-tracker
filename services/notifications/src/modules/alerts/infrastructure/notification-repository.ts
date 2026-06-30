import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { DueSnoozedNotification, NewNotification, NotificationRepository, StoredNotification } from '../application/ports.js';

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
        rule_id: n.ruleId,
        data: JSON.stringify(n.data),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async getForUser(userId: string, id: string): Promise<StoredNotification | null> {
    const row = await this.db
      .selectFrom('notifications.notifications')
      .select(['id', 'type', 'severity', 'title', 'body', 'instrument_id', 'listing_id', 'rule_id', 'data', 'read_at', 'snoozed_until', 'created_at'])
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          type: row.type,
          severity: row.severity,
          title: row.title,
          body: row.body,
          instrument_id: row.instrument_id,
          listing_id: row.listing_id,
          rule_id: row.rule_id,
          data: row.data,
          read_at: toIso(row.read_at),
          snoozed_until: toIso(row.snoozed_until),
          created_at: toIso(row.created_at) ?? new Date(0).toISOString(),
        }
      : null;
  }

  async listForUser(userId: string, limit: number): Promise<StoredNotification[]> {
    const rows = await this.db
      .selectFrom('notifications.notifications')
      .select(['id', 'type', 'severity', 'title', 'body', 'instrument_id', 'listing_id', 'rule_id', 'data', 'read_at', 'snoozed_until', 'created_at'])
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
      rule_id: row.rule_id,
      data: row.data,
      read_at: toIso(row.read_at),
      snoozed_until: toIso(row.snoozed_until),
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
      .set({ read_at: sql`coalesce(read_at, now())`, snoozed_until: null })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.db
      .updateTable('notifications.notifications')
      .set({ read_at: sql`now()`, snoozed_until: null })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0n);
  }

  async snooze(userId: string, id: string, until: Date): Promise<boolean> {
    const result = await this.db
      .updateTable('notifications.notifications')
      .set({ snoozed_until: until })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  async releaseDueSnoozed(now: Date, limit: number): Promise<DueSnoozedNotification[]> {
    // Postgres has no UPDATE ... LIMIT, so bound the batch via a subquery of ids
    // (oldest-due first) and update those rows.
    const rows = await this.db
      .updateTable('notifications.notifications')
      .set({ snoozed_until: null })
      .where('id', 'in', (qb) =>
        qb
          .selectFrom('notifications.notifications')
          .select('id')
          .where('read_at', 'is', null)
          .where('snoozed_until', 'is not', null)
          .where('snoozed_until', '<=', now)
          .orderBy('snoozed_until')
          .limit(limit),
      )
      .returning(['id', 'user_id', 'type'])
      .execute();

    return rows.map((row) => ({ id: row.id, userId: row.user_id, type: row.type }));
  }

  async deleteReadBefore(cutoff: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('notifications.notifications')
      .where('read_at', 'is not', null)
      .where('read_at', '<', cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
