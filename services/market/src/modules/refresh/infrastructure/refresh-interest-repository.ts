import type { Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { InterestUpsert, RefreshInterestRepository } from '../application/ports.js';

/** Kysely adapter for the `market.refresh_interests` projection + refresh state. */
export class KyselyRefreshInterestRepository implements RefreshInterestRepository {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

  async upsertInterest(input: InterestUpsert): Promise<void> {
    await this.db
      .insertInto('market.refresh_interests')
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
          .where('market.refresh_interests.aggregate_version', '<', input.aggregateVersion),
      )
      .execute();
  }

  async listActiveListingIds(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('market.refresh_interests')
      .select('listing_id')
      .distinct()
      .where('active', '=', true)
      .execute();
    return rows.map((row) => row.listing_id);
  }

  async recordRefresh(listingIds: string[], provider: string, nextDueAt: Date): Promise<void> {
    if (listingIds.length === 0) return;
    await this.db
      .insertInto('market.data_refresh_state')
      .values(
        listingIds.map((listingId) => ({
          listing_id: listingId,
          data_type: 'quote',
          provider,
          last_refreshed_at: new Date(),
          next_due_at: nextDueAt,
          consecutive_failures: 0,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['listing_id', 'data_type', 'provider']).doUpdateSet({
          last_refreshed_at: new Date(),
          next_due_at: nextDueAt,
          consecutive_failures: 0,
          last_error: null,
        }),
      )
      .execute();
  }
}
