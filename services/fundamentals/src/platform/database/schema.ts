import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the fundamentals service. Owns `fundamentals.*`: the
 * snapshot table (one row per instrument+effective_date+provider), the outbox,
 * and the refresh-interest projection built from portfolio events. NUMERIC
 * columns are returned as strings (see platform `createDatabase`).
 */

type Numeric = ColumnType<string, string | number | null, string | number | null>;
type Json = ColumnType<unknown, string | undefined, string>;

export interface FundamentalsTable {
  id: Generated<string>;
  instrument_id: string;
  effective_date: ColumnType<Date, string, string>;
  provider: string;
  currency: string | null;
  /** The provider's own as-of timestamp, distinct from our retrieval `created_at`. */
  provider_as_of: Date | null;
  /** Coarse completeness grade of the snapshot: 'high' | 'medium' | 'low'. */
  quality: string | null;
  pe_ratio: Numeric | null;
  pb_ratio: Numeric | null;
  ps_ratio: Numeric | null;
  dividend_yield: Numeric | null;
  eps: Numeric | null;
  market_cap: Numeric | null;
  revenue: Numeric | null;
  revenue_growth: Numeric | null;
  earnings_growth: Numeric | null;
  shares_outstanding: Numeric | null;
  net_debt: Numeric | null;
  raw_payload: Json | null;
  created_at: Generated<Date>;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: ColumnType<string, string | number, string | number>;
  payload: Json;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Generated<Date>;
  published_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  attempts: Generated<number>;
  last_error: string | null;
}

export interface FundamentalsDatabase {
  'fundamentals.fundamentals': FundamentalsTable;
  'fundamentals.outbox_events': OutboxEventsTable;
}
