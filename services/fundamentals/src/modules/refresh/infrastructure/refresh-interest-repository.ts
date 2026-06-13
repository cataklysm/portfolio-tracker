import type { Kysely } from 'kysely';
import type { FundamentalsDatabase } from '../../../platform/database/schema.js';
import type { InterestUpsert, RefreshInterestRepository } from '../application/ports.js';

/** Kysely adapter for the `fundamentals.refresh_interests` projection. */
export class KyselyRefreshInterestRepository implements RefreshInterestRepository {
  constructor(private readonly db: Kysely<FundamentalsDatabase>) {}

  async upsertInterest(input: InterestUpsert): Promise<void> {
    await this.db
      .insertInto('fundamentals.refresh_interests')
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
          // Ignore stale / out-of-order updates.
          .where('fundamentals.refresh_interests.aggregate_version', '<', input.aggregateVersion),
      )
      .execute();
  }

  async listActiveListingIds(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('fundamentals.refresh_interests')
      .select('listing_id')
      .distinct()
      .where('active', '=', true)
      .execute();
    return rows.map((row) => row.listing_id);
  }
}
