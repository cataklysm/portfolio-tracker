import type { Kysely } from 'kysely';
import type { NotificationsDatabase } from '../../../platform/database/schema.js';
import type { SeedRepository } from '../application/ports.js';

/**
 * Kysely adapter for `notifications.seeded_users`. The `claim` uses an
 * INSERT … ON CONFLICT DO NOTHING … RETURNING so that exactly one caller wins
 * the race to seed a user's default rules, even if the interest consumer and a
 * future caller run concurrently.
 */
export class KyselySeedRepository implements SeedRepository {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async claim(userId: string): Promise<boolean> {
    const row = await this.db
      .insertInto('notifications.seeded_users')
      .values({ user_id: userId })
      .onConflict((oc) => oc.column('user_id').doNothing())
      .returning('user_id')
      .executeTakeFirst();
    return row !== undefined;
  }
}
