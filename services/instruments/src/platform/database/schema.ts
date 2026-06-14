import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the instruments service. It owns the `instruments.*`
 * tables: shared instrument master data, exchange-specific listings, exchanges,
 * provider-identifier mappings, and supported currencies.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<unknown, string | undefined, string>;

export interface CurrenciesTable {
  code: string;
  name: string;
  symbol: string | null;
  minor_unit: Generated<number>;
}

export interface ExchangesTable {
  id: Generated<string>;
  mic: string;
  name: string;
  timezone: string;
  regular_open_local: string | null;
  regular_close_local: string | null;
  holiday_calendar: Json;
  active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface InstrumentsTable {
  id: Generated<string>;
  name: string;
  asset_type: 'equity' | 'crypto';
  isin: string | null;
  underlying_identifier: string | null;
  primary_listing_id: string | null;
  active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface ListingsTable {
  id: Generated<string>;
  instrument_id: string;
  exchange_id: string | null;
  symbol: string;
  currency: string;
  active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface ListingProviderIdentifiersTable {
  listing_id: string;
  provider: string;
  provider_identifier: string;
  metadata: Json;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface WatchInterestsTable {
  interest_id: string;
  listing_id: string;
  interest_type: 'position' | 'watchlist';
  active: boolean;
  aggregate_version: string | number;
  updated_at: Timestamp;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string | number;
  payload: Json;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Generated<Date>;
  published_at: Date | null;
  attempts: ColumnType<number, number | undefined, number>;
  last_error: string | null;
}

export interface InstrumentsDatabase {
  'instruments.currencies': CurrenciesTable;
  'instruments.exchanges': ExchangesTable;
  'instruments.instruments': InstrumentsTable;
  'instruments.listings': ListingsTable;
  'instruments.listing_provider_identifiers': ListingProviderIdentifiersTable;
  'instruments.watch_interests': WatchInterestsTable;
  'instruments.outbox_events': OutboxEventsTable;
}
