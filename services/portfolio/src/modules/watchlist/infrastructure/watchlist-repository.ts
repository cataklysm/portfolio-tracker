import type { Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';

export interface WatchlistItem {
  id: string;
  listing_id: string;
  note: string | null;
  created_at: string;
}

/**
 * Kysely adapter for `portfolio.watchlist_items` (user-level interest). Add and
 * remove also write a refresh-interest event to the transactional outbox in the
 * same transaction so the market service can maintain its refresh projection.
 */
export class KyselyWatchlistRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async list(userId: string): Promise<WatchlistItem[]> {
    const rows = await this.db
      .selectFrom('portfolio.watchlist_items')
      .select(['id', 'listing_id', 'note', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      listing_id: row.listing_id,
      note: row.note,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  }

  async add(userId: string, listingId: string, note: string | null): Promise<{ id: string }> {
    return this.db.transaction().execute(async (trx) => {
      const item = await trx
        .insertInto('portfolio.watchlist_items')
        .values({ user_id: userId, listing_id: listingId, note })
        .onConflict((oc) => oc.columns(['user_id', 'listing_id']).doUpdateSet({ note }))
        .returning('id')
        .executeTakeFirstOrThrow();
      await enqueueInterest(trx, {
        eventType: 'portfolio.watchlist.added',
        interestId: item.id,
        version: 1,
        userId,
        listingId,
      });
      return { id: item.id };
    });
  }

  async remove(userId: string, listingId: string): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('portfolio.watchlist_items')
        .select('id')
        .where('user_id', '=', userId)
        .where('listing_id', '=', listingId)
        .executeTakeFirst();
      if (!existing) return false;

      await trx.deleteFrom('portfolio.watchlist_items').where('id', '=', existing.id).execute();
      await enqueueInterest(trx, {
        eventType: 'portfolio.watchlist.removed',
        interestId: existing.id,
        version: 2,
        userId,
        listingId,
      });
      return true;
    });
  }
}

async function enqueueInterest(
  trx: Kysely<PortfolioDatabase>,
  input: { eventType: string; interestId: string; version: number; userId: string; listingId: string },
): Promise<void> {
  await trx
    .insertInto('portfolio.outbox_events')
    .values({
      event_type: input.eventType,
      event_version: 1,
      aggregate_type: 'watchlist',
      aggregate_id: input.interestId,
      aggregate_version: input.version,
      user_id: input.userId,
      payload: JSON.stringify({ listing_id: input.listingId, interest_type: 'watchlist' }),
      correlation_id: null,
      causation_id: null,
    })
    .execute();
}
