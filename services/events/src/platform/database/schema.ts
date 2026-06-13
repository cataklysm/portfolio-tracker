import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the events service. Owns `events.*`: relationally-separated
 * earnings, corporate actions, and news (each query-relevant field is a real
 * column; raw provider payloads archived in `raw_payload`), plus the refresh
 * projection + state and the outbox. NUMERIC columns are returned as strings.
 */

type Numeric = ColumnType<string, string | number | null, string | number | null>;
type Json = ColumnType<unknown, string | undefined, string>;
type DateCol = ColumnType<Date, string, string>;

export interface EarningsTable {
  id: Generated<string>;
  instrument_id: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: DateCol | null;
  report_date: DateCol | null;
  eps_estimate: Numeric | null;
  eps_actual: Numeric | null;
  revenue_estimate: Numeric | null;
  revenue_actual: Numeric | null;
  surprise_pct: Numeric | null;
  provider: string;
  raw_payload: Json | null;
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface CorporateActionsTable {
  id: Generated<string>;
  stable_action_id: string;
  version: number;
  instrument_id: string;
  type: 'split' | 'reverse_split' | 'dividend' | 'buyback' | 'spinoff' | 'capital_increase';
  ex_date: DateCol;
  record_date: DateCol | null;
  payment_date: DateCol | null;
  ratio_numerator: Numeric | null;
  ratio_denominator: Numeric | null;
  dividend_amount: Numeric | null;
  dividend_currency: string | null;
  new_shares: Numeric | null;
  subscription_price: Numeric | null;
  shares_before: Numeric | null;
  shares_after: Numeric | null;
  dilution_ratio: Numeric | null;
  provider: string;
  source_reference: string | null;
  raw_payload: Json | null;
  created_at: Generated<Date>;
}

export interface NewsTable {
  id: Generated<string>;
  instrument_id: string | null;
  published_at: ColumnType<Date, Date | string, Date | string>;
  provider: string;
  headline: string;
  url: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  summary: string | null;
  raw_payload: Json | null;
  created_at: Generated<Date>;
}

export interface RefreshInterestsTable {
  interest_id: string;
  listing_id: string;
  interest_type: 'position' | 'watchlist';
  active: boolean;
  aggregate_version: ColumnType<string, string | number, string | number>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface RefreshStateTable {
  instrument_id: string;
  last_refreshed_at: ColumnType<Date, Date | string | undefined, Date | string>;
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

export interface EventsDatabase {
  'events.earnings': EarningsTable;
  'events.corporate_actions': CorporateActionsTable;
  'events.news': NewsTable;
  'events.refresh_interests': RefreshInterestsTable;
  'events.refresh_state': RefreshStateTable;
  'events.outbox_events': OutboxEventsTable;
}
