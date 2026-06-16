/**
 * A normalized fundamentals snapshot for one instrument, as fetched from the
 * providers service. Ratios are decimals (0.23 == 23%); money is in `currency`.
 * Every field is nullable — provider coverage varies by instrument. Fields
 * beyond the typed snapshot columns are preserved verbatim in `raw`.
 */
export interface FundamentalsSnapshot {
  currency: string | null;
  asOfMs: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  dividendYield: number | null;
  eps: number | null;
  marketCap: number | null;
  revenue: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  sharesOutstanding: number | null;
  netDebt: number | null;
  /** The full provider payload (extra ratios/financials) for transparency. */
  raw: Record<string, unknown>;
}

/** Fetches a fundamentals snapshot from a named provider (via providers service). */
export interface FundamentalsProvider {
  fetchFundamentals(provider: string, providerSymbol: string): Promise<FundamentalsSnapshot | null>;
}

/**
 * One listing in the `fundamentals` refresh plan, resolved by the instruments
 * service to the provider selected for that instrument's fundamentals and that
 * provider's symbol. `provider`/`providerSymbol` are null when unselected/unmapped.
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

/** A stored snapshot as served to readers (strings preserve NUMERIC precision). */
export interface StoredFundamentals {
  instrument_id: string;
  effective_date: string;
  provider: string;
  pe_ratio: string | null;
  pb_ratio: string | null;
  ps_ratio: string | null;
  dividend_yield: string | null;
  eps: string | null;
  market_cap: string | null;
  revenue: string | null;
  revenue_growth: string | null;
  earnings_growth: string | null;
  shares_outstanding: string | null;
  net_debt: string | null;
  raw_payload: unknown;
  created_at: string;
}

/** Input row written to `fundamentals.fundamentals` (decimal-safe strings). */
export interface FundamentalsRow {
  instrumentId: string;
  effectiveDate: string;
  provider: string;
  peRatio: string | null;
  pbRatio: string | null;
  psRatio: string | null;
  dividendYield: string | null;
  eps: string | null;
  marketCap: string | null;
  revenue: string | null;
  revenueGrowth: string | null;
  earningsGrowth: string | null;
  sharesOutstanding: string | null;
  netDebt: string | null;
  rawPayload: Record<string, unknown>;
}

export interface FundamentalsRepository {
  /** Latest snapshot per requested instrument (most recent effective_date). */
  getLatestForInstruments(instrumentIds: string[]): Promise<Map<string, StoredFundamentals>>;
  /** Instrument IDs whose newest snapshot is older than `before` (or missing). */
  selectStaleInstruments(instrumentIds: string[], before: Date): Promise<string[]>;
  /** Idempotent upsert on (instrument_id, effective_date, provider). */
  upsert(row: FundamentalsRow): Promise<void>;
}

/** Writes a `fundamentals.snapshot.updated` event to the transactional outbox. */
export interface FundamentalsEventStore {
  enqueueSnapshotUpdated(input: { instrumentId: string; currency: string | null; effectiveDate: string }): Promise<void>;
}
