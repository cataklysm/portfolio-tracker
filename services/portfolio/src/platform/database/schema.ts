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

/** How a financial booking entered the system. */
export type BookingSource = 'manual' | 'import' | 'broker_api' | 'provider' | 'corporate_action';

// ---- Owned: portfolio.* -----------------------------------------------------

export interface PortfoliosTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  sort_order: ColumnType<number, number | undefined, number>;
  archived_at: Date | null;
  preferred_headline_metric: ColumnType<string, string | undefined, string>;
  preferred_benchmark: ColumnType<unknown, string | null | undefined, string | null>;
  /** The tax rule governing this portfolio (e.g. `de_securities_tax`), or null. */
  tax_rule_key: ColumnType<string | null, string | null | undefined, string | null>;
  /** Saved portfolio tax settings, validated against the rule's schema. */
  tax_settings: Json;
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
  source: ColumnType<BookingSource, BookingSource | undefined, BookingSource>;
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
  type: 'dividend' | 'deposit' | 'withdrawal' | 'cash_in_lieu' | 'interest';
  gross_amount: Numeric;
  withholding_tax: ColumnType<string, string | number | undefined, string | number>;
  fee: ColumnType<string, string | number | undefined, string | number>;
  net_amount: Numeric;
  currency: string;
  payment_date: ColumnType<string, string, string>;
  tax_relevant_value_date: ColumnType<string, string, string>;
  note: string | null;
  source_event_id: string | null;
  source_event_version: number | null;
  source_event_type: string | null;
  ex_date: ColumnType<string | null, string | null | undefined, string | null>;
  amount_per_share: Numeric | null;
  quantity_at_ex_date: Numeric | null;
  expected_gross_amount: Numeric | null;
  source: ColumnType<BookingSource, BookingSource | undefined, BookingSource>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface TaxEventsTable {
  id: Generated<string>;
  user_id: string;
  component: 'capital_income' | 'solidarity' | 'church' | 'foreign_withholding' | 'generic';
  direction: 'withheld' | 'refunded';
  amount: Numeric;
  currency: string;
  booking_date: ColumnType<string, string, string>;
  source: ColumnType<
    'manual' | 'import' | 'broker_api' | 'provider' | 'corporate_action' | 'income_booking',
    'manual' | 'import' | 'broker_api' | 'provider' | 'corporate_action' | 'income_booking' | undefined,
    'manual' | 'import' | 'broker_api' | 'provider' | 'corporate_action' | 'income_booking'
  >;
  note: string | null;
  transaction_id: string | null;
  cash_flow_id: string | null;
  position_id: string | null;
  portfolio_id: string | null;
  broker_account_id: string | null;
  statement_id: string | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface UserTaxSettingsTable {
  user_id: string;
  country_code: string;
  settings: Json;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface TaxRulesTable {
  id: Generated<string>;
  country_code: string;
  rule_key: string;
  rule_version: number;
  asset_classes: string[];
  valid_from: ColumnType<string, string, string>;
  valid_to: ColumnType<string | null, string | null | undefined, string | null>;
  user_settings_schema: Json;
  portfolio_settings_schema: Json;
  parameters: Json;
  calculation_engine_key: string;
  supported: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface RealizationAllocationsTable {
  id: Generated<string>;
  sell_transaction_id: string;
  buy_transaction_id: string;
  quantity: Numeric;
  accounting_method: 'fifo' | 'lifo';
  calculation_version: string | number;
  created_at: Generated<Date>;
}

export interface AverageCostRealizationsTable {
  id: Generated<string>;
  sell_transaction_id: string;
  average_cost_basis: Numeric;
  quantity: Numeric;
  calculation_version: string | number;
  created_at: Generated<Date>;
}

export interface PositionCorporateActionApplicationsTable {
  id: Generated<string>;
  position_id: string;
  /** Deterministic UUID derived from the events service's stable action id. */
  corporate_action_id: string;
  corporate_action_version: number;
  signed_action_snapshot: Json;
  token_signature_hash: string;
  ratio_numerator: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  ratio_denominator: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  effective_at: ColumnType<Date, Date | string, Date | string>;
  creation_sequence: Generated<string>;
  fractional_handling: ColumnType<
    'keep_fractional' | 'cash_settlement',
    'keep_fractional' | 'cash_settlement' | undefined,
    'keep_fractional' | 'cash_settlement'
  >;
  applied_by: string;
  applied_at: Generated<Date>;
  reversed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  reversed_by: ColumnType<string | null, string | null | undefined, string | null>;
  reversal_reason: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface PositionTransfersTable {
  id: Generated<string>;
  position_id: string;
  source_portfolio_id: string;
  destination_portfolio_id: string;
  effective_at: ColumnType<Date, Date | string, Date | string>;
  /** 'whole' (legacy reassign/merge) or 'partial' (a subset of open lots moved). */
  kind: ColumnType<'whole' | 'partial', 'whole' | 'partial' | undefined, 'whole' | 'partial'>;
  /** The position the lots landed in (partial moves; nullable for legacy rows). */
  destination_position_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** Informational sum of moved (raw) lot quantities; null for whole moves. */
  transferred_quantity: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  creation_sequence: Generated<string>;
  created_at: Generated<Date>;
}

export interface BookingChangesTable {
  id: Generated<string>;
  user_id: string;
  entity_type: 'transaction' | 'cash_flow' | 'tax_event';
  entity_id: string;
  action: 'created' | 'updated' | 'deleted';
  source: ColumnType<BookingSource, BookingSource | undefined, BookingSource>;
  reason: string | null;
  before: Json | null;
  after: Json | null;
  portfolio_id: string | null;
  position_id: string | null;
  changed_at: Generated<Date>;
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
  'portfolio.tax_events': TaxEventsTable;
  'portfolio.tax_rules': TaxRulesTable;
  'portfolio.user_tax_settings': UserTaxSettingsTable;
  'portfolio.realization_allocations': RealizationAllocationsTable;
  'portfolio.average_cost_realizations': AverageCostRealizationsTable;
  'portfolio.position_transfers': PositionTransfersTable;
  'portfolio.position_corporate_action_applications': PositionCorporateActionApplicationsTable;
  'portfolio.booking_changes': BookingChangesTable;
  'portfolio.watchlist_items': WatchlistItemsTable;
  'portfolio.outbox_events': OutboxEventsTable;
}
