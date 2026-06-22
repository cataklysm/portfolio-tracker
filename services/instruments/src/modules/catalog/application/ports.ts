import type { AssetType } from '../domain/identifiers.js';

export interface ExchangeView {
  id: string;
  mic: string;
  name: string;
  timezone: string;
  regular_open_local: string | null;
  regular_close_local: string | null;
  active: boolean;
}

export interface ListingView {
  id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  exchange_id: string | null;
  exchange_mic: string | null;
  active: boolean;
}

export interface ProviderIdentifierView {
  provider: string;
  provider_identifier: string;
}

/** A single listing with its provider-symbol mappings. */
export interface ListingDetail extends ListingView {
  provider_identifiers: ProviderIdentifierView[];
}

export interface AdminSymbolView extends ListingDetail {
  instrument_name: string;
  asset_type: AssetType;
  isin: string | null;
  in_use: boolean;
  /** Per-capability provider selections for the owning instrument. */
  provider_selections: { capability: string; provider: string }[];
}

export interface AdminSymbolsQuery {
  assetType?: AssetType;
  q?: string;
  limit: number;
  offset: number;
}

export interface AdminSymbolsPage {
  items: AdminSymbolView[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<AssetType, number>;
}

export interface UpdateListingInput {
  symbol?: string;
  currency?: string;
  /** Move the listing to a different exchange (by id). */
  exchangeId?: string;
  providerIdentifiers?: { provider: string; providerIdentifier: string }[];
}

export interface InstrumentView {
  id: string;
  name: string;
  asset_type: AssetType;
  isin: string | null;
  primary_listing_id: string | null;
}

export interface InstrumentWithListings extends InstrumentView {
  listings: ListingView[];
}

/** The denormalized listing summary other services (e.g. portfolio) consume. */
export interface ListingSummary {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  currency: string;
}

/** A curated benchmark catalog entry, resolved to its seeded index listing. */
export interface BenchmarkCatalogEntry {
  key: string;
  name: string;
  region: string | null;
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
}

/** A listing's exchange trading calendar, for market-session computation. */
export interface ListingSessionCalendar {
  listing_id: string;
  mic: string;
  timezone: string;
  open_local: string | null;
  close_local: string | null;
  holidays: string[];
}

/** Listing → provider symbol mapping the market service resolves for refresh. */
export interface ProviderListing {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider_identifier: string | null;
}

export interface CreateExchangeInput {
  mic: string;
  name: string;
  timezone: string;
  regularOpenLocal: string | null;
  regularCloseLocal: string | null;
}

export interface UpdateExchangeInput {
  mic?: string;
  name?: string;
  timezone?: string;
  regularOpenLocal?: string | null;
  regularCloseLocal?: string | null;
  active?: boolean;
  /** Full-closure dates (YYYY-MM-DD) in the exchange's local calendar. */
  holidays?: string[];
}

export interface RegisterListingInput {
  instrument: {
    name: string;
    assetType: AssetType;
    isin: string | null;
  };
  listing: {
    exchangeId: string;
    symbol: string;
    currency: string;
  };
  providerIdentifiers?: { provider: string; providerIdentifier: string }[];
  providerSelections?: { capability: string; provider: string }[];
}

export interface RegisterListingResult {
  instrumentId: string;
  listingId: string;
  created: boolean;
}

export interface CatalogRepository {
  listExchanges(includeInactive?: boolean): Promise<ExchangeView[]>;
  getExchange(id: string): Promise<ExchangeView | null>;
  findExchangeId(idOrMic: { id?: string; mic?: string }): Promise<string | null>;
  createExchange(input: CreateExchangeInput): Promise<{ id: string }>;
  updateExchange(id: string, patch: UpdateExchangeInput): Promise<void>;
  exchangeInUse(id: string): Promise<boolean>;
  deactivateExchange(id: string): Promise<void>;
  currencyExists(code: string): Promise<boolean>;
  searchInstruments(query: string, limit: number): Promise<InstrumentWithListings[]>;
  getInstrument(id: string): Promise<InstrumentWithListings | null>;
  updateInstrument(id: string, patch: { name?: string; isin?: string | null }): Promise<void>;
  getListingsByIds(ids: string[]): Promise<ListingSummary[]>;
  /** The curated benchmark catalog, ordered, each resolved to its index listing. */
  listBenchmarkCatalog(): Promise<BenchmarkCatalogEntry[]>;
  /** Exchange trading calendars for listings that map to an exchange. */
  getListingSessionCalendars(ids: string[]): Promise<ListingSessionCalendar[]>;
  getProviderListings(ids: string[], provider: string): Promise<ProviderListing[]>;
  getListing(id: string): Promise<ListingDetail | null>;
  listAdminSymbols(query: AdminSymbolsQuery): Promise<AdminSymbolsPage>;
  listingInUse(id: string): Promise<boolean>;
  deactivateListing(id: string): Promise<void>;
  /** True if another listing already uses (symbol, exchange) — for edit conflicts. */
  symbolTaken(exchangeId: string | null, symbol: string, excludeListingId: string): Promise<boolean>;
  updateListing(id: string, patch: { symbol?: string; currency?: string; exchangeId?: string }): Promise<void>;
  upsertProviderIdentifiers(
    listingId: string,
    identifiers: { provider: string; providerIdentifier: string }[],
  ): Promise<void>;
  /** Atomic upsert: returns the existing records on a duplicate confirmation. */
  registerListing(input: RegisterListingInput): Promise<RegisterListingResult>;
}
