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

export interface PositionWriteState {
  state: 'open' | 'closed' | 'invalid';
  calculatedValues: unknown | null;
  invalidReason: unknown | null;
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
  asset_type: 'equity' | 'crypto';
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

export interface FxReader {
  /** Latest EUR-based rates (units of currency per 1 EUR) for the given currencies. */
  getEurRates(currencies: string[], bearerToken: string): Promise<Map<string, string>>;
}

export interface UserSettings {
  reportingCurrency: string;
  accountingMethod: AccountingMethod;
}

export interface SettingsReader {
  getUserSettings(bearerToken: string): Promise<UserSettings>;
}
