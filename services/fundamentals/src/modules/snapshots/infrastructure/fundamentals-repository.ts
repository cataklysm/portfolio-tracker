import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { FundamentalsDatabase } from '../../../platform/database/schema.js';
import type { FundamentalsRepository, FundamentalsRow, StoredFundamentals } from '../application/ports.js';

/** Kysely adapter for `fundamentals.fundamentals`. */
export class KyselyFundamentalsRepository implements FundamentalsRepository {
  constructor(private readonly db: Kysely<FundamentalsDatabase>) {}

  async getLatestForInstruments(instrumentIds: string[]): Promise<Map<string, StoredFundamentals>> {
    const out = new Map<string, StoredFundamentals>();
    if (instrumentIds.length === 0) return out;

    // Newest snapshot per instrument via DISTINCT ON (instrument_id) ordered by
    // effective_date then created_at — the most recent row wins.
    const rows = await this.db
      .selectFrom('fundamentals.fundamentals')
      .distinctOn('instrument_id')
      .selectAll()
      .where('instrument_id', 'in', instrumentIds)
      .orderBy('instrument_id')
      .orderBy('effective_date', 'desc')
      .orderBy('created_at', 'desc')
      .execute();

    for (const row of rows) {
      out.set(row.instrument_id, toStored(row));
    }
    return out;
  }

  async selectStaleInstruments(instrumentIds: string[], before: Date): Promise<string[]> {
    if (instrumentIds.length === 0) return [];
    // Instruments whose newest snapshot is older than `before`, plus those with
    // no snapshot at all (a left-anti-join via NOT IN on the fresh set).
    const fresh = await this.db
      .selectFrom('fundamentals.fundamentals')
      .select('instrument_id')
      .distinct()
      .where('instrument_id', 'in', instrumentIds)
      .where('created_at', '>=', before)
      .execute();
    const freshSet = new Set(fresh.map((r) => r.instrument_id));
    return instrumentIds.filter((id) => !freshSet.has(id));
  }

  async upsert(row: FundamentalsRow): Promise<void> {
    await this.db
      .insertInto('fundamentals.fundamentals')
      .values({
        instrument_id: row.instrumentId,
        effective_date: row.effectiveDate,
        provider: row.provider,
        currency: row.currency,
        provider_as_of: row.providerAsOf,
        quality: row.quality,
        pe_ratio: row.peRatio,
        pb_ratio: row.pbRatio,
        ps_ratio: row.psRatio,
        dividend_yield: row.dividendYield,
        eps: row.eps,
        market_cap: row.marketCap,
        revenue: row.revenue,
        revenue_growth: row.revenueGrowth,
        earnings_growth: row.earningsGrowth,
        shares_outstanding: row.sharesOutstanding,
        net_debt: row.netDebt,
        raw_payload: JSON.stringify(row.rawPayload),
      })
      .onConflict((oc) =>
        oc.columns(['instrument_id', 'effective_date', 'provider']).doUpdateSet({
          currency: row.currency,
          provider_as_of: row.providerAsOf,
          quality: row.quality,
          pe_ratio: row.peRatio,
          pb_ratio: row.pbRatio,
          ps_ratio: row.psRatio,
          dividend_yield: row.dividendYield,
          eps: row.eps,
          market_cap: row.marketCap,
          revenue: row.revenue,
          revenue_growth: row.revenueGrowth,
          earnings_growth: row.earningsGrowth,
          shares_outstanding: row.sharesOutstanding,
          net_debt: row.netDebt,
          raw_payload: JSON.stringify(row.rawPayload),
          created_at: sql`now()`,
        }),
      )
      .execute();
  }
}

interface RawRow {
  instrument_id: string;
  effective_date: Date | string;
  provider: string;
  currency: string | null;
  provider_as_of: Date | string | null;
  quality: string | null;
  pe_ratio: string | null;
  pb_ratio: string | null;
  ps_ratio: string | null;
  dividend_yield: string | null;
  eps: string | null;
  market_cap: string | null;
  revenue: string | null;
  revenue_growth: string | null;
  earnings_growth: string | null;
  shares_outstanding: string | null;
  net_debt: string | null;
  raw_payload: unknown;
  created_at: Date | string;
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStored(row: RawRow): StoredFundamentals {
  return {
    instrument_id: row.instrument_id,
    effective_date: isoDate(row.effective_date),
    provider: row.provider,
    currency: row.currency,
    provider_as_of: row.provider_as_of === null ? null : isoTimestamp(row.provider_as_of),
    quality: row.quality,
    pe_ratio: row.pe_ratio,
    pb_ratio: row.pb_ratio,
    ps_ratio: row.ps_ratio,
    dividend_yield: row.dividend_yield,
    eps: row.eps,
    market_cap: row.market_cap,
    revenue: row.revenue,
    revenue_growth: row.revenue_growth,
    earnings_growth: row.earnings_growth,
    shares_outstanding: row.shares_outstanding,
    net_debt: row.net_debt,
    raw_payload: row.raw_payload,
    created_at: isoTimestamp(row.created_at),
  };
}
