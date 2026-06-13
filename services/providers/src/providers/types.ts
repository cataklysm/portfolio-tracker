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
  'search',
  'analyst',
  'fundamentals',
  'fx',
  'earnings',
  'corporate_actions',
  'news',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** A latest tick for one symbol (no series). */
export interface QuoteDto {
  symbol: string;
  price: string;
  previousClose: string | null;
  currency: string | null;
  timestampMs: number | null;
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
  symbol: string;
  name: string;
  exchange: string | null;
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
  search?(query: string, limit: number): Promise<SearchResultDto[]>;
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
