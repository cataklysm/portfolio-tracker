import type { Kysely } from 'kysely';
import type { NotificationsDatabase } from '../../platform/database/schema.js';
import type { ActiveInterest, InterestUpsert, UserInterestRepository } from './ports.js';

/** Kysely adapter for the `notifications.user_interests` projection. */
export class KyselyUserInterestRepository implements UserInterestRepository {
  constructor(private readonly db: Kysely<NotificationsDatabase>) {}

  async upsertInterest(input: InterestUpsert): Promise<void> {
    await this.db
      .insertInto('notifications.user_interests')
      .values({
        interest_id: input.interestId,
        user_id: input.userId,
        listing_id: input.listingId,
        interest_type: input.interestType,
        active: input.active,
        aggregate_version: input.aggregateVersion,
      })
      .onConflict((oc) =>
        oc
          .column('interest_id')
          .doUpdateSet({
            active: input.active,
            aggregate_version: input.aggregateVersion,
            updated_at: new Date(),
          })
          .where('notifications.user_interests.aggregate_version', '<', input.aggregateVersion),
      )
      .execute();
  }

  async listActiveInterests(): Promise<ActiveInterest[]> {
    const rows = await this.db
      .selectFrom('notifications.user_interests')
      .select(['user_id', 'listing_id'])
      .distinct()
      .where('active', '=', true)
      .execute();
    return rows.map((row) => ({ userId: row.user_id, listingId: row.listing_id }));
  }
}
