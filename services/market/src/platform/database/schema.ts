import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the market service. It owns the `market.*` tables: the
 * normalized quote cache/history, official daily FX rates, manual valuations,
 * the refresh scheduler state, and the consolidated refresh-interest projection.
 */

type Numeric = ColumnType<string, string | number, string | number>;
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface PriceQuotesTable {
  listing_id: string;
  time: ColumnType<Date, Date | string, Date | string>;
  provider: string;
  price: Numeric;
  /** Traded volume for the bar when the provider supplies it; null otherwise. */
  volume: Numeric | null;
  currency: string;
  provider_timestamp: Date | null;
  retrieved_at: Generated<Date>;
  freshness_status: ColumnType<'fresh' | 'stale' | 'delayed', 'fresh' | 'stale' | 'delayed' | undefined, 'fresh' | 'stale' | 'delayed'>;
}

export interface ManualValuationsTable {
  id: Generated<string>;
  user_id: string;
  listing_id: string;
  effective_at: ColumnType<Date, Date | string, Date | string>;
  price: Numeric;
  currency: string;
  created_by: string;
  created_at: Generated<Date>;
}

export interface FxRatesTable {
  base_currency: string;
  quote_currency: string;
  effective_date: ColumnType<string, string, string>;
  rate: Numeric;
  provider: string;
  provider_timestamp: Date | null;
  retrieved_at: Generated<Date>;
}

export interface DataRefreshStateTable {
  listing_id: string;
  data_type: string;
  provider: string;
  last_refreshed_at: Date | null;
  next_due_at: Date | null;
  last_error: string | null;
  consecutive_failures: ColumnType<number, number | undefined, number>;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string | number;
  payload: ColumnType<unknown, string | undefined, string>;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Generated<Date>;
  published_at: Date | null;
  attempts: ColumnType<number, number | undefined, number>;
  last_error: string | null;
}

export interface MarketDatabase {
  'market.price_quotes': PriceQuotesTable;
  'market.manual_valuations': ManualValuationsTable;
  'market.fx_rates': FxRatesTable;
  'market.data_refresh_state': DataRefreshStateTable;
  'market.outbox_events': OutboxEventsTable;
}
