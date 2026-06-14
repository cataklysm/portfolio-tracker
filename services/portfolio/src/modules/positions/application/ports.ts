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

export interface PositionRepository {
  listPositionsForUser(userId: string, portfolioId?: string): Promise<PositionRecord[]>;
  getOwnedPosition(positionId: string, userId: string): Promise<PositionRecord | null>;
  assertPortfolioOwned(portfolioId: string, userId: string): Promise<boolean>;
  /** Insert or return the existing position for (portfolio, listing). */
  upsertPosition(portfolioId: string, listingId: string): Promise<{ id: string; created: boolean }>;
  listTransactions(positionId: string): Promise<StoredTransaction[]>;
  listTransactionsForPositions(positionIds: string[]): Promise<Map<string, StoredTransaction[]>>;
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

export interface QuoteReader {
  getLatestPair(listingIds: string[], bearerToken: string): Promise<Map<string, QuotePair>>;
  getSeries(listingId: string, limit: number, bearerToken: string): Promise<{ time: Date; price: string }[]>;
}

/** A (currency, value date) pair to resolve a historical EUR-based rate for. */
export interface DatedRateRequest {
  currency: string;
  date: string;
}

export interface FxReader {
  /** Latest EUR-based rates (units of currency per 1 EUR) for the given currencies. */
  getEurRates(currencies: string[], bearerToken: string): Promise<Map<string, string>>;
  /**
   * Historical EUR-based rates for specific value dates, keyed `${currency}@${date}`
   * (on-or-before the requested date). EUR is implicit (rate 1) and not returned.
   */
  getEurRatesAt(requests: DatedRateRequest[], bearerToken: string): Promise<Map<string, string>>;
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
