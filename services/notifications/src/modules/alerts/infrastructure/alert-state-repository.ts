import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { AlertStateRepository } from '../application/ports.js';

/** Kysely adapter for `notifications.alert_state` (per-alert dedup signatures). */
export class KyselyAlertStateRepository implements AlertStateRepository {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async getState(userId: string, listingId: string, alertType: string): Promise<{ signature: string; firedAt: Date } | null> {
    const row = await this.db
      .selectFrom('notifications.alert_state')
      .select(['dedupe_key', 'fired_at'])
      .where('user_id', '=', userId)
      .where('listing_id', '=', listingId)
      .where('alert_type', '=', alertType)
      .executeTakeFirst();
    if (!row) return null;
    return { signature: row.dedupe_key, firedAt: row.fired_at instanceof Date ? row.fired_at : new Date(row.fired_at) };
  }

  async set(userId: string, listingId: string, alertType: string, dedupeKey: string): Promise<void> {
    await this.db
      .insertInto('notifications.alert_state')
      .values({ user_id: userId, listing_id: listingId, alert_type: alertType, dedupe_key: dedupeKey })
      .onConflict((oc) =>
        oc.columns(['user_id', 'listing_id', 'alert_type']).doUpdateSet({ dedupe_key: dedupeKey, fired_at: sql`now()` }),
      )
      .execute();
  }

  async clear(userId: string, listingId: string, alertType: string): Promise<void> {
    await this.db
      .deleteFrom('notifications.alert_state')
      .where('user_id', '=', userId)
      .where('listing_id', '=', listingId)
      .where('alert_type', '=', alertType)
      .execute();
  }

  async clearByAlertType(userId: string, alertType: string): Promise<void> {
    await this.db
      .deleteFrom('notifications.alert_state')
      .where('user_id', '=', userId)
      .where('alert_type', '=', alertType)
      .execute();
  }
}
