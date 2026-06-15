import type { AccountingMethod, LedgerTransaction } from '../domain/realization.js';

/** A position row plus the portfolio it belongs to (ownership already checked). */
export interface PositionRecord {
  id: string;
  portfolio_id: string;
  listing_id: string;
  state: 'open' | 'closed' | 'invalid';
}

export interface NewTransaction {
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  fee: string;
  currency: string;
  effectiveAt: Date;
  taxRelevantValueDate: string;
  bookingFxRate: string | null;
  savingsPlan: boolean;
  note: string | null;
}

export interface StoredTransaction extends LedgerTransaction {
  id: string;
  side: 'buy' | 'sell';
  effective_at: Date;
  creation_sequence: string;
  currency: string;
  tax_relevant_value_date: string;
  savings_plan: boolean;
  note: string | null;
}

/** A buy lot consumed by a sell, ready to persist to realization_allocations. */
export interface PersistedLotAllocation {
  sellTransactionId: string;
  buyTransactionId: string;
  quantity: string;
}

/** A per-sell average-cost realization, ready to persist. */
export interface PersistedAverageCostRealization {
  sellTransactionId: string;
  averageCostBasis: string;
  quantity: string;
}

/** The derived realization to persist alongside a successful recalculation. */
export interface PersistedRealization {
  method: AccountingMethod;
  lotAllocations: PersistedLotAllocation[];
  averageCostRealizations: PersistedAverageCostRealization[];
}

export interface PositionWriteState {
  state: 'open' | 'closed' | 'invalid';
  calculatedValues: unknown | null;
  invalidReason: unknown | null;
  /** Derived allocations to persist on success; null on an invalid recalculation. */
  realization: PersistedRealization | null;
}

/** The persisted realization allocations for a position, at its current version. */
export interface RealizationAllocationView {
  position_id: string;
  accounting_method: AccountingMethod | null;
  calculation_version: string | null;
  lot_allocations: { sell_transaction_id: string; buy_transaction_id: string; quantity: string }[];
  average_cost_realizations: { sell_transaction_id: string; average_cost_basis: string; quantity: string }[];
}

/** A recorded move of a position between portfolios. */
export interface StoredTransfer {
  id: string;
  position_id: string;
  source_portfolio_id: string;
  destination_portfolio_id: string;
  effective_at: Date;
  created_at: Date;
}

export interface TransferInput {
  positionId: string;
  listingId: string;
  sourcePortfolioId: string;
  destinationPortfolioId: string;
  effectiveAt: Date;
}

export interface TransferResult {
  transferId: string;
  /** The surviving position after the move (same id, or the merged-into id). */
  resultingPositionId: string;
  /** True when the destination already held the listing and ledgers were merged. */
  merged: boolean;
}

export interface PositionRepository {
  listPositionsForUser(userId: string, portfolioId?: string): Promise<PositionRecord[]>;
  getOwnedPosition(positionId: string, userId: string): Promise<PositionRecord | null>;
  assertPortfolioOwned(portfolioId: string, userId: string): Promise<boolean>;
  /** The position for (portfolio, listing), if one exists. */
  getPositionByListing(portfolioId: string, listingId: string): Promise<{ id: string } | null>;
  /** Insert or return the existing position for (portfolio, listing). */
  upsertPosition(portfolioId: string, listingId: string): Promise<{ id: string; created: boolean }>;
  /**
   * Moves a position to another portfolio, atomically. If the destination has no
   * position for the listing the position is reassigned; otherwise the source
   * ledger is re-pointed into the destination position (merge) and the empty
   * source position removed. Records the move in `position_transfers`.
   */
  transferPosition(input: TransferInput): Promise<TransferResult>;
  /** Recorded transfers affecting a position, most recent first. */
  listTransfers(positionId: string): Promise<StoredTransfer[]>;
  listTransactions(positionId: string): Promise<StoredTransaction[]>;
  listTransactionsForPositions(positionIds: string[]): Promise<Map<string, StoredTransaction[]>>;
  /** A single transaction by ID (for audit before-snapshots), or null. */
  getTransaction(txId: string): Promise<StoredTransaction | null>;
  insertTransaction(positionId: string, tx: NewTransaction): Promise<{ id: string; aggregateVersion: string }>;
  transactionBelongsToPosition(txId: string, positionId: string): Promise<boolean>;
  updateTransaction(txId: string, tx: NewTransaction): Promise<void>;
  deleteTransaction(txId: string): Promise<void>;
  deletePosition(positionId: string): Promise<void>;
  applyPositionState(positionId: string, write: PositionWriteState): Promise<void>;
  /** The persisted realization allocations for a position, at its current version. */
  getRealizationAllocations(positionId: string): Promise<RealizationAllocationView>;
  /** Writes a position-opened event to the transactional outbox. */
  enqueuePositionOpened(input: {
    positionId: string;
    portfolioId: string;
    listingId: string;
    userId: string;
    aggregateVersion: string;
  }): Promise<void>;
}

export interface ListingSummary {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  name: string;
  asset_type: 'equity' | 'crypto' | 'fund';
  currency: string;
}

export interface ListingReader {
  /**
   * Resolves listing summaries by ID. `bearerToken` is the caller's access
   * token, propagated to the instruments service for the cross-service read.
   */
  getListings(listingIds: string[], bearerToken: string): Promise<Map<string, ListingSummary>>;
}

export interface QuotePair {
  latest: string | null;
  previous: string | null;
  latestAt: Date | null;
  freshness: string | null;
}

/** One day's closing price (last tick of a UTC calendar day). */
export interface DailyClose {
  date: string;
  price: string;
}

export interface QuoteReader {
  getLatestPair(listingIds: string[], bearerToken: string): Promise<Map<string, QuotePair>>;
  getSeries(listingId: string, limit: number, bearerToken: string): Promise<{ time: Date; price: string }[]>;
  /** Daily closes over `[from, to]` (anchor-prefixed, ascending) for historical reporting. */
  getDailyHistory(listingId: string, from: string, to: string, bearerToken: string): Promise<DailyClose[]>;
}

/** A (currency, value date) pair to resolve a historical EUR-based rate for. */
export interface DatedRateRequest {
  currency: string;
  date: string;
}

/** A dated EUR-based rate point (units of currency per 1 EUR) in a series. */
export interface RatePoint {
  date: string;
  rate: string;
}

export interface FxReader {
  /** Latest EUR-based rates (units of currency per 1 EUR) for the given currencies. */
  getEurRates(currencies: string[], bearerToken: string): Promise<Map<string, string>>;
  /**
   * Historical EUR-based rates for specific value dates, keyed `${currency}@${date}`
   * (on-or-before the requested date). EUR is implicit (rate 1) and not returned.
   */
  getEurRatesAt(requests: DatedRateRequest[], bearerToken: string): Promise<Map<string, string>>;
  /**
   * Daily EUR-based rate series per currency over `[from, to]` (anchor-prefixed,
   * ascending). EUR is implicit and never requested. One call covers the whole
   * window instead of one lookup per (currency, day).
   */
  getEurRateSeries(
    currencies: string[],
    from: string,
    to: string,
    bearerToken: string,
  ): Promise<Map<string, RatePoint[]>>;
}

export interface UserSettings {
  reportingCurrency: string;
  accountingMethod: AccountingMethod;
}

export interface SettingsReader {
  getUserSettings(bearerToken: string): Promise<UserSettings>;
}

/** A recorded broker tax event linked to a specific transaction, for the detail view. */
export interface TransactionTaxEvent {
  id: string;
  transaction_id: string | null;
  component: 'capital_income' | 'solidarity' | 'church' | 'foreign_withholding' | 'generic';
  direction: 'withheld' | 'refunded';
  amount: string;
  currency: string;
  booking_date: string;
  note: string | null;
}

export interface TaxEventReader {
  /** Tax events the user owns that are linked to any of the given transactions. */
  listForTransactions(userId: string, transactionIds: string[]): Promise<TransactionTaxEvent[]>;
}
