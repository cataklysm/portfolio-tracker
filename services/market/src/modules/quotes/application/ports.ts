export interface StoredQuotePair {
  latest: string | null;
  previous: string | null;
  currency: string | null;
  latestAt: Date | null;
}

export interface NormalizedQuote {
  listingId: string;
  time: Date;
  provider: string;
  price: string;
  currency: string;
  providerTimestamp: Date | null;
}

/** One day's closing price (the last tick of a UTC calendar day). */
export interface DailyClose {
  date: string;
  price: string;
}

export interface QuoteRepository {
  getLatestPairs(listingIds: string[]): Promise<Map<string, StoredQuotePair>>;
  getSeries(listingId: string, limit: number): Promise<{ time: Date; price: string }[]>;
  /**
   * Daily closing prices over `[from, to]` (one per UTC calendar day), prefixed
   * with the most recent close strictly before `from` so a consumer can
   * forward-fill any date in the range. Ascending by date.
   */
  getDailyCloseSeries(listingId: string, from: string, to: string): Promise<DailyClose[]>;
  upsertQuote(quote: NormalizedQuote): Promise<void>;
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
  series: { timeMs: number; close: string }[];
}

export interface QuoteProvider {
  readonly name: string;
  /**
   * Single symbol with a daily series (used for on-demand refresh + backfill).
   * `from` starts the daily series at that date (else a short default window).
   */
  fetchQuote(providerSymbol: string, from?: Date): Promise<ProviderQuote | null>;
  /**
   * Latest ticks for many symbols in one request (no series). Used by the
   * scheduler so a cycle is one call per chunk, not one per listing. Keyed by
   * the provider symbol passed in.
   */
  fetchQuotes(providerSymbols: string[]): Promise<Map<string, ProviderQuote>>;
}
