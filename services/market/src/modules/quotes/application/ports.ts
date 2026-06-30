export interface StoredQuotePair {
  latest: string | null;
  previous: string | null;
  currency: string | null;
  latestAt: Date | null;
  /** When the latest stored quote row was fetched/stored by this system. */
  retrievedAt: Date | null;
  /** The provider that supplied the latest tick (for attribution). */
  provider: string | null;
  /** The provider's own timestamp for the latest tick, when supplied. */
  providerTimestamp: Date | null;
}

export interface NormalizedQuote {
  listingId: string;
  time: Date;
  provider: string;
  price: string;
  /** Traded volume for this point; null when the provider doesn't supply it. */
  volume: string | null;
  currency: string;
  providerTimestamp: Date | null;
}

/** One day's closing price (the last tick of a UTC calendar day). */
export interface DailyClose {
  date: string;
  price: string;
  /** Traded volume of the day's last tick, when available. */
  volume: string | null;
}

/** Highest/lowest stored price over a window; all null when the window has no data. */
export interface PriceRange {
  high: string | null;
  low: string | null;
  /** When the high was observed (most recent occurrence on ties); null when empty. */
  highAt: Date | null;
  /** When the low was observed (most recent occurrence on ties); null when empty. */
  lowAt: Date | null;
}

/**
 * Daily/weekly/monthly/yearly price extremes for a listing, derived from stored
 * quotes. `daily` is the current UTC calendar day (today's range); the others are
 * trailing windows ending now (7 days / 1 month / 1 year — `yearly` is the
 * 52-week range). The granularity of each extreme follows the stored data: an
 * intraday range for providers with a minute feed, daily closes otherwise.
 */
export interface PriceRanges {
  /** Currency of the listing's latest stored tick; null when no quote is stored. */
  currency: string | null;
  /** When the ranges were computed (server now). */
  asOf: Date;
  daily: PriceRange;
  weekly: PriceRange;
  monthly: PriceRange;
  yearly: PriceRange;
}

export interface QuoteRepository {
  getLatestPairs(listingIds: string[]): Promise<Map<string, StoredQuotePair>>;
  getSeries(listingId: string, limit: number): Promise<{ time: Date; price: string; volume: string | null }[]>;
  /**
   * Daily closing prices over `[from, to]` (one per UTC calendar day), prefixed
   * with the most recent close strictly before `from` so a consumer can
   * forward-fill any date in the range. Ascending by date.
   */
  getDailyCloseSeries(listingId: string, from: string, to: string): Promise<DailyClose[]>;
  /** Highest/lowest stored price for the daily/weekly/monthly/yearly windows. */
  getPriceRanges(listingId: string): Promise<PriceRanges>;
  upsertQuote(quote: NormalizedQuote): Promise<void>;
  /** Deletes all stored quotes for the given listings (for provider-switch rebuilds). */
  purgeListings(listingIds: string[]): Promise<number>;
  /** Deletes stored quotes at or after `since` for the given listings (intraday session rebuild). */
  purgeListingsSince(listingIds: string[], since: Date): Promise<number>;
}

export interface QuoteUpdatedEvent {
  provider: string;
  listingIds: string[];
  asOf: string;
}

/** Writes quote update events to the transactional outbox. */
export interface QuoteEventStore {
  enqueueQuotesUpdated(input: QuoteUpdatedEvent): Promise<void>;
}

/** Provider symbol + currency a listing maps to (resolved from instruments). */
export interface ResolvedListing {
  listingId: string;
  instrumentId: string;
  symbol: string;
  currency: string;
  providerSymbol: string;
}

export interface ListingResolver {
  resolve(listingIds: string[], provider: string): Promise<Map<string, ResolvedListing>>;
}

/** A provider quote, already normalized away from provider-specific shapes. */
export interface ProviderQuote {
  price: string;
  previousClose: string | null;
  currency: string | null;
  timestampMs: number | null;
  series: { timeMs: number; close: string; volume: string | null }[];
}

/**
 * Fetches market data from a named provider via the providers service. Provider
 * is a parameter (not a fixed `.name`) because the selected provider now varies
 * per instrument — the caller resolves it from the instruments refresh plan.
 */
export interface QuoteProvider {
  /**
   * Single symbol with a daily series (used for on-demand refresh + backfill).
   * `from` starts the daily series at that date (else a short default window).
   */
  fetchQuote(provider: string, providerSymbol: string, from?: Date): Promise<ProviderQuote | null>;
  /**
   * Latest ticks for many symbols from one provider in one request (no series).
   * Used by the scheduler so a cycle is one call per chunk, not one per listing.
   * Keyed by the provider symbol passed in.
   */
  fetchQuotes(provider: string, providerSymbols: string[]): Promise<Map<string, ProviderQuote>>;
}

/**
 * One listing in a capability's refresh plan, resolved by the instruments
 * service: the listing joined to the provider selected for that capability and
 * that provider's own symbol. `provider`/`providerSymbol` are null when no
 * provider is selected or no symbol is mapped — such listings cannot be fetched.
 */
/** Exchange-local market status, as reported by the instruments refresh plan. */
export type MarketStatus = 'open' | 'closed' | 'holiday' | 'weekend' | 'unknown';

export interface PlanListing {
  listingId: string;
  instrumentId: string;
  symbol: string;
  currency: string;
  provider: string | null;
  providerSymbol: string | null;
  /**
   * Current market status of the listing's exchange. The scheduled sweep skips
   * definitively-closed listings (`closed`/`weekend`/`holiday`); `open`/`unknown`
   * (and absent) are refreshed. On-demand refresh ignores this.
   */
  marketStatus?: MarketStatus;
  /**
   * Minutes since the exchange closed today (post-close on a trading day), else
   * null/absent. Drives the one-shot "catch the close" fetch: shortly after close
   * the sweep fetches once more to capture the daily close. On-demand ignores it.
   */
  minutesSinceClose?: number | null;
}

export interface RefreshPlanResolver {
  /** The refresh plan for a capability, optionally restricted to specific listings. */
  resolve(capability: string, listingIds?: string[]): Promise<PlanListing[]>;
}
