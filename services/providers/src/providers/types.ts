/**
 * Provider-agnostic contracts. Every external data source is wrapped in a
 * `MarketDataProvider` that declares which capabilities it supports and returns
 * these normalized DTOs — no vendor-specific shape ever leaves a provider. A
 * new source (e.g. EODHD) is a pure drop-in: implement the interface, declare
 * its capabilities, register it.
 *
 * Monetary/price fields are decimal-safe strings; ratios and statistics are
 * plain numbers (lossy by nature). Timestamps are epoch milliseconds.
 */

export const CAPABILITIES = [
  'quotes',
  'chart',
  'symbol_search',
  'analyst',
  'fundamentals',
  'fx',
  'earnings',
  'corporate_actions',
  'news',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Provider class. `symbol` providers are symbol-based (quotes/chart/…) and MUST
 * implement `symbol_search`; `reference` providers are reference-data/FX sources
 * (e.g. ECB) for which symbol search is meaningless and not required.
 */
export type ProviderClass = 'symbol' | 'reference';

/** Static, admin-assigned data-quality grade. Informational only — never routes. */
export type DataQuality = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Admin-editable, provider-intrinsic settings persisted in
 * `providers.provider_settings`. Loaded at startup and attached to each
 * registered provider. Pacing fields are consumed by the market refresh
 * scheduler; `maxBatchSize === null` means the provider only accepts single-symbol
 * queries and must be throttled rather than batched.
 */
export interface ProviderSettings {
  provider: string;
  enabled: boolean;
  providerClass: ProviderClass;
  dataQuality: DataQuality;
  capabilityQuality: Partial<Record<Capability, DataQuality>>;
  maxBatchSize: number | null;
  rateLimitPerMin: number | null;
  maxConcurrency: number;
}

/**
 * Admin-editable fields of a provider's settings. `providerClass` is *not*
 * editable — it is intrinsic to the adapter implementation. Pacing fields accept
 * `null` to mean "unset" (single-symbol / no limit).
 */
export interface ProviderSettingsUpdate {
  enabled?: boolean;
  dataQuality?: DataQuality;
  capabilityQuality?: Partial<Record<Capability, DataQuality>>;
  maxBatchSize?: number | null;
  rateLimitPerMin?: number | null;
  maxConcurrency?: number;
}

/**
 * Per-(provider × capability) refresh cadence, persisted in
 * `providers.provider_capability_refresh`. `refreshIntervalMs` is a freshness
 * threshold: a listing/instrument is only re-fetched once its newest stored datum
 * is at least this old. `saveResolutionMs` applies to `quotes` only — the intraday
 * series is downsampled to at most one stored point per this span.
 */
export interface CapabilityRefresh {
  provider: string;
  capability: string;
  refreshIntervalMs: number;
  saveResolutionMs: number | null;
  enabled: boolean;
}

/** Admin-editable fields of a capability-refresh row (upserted). */
export interface CapabilityRefreshUpdate {
  refreshIntervalMs?: number;
  saveResolutionMs?: number | null;
  enabled?: boolean;
}

/** A latest tick for one symbol, optionally with the provider's intraday series. */
export interface QuoteDto {
  symbol: string;
  price: string;
  previousClose: string | null;
  currency: string | null;
  timestampMs: number | null;
  /**
   * Intraday points the provider returned alongside the latest tick, oldest
   * first. Providers with a real intraday feed (e.g. lstc) populate this so the
   * caller can downsample and store finer-grained history than the poll cadence;
   * latest-only providers (e.g. yahoo's batch endpoint) omit it.
   */
  series?: { timeMs: number; close: string }[];
}

/** Latest price plus a daily-close series for one symbol. */
export interface ChartDto {
  price: string;
  previousClose: string | null;
  currency: string | null;
  timestampMs: number | null;
  series: { timeMs: number; close: string }[];
}

export interface SearchResultDto {
  /** The provider's own symbol for this result — what gets stored as the
   *  per-listing provider identifier (e.g. Yahoo `SAP.DE`). */
  symbol: string;
  name: string;
  /** Human-readable exchange label as the provider reports it (e.g. "XETRA"). */
  exchange: string | null;
  /** Official market identifier code, when the provider supplies one (else null —
   *  Yahoo, for instance, does not expose MICs). */
  mic: string | null;
  /** Quote currency, when known. */
  currency: string | null;
  quoteType: string | null;
}

/** Analyst consensus; prices in the symbol's quote currency. */
export interface AnalystDto {
  targetLow: number | null;
  targetHigh: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
}

/** Fundamentals snapshot; ratios are decimals, money is in `currency`. */
export interface FundamentalsDto {
  currency: string | null;
  asOfMs: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  sharesOutstanding: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  pegRatio: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  bookValue: number | null;
  beta: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  grossMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  totalRevenue: number | null;
  ebitda: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashflow: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
}

/** EUR-based daily reference rates for one publication date. */
export interface FxDailyDto {
  /** Publication date (YYYY-MM-DD). */
  date: string;
  /** Quote currency -> rate (units per 1 EUR). */
  rates: Record<string, string>;
}

export interface FxRatesDto {
  base: 'EUR';
  daily: FxDailyDto | null;
  /** Rolling recent history, most recent first (for last-available fallback). */
  history: FxDailyDto[];
}

/** One reported or upcoming earnings period; EPS/revenue in the instrument currency. */
export interface EarningsPeriodDto {
  periodEndMs: number | null;
  reportDateMs: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprisePct: number | null;
  currency: string | null;
}

export interface EarningsDto {
  history: EarningsPeriodDto[];
  upcoming: EarningsPeriodDto | null;
}

/** A dividend or split — an objective market fact, independent of holdings. */
export interface CorporateActionDto {
  kind: 'dividend' | 'split';
  dateMs: number;
  amount: number | null;
  numerator: number | null;
  denominator: number | null;
}

export interface NewsItemDto {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedAtMs: number | null;
}

/**
 * A market-data source behind a uniform interface. Capability methods are
 * optional: a provider implements only what it declares in `capabilities`, and
 * the registry never routes a capability to a provider that lacks it — so an
 * unsupported feature is a routing decision, not a thrown error.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;

  /** Latest ticks for many symbols in one call, keyed by provider symbol. */
  fetchQuotes?(symbols: string[]): Promise<Map<string, QuoteDto>>;
  /** Single symbol with a daily series; `from` starts the series (backfill). */
  fetchChart?(symbol: string, from?: Date): Promise<ChartDto | null>;
  /** Symbol search. Required for `symbol`-class providers; absent on `reference`/FX. */
  searchSymbols?(query: string, limit: number): Promise<SearchResultDto[]>;
  fetchAnalyst?(symbol: string): Promise<AnalystDto | null>;
  fetchFundamentals?(symbol: string): Promise<FundamentalsDto | null>;
  fetchFxRates?(): Promise<FxRatesDto>;
  fetchEarnings?(symbol: string): Promise<EarningsDto | null>;
  fetchCorporateActions?(symbol: string): Promise<CorporateActionDto[]>;
  fetchNews?(symbol: string): Promise<NewsItemDto[]>;
}

export function supports(provider: MarketDataProvider, capability: Capability): boolean {
  return provider.capabilities.has(capability);
}
