/**
 * Normalized provider snapshots (already provider-agnostic; fetched via the
 * providers service). Times are epoch ms; money is in the instrument currency.
 */
export interface EarningsPeriod {
  periodEndMs: number | null;
  reportDateMs: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprisePct: number | null;
  currency: string | null;
}

export interface EarningsSnapshot {
  history: EarningsPeriod[];
  upcoming: EarningsPeriod | null;
}

export interface CorporateActionInput {
  kind: 'dividend' | 'split';
  dateMs: number;
  amount: number | null;
  numerator: number | null;
  denominator: number | null;
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedAtMs: number | null;
}

/** Fetches event data for a provider symbol (via the providers service). */
export interface EventsProvider {
  readonly name: string;
  fetchEarnings(symbol: string): Promise<EarningsSnapshot | null>;
  fetchCorporateActions(symbol: string): Promise<CorporateActionInput[]>;
  fetchNews(symbol: string): Promise<NewsItem[]>;
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

// ---- Storage rows (decimal-safe strings) ------------------------------------

export interface EarningsRow {
  instrumentId: string;
  fiscalYear: number;
  fiscalQuarter: number | null;
  periodEndDate: string | null;
  reportDate: string | null;
  epsEstimate: string | null;
  epsActual: string | null;
  revenueEstimate: string | null;
  revenueActual: string | null;
  surprisePct: string | null;
  provider: string;
  rawPayload: Record<string, unknown>;
}

export interface CorporateActionRow {
  stableActionId: string;
  version: number;
  instrumentId: string;
  type: 'split' | 'reverse_split' | 'dividend';
  exDate: string;
  ratioNumerator: string | null;
  ratioDenominator: string | null;
  dividendAmount: string | null;
  dividendCurrency: string | null;
  provider: string;
  rawPayload: Record<string, unknown>;
}

export interface NewsRow {
  instrumentId: string;
  publishedAt: string;
  provider: string;
  headline: string;
  url: string | null;
  rawPayload: Record<string, unknown>;
}

// ---- Stored views (served to readers) ---------------------------------------

export interface StoredEarnings {
  instrument_id: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string | null;
  report_date: string | null;
  eps_estimate: string | null;
  eps_actual: string | null;
  revenue_estimate: string | null;
  revenue_actual: string | null;
  surprise_pct: string | null;
  provider: string;
  is_upcoming: boolean;
}

export interface StoredCorporateAction {
  stable_action_id: string;
  version: number;
  instrument_id: string;
  type: string;
  ex_date: string;
  ratio_numerator: string | null;
  ratio_denominator: string | null;
  dividend_amount: string | null;
  dividend_currency: string | null;
  provider: string;
}

export interface StoredNews {
  id: string;
  instrument_id: string | null;
  published_at: string;
  provider: string;
  headline: string;
  url: string | null;
  sentiment: string | null;
}

// ---- Repositories -----------------------------------------------------------

export interface EarningsRepository {
  upsert(rows: EarningsRow[]): Promise<void>;
  listByInstrument(instrumentId: string): Promise<StoredEarnings[]>;
}

export interface CorporateActionsRepository {
  upsert(rows: CorporateActionRow[]): Promise<void>;
  listByInstrument(instrumentId: string): Promise<StoredCorporateAction[]>;
}

export interface NewsRepository {
  /** Idempotent on (instrument_id, url); inserts new items only. */
  upsert(rows: NewsRow[]): Promise<void>;
  listByInstrument(instrumentId: string, limit: number): Promise<StoredNews[]>;
}

export interface RefreshStateRepository {
  /** Instrument IDs not refreshed since `before` (or never). */
  selectStaleInstruments(instrumentIds: string[], before: Date): Promise<string[]>;
  markRefreshed(instrumentIds: string[]): Promise<void>;
}

export interface EventsEventStore {
  enqueueEventsUpdated(input: { instrumentId: string }): Promise<void>;
}
