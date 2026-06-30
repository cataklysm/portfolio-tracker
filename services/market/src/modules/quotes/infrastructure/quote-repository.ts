import { sql, type Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { DailyClose, NormalizedQuote, PriceRange, PriceRanges, QuoteRepository, StoredQuotePair } from '../application/ports.js';

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
          AND time <= now() + interval '2 minutes'
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
      .where('time', '<=', sql<Date>`now() + interval '2 minutes'`)
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
          AND time <= now() + interval '2 minutes'
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
        AND time <= now() + interval '2 minutes'
        AND (time AT TIME ZONE 'UTC')::date < ${sql.val(from)}::date
      ORDER BY time DESC
      LIMIT 1
    `.execute(this.db);

    return [...anchor.rows, ...inRange.rows];
  }

  async getPriceRanges(listingId: string): Promise<PriceRanges> {
    // One pass over at most the last year of this listing's quotes. The CTE marks
    // the daily/weekly/monthly sub-windows once (yearly is the whole scanned set,
    // since the WHERE already bounds it to a year). The day is taken in UTC,
    // consistent with getLatestPairs / getDailyCloseSeries. `price` is numeric, so
    // max/min are numeric, not lexicographic. Each extreme's timestamp is the
    // arg-max/arg-min via `array_agg(time ORDER BY price …)[1]`; ties resolve to
    // the most recent occurrence (`…, time DESC`). An empty window yields NULLs
    // throughout. Extremes reflect whatever resolution is stored (intraday ticks
    // or daily closes).
    const result = await sql<{
      daily_high: string | null;
      daily_low: string | null;
      daily_high_at: Date | null;
      daily_low_at: Date | null;
      weekly_high: string | null;
      weekly_low: string | null;
      weekly_high_at: Date | null;
      weekly_low_at: Date | null;
      monthly_high: string | null;
      monthly_low: string | null;
      monthly_high_at: Date | null;
      monthly_low_at: Date | null;
      yearly_high: string | null;
      yearly_low: string | null;
      yearly_high_at: Date | null;
      yearly_low_at: Date | null;
      currency: string | null;
    }>`
      WITH scanned AS (
        SELECT
          time,
          price,
          currency,
          (time AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date AS in_daily,
          time >= now() - interval '7 days'  AS in_weekly,
          time >= now() - interval '1 month' AS in_monthly
        FROM market.price_quotes
        WHERE listing_id = ${sql.val(listingId)}
          AND time <= now() + interval '2 minutes'
          AND time >= now() - interval '1 year'
      )
      SELECT
        max(price) FILTER (WHERE in_daily) AS daily_high,
        min(price) FILTER (WHERE in_daily) AS daily_low,
        (array_agg(time ORDER BY price DESC, time DESC) FILTER (WHERE in_daily))[1] AS daily_high_at,
        (array_agg(time ORDER BY price ASC,  time DESC) FILTER (WHERE in_daily))[1] AS daily_low_at,
        max(price) FILTER (WHERE in_weekly) AS weekly_high,
        min(price) FILTER (WHERE in_weekly) AS weekly_low,
        (array_agg(time ORDER BY price DESC, time DESC) FILTER (WHERE in_weekly))[1] AS weekly_high_at,
        (array_agg(time ORDER BY price ASC,  time DESC) FILTER (WHERE in_weekly))[1] AS weekly_low_at,
        max(price) FILTER (WHERE in_monthly) AS monthly_high,
        min(price) FILTER (WHERE in_monthly) AS monthly_low,
        (array_agg(time ORDER BY price DESC, time DESC) FILTER (WHERE in_monthly))[1] AS monthly_high_at,
        (array_agg(time ORDER BY price ASC,  time DESC) FILTER (WHERE in_monthly))[1] AS monthly_low_at,
        max(price) AS yearly_high,
        min(price) AS yearly_low,
        (array_agg(time ORDER BY price DESC, time DESC))[1] AS yearly_high_at,
        (array_agg(time ORDER BY price ASC,  time DESC))[1] AS yearly_low_at,
        (array_agg(currency ORDER BY time DESC))[1] AS currency
      FROM scanned
    `.execute(this.db);

    const row = result.rows[0];
    const range = (
      high: string | null | undefined,
      low: string | null | undefined,
      highAt: Date | null | undefined,
      lowAt: Date | null | undefined,
    ): PriceRange => ({ high: high ?? null, low: low ?? null, highAt: highAt ?? null, lowAt: lowAt ?? null });

    return {
      currency: row?.currency ?? null,
      asOf: new Date(),
      daily: range(row?.daily_high, row?.daily_low, row?.daily_high_at, row?.daily_low_at),
      weekly: range(row?.weekly_high, row?.weekly_low, row?.weekly_high_at, row?.weekly_low_at),
      monthly: range(row?.monthly_high, row?.monthly_low, row?.monthly_high_at, row?.monthly_low_at),
      yearly: range(row?.yearly_high, row?.yearly_low, row?.yearly_high_at, row?.yearly_low_at),
    };
  }

  async purgeListings(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    const result = await this.db
      .deleteFrom('market.price_quotes')
      .where('listing_id', 'in', listingIds)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n);
  }

  async purgeListingsSince(listingIds: string[], since: Date): Promise<number> {
    if (listingIds.length === 0) return 0;
    const result = await this.db
      .deleteFrom('market.price_quotes')
      .where('listing_id', 'in', listingIds)
      .where('time', '>=', since)
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
