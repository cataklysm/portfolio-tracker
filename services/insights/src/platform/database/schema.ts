import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the insights service. It owns the `insights.*` tables:
 * fair-value estimates (user-owned DCF models + global analyst values) and
 * price targets (user-owned target zones + global analyst/technical targets).
 * NUMERIC columns are returned as strings (see platform `createDatabase`).
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<unknown, string | undefined, string>;
type Numeric = ColumnType<string, string | number, string | number>;

export interface FairValueEstimatesTable {
  id: Generated<string>;
  instrument_id: string;
  /** NULL for a global analyst estimate; set for a user-owned DCF model. */
  user_id: string | null;
  method: 'dcf' | 'analyst';
  value: Numeric;
  currency: string;
  assumptions: Json;
  effective_date: ColumnType<Date, string, string>;
  source: string | null;
  /** NULL = current; set when a newer analyst value superseded this row. */
  superseded_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
}

export interface PriceTargetsTable {
  id: Generated<string>;
  instrument_id: string;
  listing_id: string | null;
  /** NULL for a global analyst/technical target; set for an own target. */
  user_id: string | null;
  horizon: 'short' | 'medium' | 'long';
  source: 'own' | 'analyst' | 'technical';
  zone_low: Numeric | null;
  zone_high: Numeric | null;
  currency: string;
  effective_date: ColumnType<Date, string | undefined, string>;
  note: string | null;
  /** NULL = current; set when a newer analyst zone superseded this row. */
  superseded_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface SuppressedAnalystPriceTargetsTable {
  instrument_id: string;
  deleted_by: string | null;
  deleted_at: Timestamp;
}

export interface InsightsDatabase {
  'insights.fair_value_estimates': FairValueEstimatesTable;
  'insights.price_targets': PriceTargetsTable;
  'insights.suppressed_analyst_price_targets': SuppressedAnalystPriceTargetsTable;
}
