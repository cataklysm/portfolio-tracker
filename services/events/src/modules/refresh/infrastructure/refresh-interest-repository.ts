import type { Kysely } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type { InterestUpsert, RefreshInterestRepository } from '../application/ports.js';

/** Kysely adapter for the `events.refresh_interests` projection. */
export class KyselyRefreshInterestRepository implements RefreshInterestRepository {
  constructor(private readonly db: Kysely<EventsDatabase>) {}

  async upsertInterest(input: InterestUpsert): Promise<void> {
    await this.db
      .insertInto('events.refresh_interests')
      .values({
        interest_id: input.interestId,
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
          .where('events.refresh_interests.aggregate_version', '<', input.aggregateVersion),
      )
      .execute();
  }

  async listActiveListingIds(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('events.refresh_interests')
      .select('listing_id')
      .distinct()
      .where('active', '=', true)
      .execute();
    return rows.map((row) => row.listing_id);
  }
}
