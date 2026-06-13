import { sql, type Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { NormalizedQuote, QuoteRepository, StoredQuotePair } from '../application/ports.js';

/** Kysely adapter for the `market.price_quotes` cache/history. */
export class KyselyQuoteRepository implements QuoteRepository {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

  async getLatestPairs(listingIds: string[]): Promise<Map<string, StoredQuotePair>> {
    const map = new Map<string, StoredQuotePair>();
    if (listingIds.length === 0) return map;

    const ranked = this.db
      .selectFrom('market.price_quotes')
      .select(['listing_id', 'time', 'price', 'currency'])
      .select(sql<number>`row_number() over (partition by listing_id order by time desc)`.as('rn'))
      .where('listing_id', 'in', listingIds);

    const rows = await this.db
      .selectFrom(ranked.as('q'))
      .select(['q.listing_id as listing_id', 'q.time as time', 'q.price as price', 'q.currency as currency', 'q.rn as rn'])
      .where('q.rn', '<=', 2)
      .orderBy('q.listing_id')
      .orderBy('q.rn')
      .execute();

    for (const row of rows) {
      const existing = map.get(row.listing_id) ?? { latest: null, previous: null, currency: null, latestAt: null };
      // row_number() is bigint, which the pg int8 type parser returns as a
      // string — so coerce before comparing (a strict `=== 1` is always false).
      if (Number(row.rn) === 1) {
        existing.latest = row.price;
        existing.currency = row.currency;
        existing.latestAt = row.time;
      } else {
        existing.previous = row.price;
      }
      map.set(row.listing_id, existing);
    }
    return map;
  }

  async getSeries(listingId: string, limit: number): Promise<{ time: Date; price: string }[]> {
    const rows = await this.db
      .selectFrom('market.price_quotes')
      .select(['time', 'price'])
      .where('listing_id', '=', listingId)
      .orderBy('time', 'desc')
      .limit(limit)
      .execute();
    return rows.reverse().map((row) => ({ time: row.time, price: row.price }));
  }

  async upsertQuote(quote: NormalizedQuote): Promise<void> {
    await this.db
      .insertInto('market.price_quotes')
      .values({
        listing_id: quote.listingId,
        time: quote.time,
        provider: quote.provider,
        price: quote.price,
        currency: quote.currency,
        provider_timestamp: quote.providerTimestamp,
        freshness_status: 'delayed',
      })
      .onConflict((oc) =>
        oc.columns(['listing_id', 'time', 'provider']).doUpdateSet({
          price: quote.price,
          currency: quote.currency,
          provider_timestamp: quote.providerTimestamp,
          retrieved_at: new Date(),
        }),
      )
      .execute();
  }
}
