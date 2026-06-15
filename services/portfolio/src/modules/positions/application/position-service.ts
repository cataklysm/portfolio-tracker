import { AppError } from '@portfolio/platform';
import { computeRealization, type AccountingMethod, type RealizationResult } from '../domain/realization.js';
import type { TransactionPerformanceMetrics } from '../domain/transaction-performance.js';
import { deriveState } from '../domain/position-state.js';
import { safeRecord } from '../../audit/application/record.js';
import type { ChangeLogWriter } from '../../audit/application/ports.js';
import { buildPositionView, buildTransactionPerformance, type PositionView } from './build-position-view.js';
import type {
  DatedRateRequest,
  FxReader,
  ListingReader,
  NewTransaction,
  PersistedRealization,
  PositionRepository,
  QuoteReader,
  RealizationAllocationView,
  SettingsReader,
  StoredTransaction,
  TaxEventReader,
  TransactionTaxEvent,
} from './ports.js';

export interface PositionServiceDeps {
  repo: PositionRepository;
  listings: ListingReader;
  quotes: QuoteReader;
  fx: FxReader;
  settings: SettingsReader;
  taxEvents: TaxEventReader;
  changeLog?: ChangeLogWriter;
}

export interface CreatePositionInput {
  portfolioId: string;
  listingId: string;
  transaction: NewTransaction;
}

export interface PositionDetail extends PositionView {
  transactions: {
    id: string;
    side: 'buy' | 'sell';
    effective_at: string;
    quantity: string;
    price: string;
    fee: string;
    currency: string;
    tax_relevant_value_date: string;
    savings_plan: boolean;
    note: string | null;
    performance: TransactionPerformanceMetrics;
    /** Recorded broker tax events linked to this transaction (empty when none). */
    tax_events: TransactionTaxEvent[];
  }[];
  sparkline: { time: string; price: string }[];
}

const SPARKLINE_POINTS = 60;

/**
 * Use cases for positions and their authoritative transactions. State, cost
 * basis, and P&L are always derived from the ordered ledger; they are never set
 * directly. Cross-service data (listings, quotes, FX, accounting method) is
 * read through ports.
 */
export class PositionService {
  constructor(private readonly deps: PositionServiceDeps) {}

  async listPositions(userId: string, bearerToken: string, portfolioId?: string): Promise<PositionView[]> {
    const positions = await this.deps.repo.listPositionsForUser(userId, portfolioId);
    if (positions.length === 0) return [];

    const listingIds = [...new Set(positions.map((p) => p.listing_id))];
    const positionIds = positions.map((p) => p.id);
    const { reportingCurrency, accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);

    const [listings, quotes, txnsByPosition] = await Promise.all([
      this.deps.listings.getListings(listingIds, bearerToken),
      this.deps.quotes.getLatestPair(listingIds, bearerToken),
      this.deps.repo.listTransactionsForPositions(positionIds),
    ]);

    const currencies = collectCurrencies(listings.values(), reportingCurrency);
    const allTxns = [...txnsByPosition.values()].flat();
    const [eurRates, historicalRates] = await Promise.all([
      this.deps.fx.getEurRates(currencies, bearerToken),
      this.deps.fx.getEurRatesAt(collectDatedRatePairs(allTxns, reportingCurrency), bearerToken),
    ]);

    return positions.map((position) =>
      buildPositionView({
        position,
        transactions: txnsByPosition.get(position.id) ?? [],
        listing: listings.get(position.listing_id),
        quote: quotes.get(position.listing_id),
        eurRates,
        historicalRates,
        reportingCurrency,
        method: accountingMethod,
      }),
    );
  }

  async getPosition(userId: string, bearerToken: string, positionId: string): Promise<PositionDetail> {
    const position = await this.requireOwnedPosition(positionId, userId);
    const { reportingCurrency, accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);

    const [transactions, listings, quotes, series] = await Promise.all([
      this.deps.repo.listTransactions(positionId),
      this.deps.listings.getListings([position.listing_id], bearerToken),
      this.deps.quotes.getLatestPair([position.listing_id], bearerToken),
      this.deps.quotes.getSeries(position.listing_id, SPARKLINE_POINTS, bearerToken),
    ]);

    const listing = listings.get(position.listing_id);
    const currencies = collectCurrencies(listings.values(), reportingCurrency);
    const [eurRates, historicalRates, taxEvents] = await Promise.all([
      this.deps.fx.getEurRates(currencies, bearerToken),
      this.deps.fx.getEurRatesAt(collectDatedRatePairs(transactions, reportingCurrency), bearerToken),
      this.deps.taxEvents.listForTransactions(userId, transactions.map((tx) => tx.id)),
    ]);
    const taxEventsByTransaction = groupByTransaction(taxEvents);

    const viewArgs = {
      position,
      transactions,
      listing,
      quote: quotes.get(position.listing_id),
      eurRates,
      historicalRates,
      reportingCurrency,
      method: accountingMethod,
    };
    const view = buildPositionView(viewArgs);
    const txPerformance = buildTransactionPerformance(viewArgs);
    // An invalid ledger yields no attribution; fall back to an empty record
    // tagged with the user's accounting method so the row renders blank cells.
    const emptyPerformance = emptyTxPerformance(accountingMethod);

    return {
      ...view,
      transactions: transactions.map((tx) =>
        serializeTransaction(tx, txPerformance.get(tx.id) ?? emptyPerformance, taxEventsByTransaction.get(tx.id) ?? []),
      ),
      sparkline: series.map((point) => ({ time: point.time.toISOString(), price: point.price })),
    };
  }

  /**
   * Average open cost per held listing for a user, in the listing's native
   * currency, for the notifications cost-basis alert. Uses average-cost basis
   * (method-agnostic, and a %-from-cost alert is naturally an average measure),
   * so no user token / accounting-method lookup is needed. No quotes involved.
   */
  async getOpenPositionCostBases(userId: string): Promise<{ listing_id: string; avg_cost: string }[]> {
    const positions = (await this.deps.repo.listPositionsForUser(userId)).filter((p) => p.state === 'open');
    if (positions.length === 0) return [];
    const txMap = await this.deps.repo.listTransactionsForPositions(positions.map((p) => p.id));

    const out: { listing_id: string; avg_cost: string }[] = [];
    for (const position of positions) {
      const realization = computeRealization(txMap.get(position.id) ?? [], 'average_cost');
      if (realization.invalid || !realization.openQuantity.gt(0)) continue;
      out.push({
        listing_id: position.listing_id,
        avg_cost: realization.openCostBasis.div(realization.openQuantity).toString(),
      });
    }
    return out;
  }

  async createPosition(
    userId: string,
    bearerToken: string,
    input: CreatePositionInput,
  ): Promise<{ position_id: string; transaction_id: string }> {
    if (input.transaction.side !== 'buy') {
      throw AppError.badRequest('first_transaction_must_be_buy', 'A new position must open with a buy');
    }
    const owned = await this.deps.repo.assertPortfolioOwned(input.portfolioId, userId);
    if (!owned) throw AppError.notFound('portfolio_not_found', 'Portfolio not found');

    const listings = await this.deps.listings.getListings([input.listingId], bearerToken);
    if (!listings.has(input.listingId)) {
      throw AppError.notFound('listing_not_found', 'Listing not found');
    }

    const { id: positionId, created } = await this.deps.repo.upsertPosition(
      input.portfolioId,
      input.listingId,
    );
    const { id: transactionId, aggregateVersion } = await this.deps.repo.insertTransaction(
      positionId,
      input.transaction,
    );

    if (created) {
      await this.deps.repo.enqueuePositionOpened({
        positionId,
        portfolioId: input.portfolioId,
        listingId: input.listingId,
        userId,
        aggregateVersion,
      });
    }

    await this.recalculate(positionId, bearerToken);
    await safeRecord(this.deps.changeLog, {
      userId,
      entityType: 'transaction',
      entityId: transactionId,
      action: 'created',
      after: transactionSnapshot(input.transaction),
      portfolioId: input.portfolioId,
      positionId,
    });
    return { position_id: positionId, transaction_id: transactionId };
  }

  async addTransaction(
    userId: string,
    bearerToken: string,
    positionId: string,
    tx: NewTransaction,
  ): Promise<{ transaction_id: string }> {
    const position = await this.requireOwnedPosition(positionId, userId);

    if (tx.side === 'sell') {
      const { accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);
      const existing = await this.deps.repo.listTransactions(positionId);
      const current = computeRealization(existing, accountingMethod);
      if (current.invalid || current.openQuantity.lt(tx.quantity)) {
        throw AppError.badRequest(
          'sell_exceeds_quantity',
          'The sell quantity exceeds the currently owned quantity',
        );
      }
    }

    const { id } = await this.deps.repo.insertTransaction(position.id, tx);
    await this.recalculate(position.id, bearerToken);
    await safeRecord(this.deps.changeLog, {
      userId,
      entityType: 'transaction',
      entityId: id,
      action: 'created',
      after: transactionSnapshot(tx),
      portfolioId: position.portfolio_id,
      positionId: position.id,
    });
    return { transaction_id: id };
  }

  /**
   * Corrects a transaction. Unlike a new sell command, an edit is accepted even
   * when it makes the ledger inconsistent (e.g. a later sell now exceeds the
   * available quantity); the recalculation then marks the position invalid until
   * the user repairs it.
   */
  async updateTransaction(
    userId: string,
    bearerToken: string,
    positionId: string,
    txId: string,
    tx: NewTransaction,
  ): Promise<{ transaction_id: string }> {
    const position = await this.requireOwnedPosition(positionId, userId);
    await this.requireTransactionInPosition(txId, position.id);
    const before = await this.deps.repo.getTransaction(txId);
    await this.deps.repo.updateTransaction(txId, tx);
    await this.recalculate(position.id, bearerToken);
    await safeRecord(this.deps.changeLog, {
      userId,
      entityType: 'transaction',
      entityId: txId,
      action: 'updated',
      before: before ? storedTransactionSnapshot(before) : null,
      after: transactionSnapshot(tx),
      portfolioId: position.portfolio_id,
      positionId: position.id,
    });
    return { transaction_id: txId };
  }

  /** Deletes a transaction, then re-validates and recalculates the ledger. */
  async deleteTransaction(
    userId: string,
    bearerToken: string,
    positionId: string,
    txId: string,
  ): Promise<void> {
    const position = await this.requireOwnedPosition(positionId, userId);
    await this.requireTransactionInPosition(txId, position.id);
    const before = await this.deps.repo.getTransaction(txId);
    await this.deps.repo.deleteTransaction(txId);
    await this.recalculate(position.id, bearerToken);
    await safeRecord(this.deps.changeLog, {
      userId,
      entityType: 'transaction',
      entityId: txId,
      action: 'deleted',
      before: before ? storedTransactionSnapshot(before) : null,
      portfolioId: position.portfolio_id,
      positionId: position.id,
    });
  }

  /** Permanently deletes the position and all its transactions (cascade). */
  async deletePosition(userId: string, positionId: string): Promise<void> {
    const position = await this.requireOwnedPosition(positionId, userId);
    await this.deps.repo.deletePosition(position.id);
  }

  private async requireTransactionInPosition(txId: string, positionId: string): Promise<void> {
    if (!(await this.deps.repo.transactionBelongsToPosition(txId, positionId))) {
      throw AppError.notFound('transaction_not_found', 'Transaction not found');
    }
  }

  /** Recomputes derived state from the ledger and persists it. */
  private async recalculate(positionId: string, bearerToken: string): Promise<void> {
    const { accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);
    const transactions = await this.deps.repo.listTransactions(positionId);
    const realization = computeRealization(transactions, accountingMethod);
    const state = deriveState(realization);

    if (state === 'invalid') {
      // Retain the last successfully calculated values and allocations; only flag.
      await this.deps.repo.applyPositionState(positionId, {
        state: 'invalid',
        calculatedValues: null,
        invalidReason: { code: 'ledger_inconsistent', reason: 'A sell exceeded available quantity' },
        realization: null,
      });
      return;
    }

    await this.deps.repo.applyPositionState(positionId, {
      state,
      calculatedValues: {
        open_quantity: realization.openQuantity.toFixed(8),
        open_cost_basis: realization.openCostBasis.toFixed(8),
        realized_pnl: realization.realizedPnl.toFixed(8),
        accounting_method: accountingMethod,
      },
      invalidReason: null,
      realization: toPersistedRealization(realization, accountingMethod),
    });
  }

  /** Persisted realization allocations for an owned position (audit/export). */
  async getRealizationAllocations(userId: string, positionId: string): Promise<RealizationAllocationView> {
    await this.requireOwnedPosition(positionId, userId);
    return this.deps.repo.getRealizationAllocations(positionId);
  }

  private async requireOwnedPosition(positionId: string, userId: string) {
    const position = await this.deps.repo.getOwnedPosition(positionId, userId);
    if (!position) throw AppError.notFound('position_not_found', 'Position not found');
    return position;
  }
}

function collectCurrencies(
  listings: Iterable<{ currency: string }>,
  reportingCurrency: string,
): string[] {
  const set = new Set<string>([reportingCurrency]);
  for (const listing of listings) set.add(listing.currency);
  set.delete('EUR');
  return [...set];
}

/**
 * The (currency, value-date) pairs whose historical EUR rate is needed to convert
 * each transaction's realized P&L and fees: the trade currency and the reporting
 * currency, both at the transaction's tax-relevant value date. Deduped (and EUR
 * dropped) by the FX client.
 */
function collectDatedRatePairs(
  transactions: StoredTransaction[],
  reportingCurrency: string,
): DatedRateRequest[] {
  const pairs: DatedRateRequest[] = [];
  for (const tx of transactions) {
    const date = tx.tax_relevant_value_date;
    if (!date) continue;
    pairs.push({ currency: tx.currency, date });
    pairs.push({ currency: reportingCurrency, date });
  }
  return pairs;
}

/** Per-transaction attribution is absent only for an invalid (inconsistent) ledger. */
function emptyTxPerformance(method: AccountingMethod): TransactionPerformanceMetrics {
  return {
    consumed_cost_basis: null,
    realized_pnl: null,
    realized_pnl_reporting: null,
    remaining_quantity: null,
    unrealized_pnl: null,
    unrealized_pnl_reporting: null,
    attribution: method,
  };
}

function serializeTransaction(
  tx: StoredTransaction,
  performance: TransactionPerformanceMetrics,
  taxEvents: TransactionTaxEvent[],
): PositionDetail['transactions'][number] {
  return {
    id: tx.id,
    side: tx.side,
    effective_at: tx.effective_at.toISOString(),
    quantity: tx.quantity,
    price: tx.price,
    fee: tx.fee,
    currency: tx.currency,
    tax_relevant_value_date: tx.tax_relevant_value_date,
    savings_plan: tx.savings_plan,
    note: tx.note,
    performance,
    tax_events: taxEvents,
  };
}

/**
 * Maps the in-memory realization replay to the durable allocation rows. FIFO/LIFO
 * yield per-(sell, buy) lot consumptions; average cost yields per-sell consumed
 * cost basis (basis is pooled, so there is no buy-lot identity to persist).
 */
function toPersistedRealization(r: RealizationResult, method: AccountingMethod): PersistedRealization {
  return {
    method,
    lotAllocations: r.lotConsumptions.map((c) => ({
      sellTransactionId: c.sellTransactionId,
      buyTransactionId: c.buyTransactionId,
      quantity: c.quantity.toFixed(8),
    })),
    averageCostRealizations:
      method === 'average_cost'
        ? r.byTransaction
            .filter((b) => b.side === 'sell' && b.consumedCostBasis !== null && b.consumedQuantity !== null)
            .map((b) => ({
              sellTransactionId: b.transactionId,
              averageCostBasis: b.consumedCostBasis!.toFixed(8),
              quantity: b.consumedQuantity!.toFixed(8),
            }))
        : [],
  };
}

/** Audit snapshot of a submitted transaction (the "after" of a create/update). */
function transactionSnapshot(tx: NewTransaction) {
  return {
    side: tx.side,
    quantity: tx.quantity,
    price: tx.price,
    fee: tx.fee,
    currency: tx.currency,
    effective_at: tx.effectiveAt.toISOString(),
    tax_relevant_value_date: tx.taxRelevantValueDate,
    savings_plan: tx.savingsPlan,
    note: tx.note,
  };
}

/** Audit snapshot of a stored transaction (the "before" of an update/delete). */
function storedTransactionSnapshot(tx: StoredTransaction) {
  return {
    side: tx.side,
    quantity: tx.quantity,
    price: tx.price,
    fee: tx.fee,
    currency: tx.currency,
    effective_at: tx.effective_at.toISOString(),
    tax_relevant_value_date: tx.tax_relevant_value_date,
    savings_plan: tx.savings_plan,
    note: tx.note,
  };
}

/** Groups tax events by their linked transaction ID (skipping unlinked ones). */
function groupByTransaction(events: TransactionTaxEvent[]): Map<string, TransactionTaxEvent[]> {
  const out = new Map<string, TransactionTaxEvent[]>();
  for (const event of events) {
    if (!event.transaction_id) continue;
    const list = out.get(event.transaction_id) ?? [];
    list.push(event);
    out.set(event.transaction_id, list);
  }
  return out;
}

export type { AccountingMethod };
