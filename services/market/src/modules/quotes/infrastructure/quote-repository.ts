import { sql, type Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { DailyClose, NormalizedQuote, QuoteRepository, StoredQuotePair } from '../application/ports.js';

/** Kysely adapter for the `market.price_quotes` cache/history. */
export class KyselyQuoteRepository implements QuoteRepository {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

  async getLatestPairs(listingIds: string[]): Promise<Map<string, StoredQuotePair>> {
    const map = new Map<string, StoredQuotePair>();
    if (listingIds.length === 0) return map;

    // `latest` is the most recent tick. `previous` is the **prior session close**:
    // the most recent quote on an earlier calendar day than the latest tick — so
    // a day's intraday ticks never count as "previous". The calendar day is taken
    // in UTC (deterministic, no exchange-tz dependency); full exchange-session /
    // holiday-aware boundaries are deferred (see the market session-status work).
    // When no earlier-day quote exists, `previous` is null and the daily change is
    // genuinely unknown rather than an intraday delta.
    const rows = await sql<{
      listing_id: string;
      time: Date;
      price: string;
      currency: string;
      provider: string;
      provider_timestamp: Date | null;
      retrieved_at: Date;
      is_latest: boolean;
    }>`
      WITH base AS (
        SELECT listing_id, time, price, currency, provider, provider_timestamp, retrieved_at,
               max(time) OVER (PARTITION BY listing_id) AS latest_time
        FROM market.price_quotes
        WHERE listing_id = ANY(${sql.val(listingIds)})
      ),
      ranked AS (
        SELECT *,
               (time = latest_time) AS is_latest,
               ((time AT TIME ZONE 'UTC')::date < (latest_time AT TIME ZONE 'UTC')::date) AS is_prior_day,
               row_number() OVER (
                 PARTITION BY listing_id
                 ORDER BY ((time AT TIME ZONE 'UTC')::date < (latest_time AT TIME ZONE 'UTC')::date) DESC, time DESC
               ) AS r
        FROM base
      )
      SELECT listing_id, time, price, currency, provider, provider_timestamp, retrieved_at, is_latest
      FROM ranked
      WHERE is_latest OR (is_prior_day AND r = 1)
    `.execute(this.db);

    for (const row of rows.rows) {
      const existing =
        map.get(row.listing_id) ??
        { latest: null, previous: null, currency: null, latestAt: null, retrievedAt: null, provider: null, providerTimestamp: null };
      if (row.is_latest) {
        existing.latest = row.price;
        existing.currency = row.currency;
        existing.latestAt = row.time;
        existing.retrievedAt = row.retrieved_at;
        existing.provider = row.provider;
        existing.providerTimestamp = row.provider_timestamp;
      } else {
        existing.previous = row.price;
      }
      map.set(row.listing_id, existing);
    }
    return map;
  }

  async getSeries(listingId: string, limit: number): Promise<{ time: Date; price: string; volume: string | null }[]> {
    const rows = await this.db
      .selectFrom('market.price_quotes')
      .select(['time', 'price', 'volume'])
      .where('listing_id', '=', listingId)
      .orderBy('time', 'desc')
      .limit(limit)
      .execute();
    return rows.reverse().map((row) => ({ time: row.time, price: row.price, volume: row.volume }));
  }

  async getDailyCloseSeries(listingId: string, from: string, to: string): Promise<DailyClose[]> {
    // In-range daily closes: the last tick of each UTC calendar day in [from, to].
    const inRange = await sql<{ date: string; price: string; volume: string | null }>`
      SELECT date::text AS date, price, volume FROM (
        SELECT (time AT TIME ZONE 'UTC')::date AS date, price, volume,
               row_number() OVER (
                 PARTITION BY (time AT TIME ZONE 'UTC')::date ORDER BY time DESC
               ) AS rn
        FROM market.price_quotes
        WHERE listing_id = ${sql.val(listingId)}
          AND (time AT TIME ZONE 'UTC')::date BETWEEN ${sql.val(from)}::date AND ${sql.val(to)}::date
      ) t
      WHERE rn = 1
      ORDER BY date
    `.execute(this.db);

    // Anchor: the most recent close strictly before the window (forward-fill seed).
    const anchor = await sql<{ date: string; price: string; volume: string | null }>`
      SELECT (time AT TIME ZONE 'UTC')::date::text AS date, price, volume
      FROM market.price_quotes
      WHERE listing_id = ${sql.val(listingId)}
        AND (time AT TIME ZONE 'UTC')::date < ${sql.val(from)}::date
      ORDER BY time DESC
      LIMIT 1
    `.execute(this.db);

    return [...anchor.rows, ...inRange.rows];
  }

  async purgeListings(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    const result = await this.db
      .deleteFrom('market.price_quotes')
      .where('listing_id', 'in', listingIds)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }

  async upsertQuote(quote: NormalizedQuote): Promise<void> {
    await this.db
      .insertInto('market.price_quotes')
      .values({
        listing_id: quote.listingId,
        time: quote.time,
        provider: quote.provider,
        price: quote.price,
        volume: quote.volume,
        currency: quote.currency,
        provider_timestamp: quote.providerTimestamp,
        freshness_status: 'delayed',
      })
      .onConflict((oc) =>
        oc.columns(['listing_id', 'time', 'provider']).doUpdateSet({
          price: quote.price,
          volume: quote.volume,
          currency: quote.currency,
          provider_timestamp: quote.providerTimestamp,
          retrieved_at: new Date(),
        }),
      )
      .execute();
  }
}
