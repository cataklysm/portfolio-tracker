import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { NewPushSubscription, PushSubscriptionRepository, StoredPushSubscription } from '../application/ports.js';

/** The deterministic public handle for a subscription: sha256(endpoint) as hex. */
export function pushEndpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

/** Kysely adapter for `notifications.push_subscriptions` (Web Push endpoints). */
export class KyselyPushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async upsert(input: NewPushSubscription): Promise<void> {
    await this.db
      .insertInto('notifications.push_subscriptions')
      .values({
        user_id: input.userId,
        endpoint: input.endpoint,
        endpoint_hash: pushEndpointHash(input.endpoint),
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'endpoint']).doUpdateSet({
          p256dh: input.p256dh,
          auth: input.auth,
          user_agent: input.userAgent,
        }),
      )
      .execute();
  }

  async listForUser(userId: string): Promise<StoredPushSubscription[]> {
    const rows = await this.db
      .selectFrom('notifications.push_subscriptions')
      .select(['endpoint', 'p256dh', 'auth'])
      .where('user_id', '=', userId)
      .execute();
    return rows;
  }

  async deleteByHash(userId: string, endpointHash: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('notifications.push_subscriptions')
      .where('user_id', '=', userId)
      .where('endpoint_hash', '=', endpointHash)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async deleteExpired(endpoint: string): Promise<void> {
    await this.db.deleteFrom('notifications.push_subscriptions').where('endpoint', '=', endpoint).execute();
  }

  async markSuccess(endpoint: string): Promise<void> {
    await this.db
      .updateTable('notifications.push_subscriptions')
      .set({ last_success_at: sql`now()` })
      .where('endpoint', '=', endpoint)
      .execute();
  }
}
