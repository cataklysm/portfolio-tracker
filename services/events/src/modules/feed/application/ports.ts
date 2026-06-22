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
  fetchEarnings(provider: string, symbol: string): Promise<EarningsSnapshot | null>;
  fetchCorporateActions(provider: string, symbol: string): Promise<CorporateActionInput[]>;
  fetchNews(provider: string, symbol: string): Promise<NewsItem[]>;
}

/**
 * One listing in a refresh plan, resolved by the instruments service to the
 * provider selected for the instrument and that provider's symbol.
 * `provider`/`providerSymbol` are null when unselected/unmapped.
 */
export interface PlanListing {
  listingId: string;
  instrumentId: string;
  currency: string;
  provider: string | null;
  providerSymbol: string | null;
}

export interface PlanResolver {
  resolve(capability: string, listingIds?: string[]): Promise<PlanListing[]>;
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

/** The next upcoming reported-earnings date for an instrument. */
export interface UpcomingEarnings {
  instrument_id: string;
  report_date: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface EarningsQuery {
  instrumentIds: string[];
  isUpcoming?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}

export interface CorporateActionsQuery {
  instrumentIds: string[];
  types?: CorporateActionType[];
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}

export type CorporateActionType = 'split' | 'reverse_split' | 'dividend' | 'buyback' | 'spinoff' | 'capital_increase';

export interface EarningsRepository {
  upsert(rows: EarningsRow[]): Promise<void>;
  listByInstrument(instrumentId: string): Promise<StoredEarnings[]>;
  query(input: EarningsQuery): Promise<Page<StoredEarnings>>;
  /** Earliest not-yet-reported earnings (report_date >= today) per instrument. */
  listUpcomingForInstruments(instrumentIds: string[]): Promise<UpcomingEarnings[]>;
}

export interface CorporateActionsRepository {
  upsert(rows: CorporateActionRow[]): Promise<void>;
  listByInstrument(instrumentId: string): Promise<StoredCorporateAction[]>;
  query(input: CorporateActionsQuery): Promise<Page<StoredCorporateAction>>;
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
