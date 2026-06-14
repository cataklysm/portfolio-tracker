import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the portfolio service. It owns only the `portfolio.*`
 * tables. Listing master data comes from the instruments service, quotes and FX
 * from the market service, and user settings from the authentication service —
 * all over HTTP. There are no cross-schema reads.
 */

/** NUMERIC columns: returned as exact decimal strings, accepted as string/number. */
type Numeric = ColumnType<string, string | number, string | number>;
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<unknown, string | undefined, string>;

// ---- Owned: portfolio.* -----------------------------------------------------

export interface PortfoliosTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  sort_order: ColumnType<number, number | undefined, number>;
  archived_at: Date | null;
  preferred_headline_metric: ColumnType<string, string | undefined, string>;
  preferred_benchmark: ColumnType<unknown, string | null | undefined, string | null>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface PositionsTable {
  id: Generated<string>;
  portfolio_id: string;
  listing_id: string;
  state: ColumnType<'open' | 'closed' | 'invalid', 'open' | 'closed' | 'invalid' | undefined, 'open' | 'closed' | 'invalid'>;
  calculation_version: ColumnType<string, string | number | undefined, string | number>;
  last_valid_calculated_values: Json;
  invalid_reason: ColumnType<unknown, string | null | undefined, string | null>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface TransactionsTable {
  id: Generated<string>;
  position_id: string;
  side: 'buy' | 'sell';
  effective_at: ColumnType<Date, Date | string, Date | string>;
  creation_sequence: Generated<string>;
  quantity: Numeric;
  price: Numeric;
  fee: ColumnType<string, string | number | undefined, string | number>;
  currency: string;
  booking_fx_rate: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  tax_relevant_value_date: ColumnType<string, string, string>;
  savings_plan: ColumnType<boolean, boolean | undefined, boolean>;
  note: string | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface CashFlowsTable {
  id: Generated<string>;
  user_id: string;
  portfolio_id: string;
  position_id: string | null;
  corporate_action_id: string | null;
  corporate_action_application_id: string | null;
  type: 'dividend' | 'deposit' | 'withdrawal' | 'cash_in_lieu';
  gross_amount: Numeric;
  withholding_tax: ColumnType<string, string | number | undefined, string | number>;
  fee: ColumnType<string, string | number | undefined, string | number>;
  net_amount: Numeric;
  currency: string;
  payment_date: ColumnType<string, string, string>;
  tax_relevant_value_date: ColumnType<string, string, string>;
  note: string | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface WatchlistItemsTable {
  id: Generated<string>;
  user_id: string;
  listing_id: string;
  note: string | null;
  created_at: Generated<Date>;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string | number;
  user_id: string | null;
  payload: Json;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Generated<Date>;
  published_at: Date | null;
  attempts: ColumnType<number, number | undefined, number>;
  last_error: string | null;
}

export interface PortfolioDatabase {
  'portfolio.portfolios': PortfoliosTable;
  'portfolio.positions': PositionsTable;
  'portfolio.transactions': TransactionsTable;
  'portfolio.cash_flows': CashFlowsTable;
  'portfolio.watchlist_items': WatchlistItemsTable;
  'portfolio.outbox_events': OutboxEventsTable;
}
