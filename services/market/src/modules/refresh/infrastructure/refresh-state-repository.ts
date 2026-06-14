import type { Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { RefreshStateRepository } from '../application/ports.js';

/** Kysely adapter for `market.data_refresh_state` (per-listing refresh state). */
export class KyselyRefreshStateRepository implements RefreshStateRepository {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

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
