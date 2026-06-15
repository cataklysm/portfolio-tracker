import Decimal from 'decimal.js';
import { AppError } from '@portfolio/platform';
import { computeRealization, type AccountingMethod, type RealizationResult, type SplitAdjustment } from '../domain/realization.js';
import type { TransactionPerformanceMetrics } from '../domain/transaction-performance.js';
import { deriveState } from '../domain/position-state.js';
import type { CorporateActionReader } from './ports.js';
import { buildPositionView, buildTransactionPerformance, type PositionView } from './build-position-view.js';
import type {
  DatedRateRequest,
  FxReader,
  ListingReader,
  NewTransaction,
  PersistedRealization,
  PositionRecord,
  PositionRepository,
  QuoteReader,
  RealizationAllocationView,
  SettingsReader,
  StoredTransaction,
  StoredTransfer,
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
  /** Active split applications to replay in re-derivation (corporate actions). */
  corporateActions?: CorporateActionReader;
}

export interface CreatePositionInput {
  portfolioId: string;
  listingId: string;
  transaction: NewTransaction;
}

/** A recorded position transfer, serialized for the API. */
export interface SerializedTransfer {
  id: string;
  position_id: string;
  source_portfolio_id: string;
  destination_portfolio_id: string;
  effective_at: string;
  kind: 'whole' | 'partial';
  destination_position_id: string | null;
  transferred_quantity: string | null;
  created_at: string;
}

function serializeTransfer(transfer: StoredTransfer): SerializedTransfer {
  return {
    id: transfer.id,
    position_id: transfer.position_id,
    source_portfolio_id: transfer.source_portfolio_id,
    destination_portfolio_id: transfer.destination_portfolio_id,
    effective_at: transfer.effective_at.toISOString(),
    kind: transfer.kind,
    destination_position_id: transfer.destination_position_id,
    transferred_quantity: transfer.transferred_quantity,
    created_at: transfer.created_at.toISOString(),
  };
}

/** One position's authoritative ledger plus its listing's native currency. */
export interface PositionLedger {
  listingId: string;
  listingCurrency: string;
  transactions: StoredTransaction[];
  /** Active split adjustments to replay for this position. */
  splits: SplitAdjustment[];
  /**
   * Half-open `[from, to)` ownership windows (YYYY-MM-DD, null = unbounded) during
   * which the queried portfolio owned this position. Undefined = always owned
   * (no transfers, or the combined view) — the reconstruction then never clips.
   */
  ownershipWindows?: { from: string | null; to: string | null }[];
}

/** Every position ledger for a scope, with the reporting currency and method. */
export interface PositionLedgers {
  reportingCurrency: string;
  method: AccountingMethod;
  ledgers: PositionLedger[];
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
    const [eurRates, historicalRates, splitsByPosition] = await Promise.all([
      this.deps.fx.getEurRates(currencies, bearerToken),
      this.deps.fx.getEurRatesAt(collectDatedRatePairs(allTxns, reportingCurrency), bearerToken),
      this.activeSplits(positionIds),
    ]);
    const today = todayIso();

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
        splits: splitsByPosition.get(position.id) ?? [],
        asOf: today,
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
    const [eurRates, historicalRates, taxEvents, splitsByPosition] = await Promise.all([
      this.deps.fx.getEurRates(currencies, bearerToken),
      this.deps.fx.getEurRatesAt(collectDatedRatePairs(transactions, reportingCurrency), bearerToken),
      this.deps.taxEvents.listForTransactions(userId, transactions.map((tx) => tx.id)),
      this.activeSplits([position.id]),
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
      splits: splitsByPosition.get(position.id) ?? [],
      asOf: todayIso(),
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
    const positionIds = positions.map((p) => p.id);
    const [txMap, splitsByPosition] = await Promise.all([
      this.deps.repo.listTransactionsForPositions(positionIds),
      this.activeSplits(positionIds),
    ]);
    const asOf = todayIso();

    const out: { listing_id: string; avg_cost: string }[] = [];
    for (const position of positions) {
      // Replay any applied splits so the open quantity (and hence per-share avg
      // cost) is restated to today's share count, matching the live snapshot.
      const realization = computeRealization(
        txMap.get(position.id) ?? [],
        'average_cost',
        splitsByPosition.get(position.id) ?? [],
        asOf,
      );
      if (realization.invalid || !realization.openQuantity.gt(0)) continue;
      out.push({
        listing_id: position.listing_id,
        avg_cost: realization.openCostBasis.div(realization.openQuantity).toString(),
      });
    }
    return out;
  }

  /**
   * Raw position ledgers for a user (optionally one portfolio), with each
   * listing's native currency and the user's accounting method — the inputs the
   * historical performance series replays. No quotes/FX are read here; the
   * reporting service fetches the date-ranged price and FX history it needs.
   */
  async listPositionLedgers(
    userId: string,
    bearerToken: string,
    portfolioId?: string,
  ): Promise<PositionLedgers> {
    const { reportingCurrency, accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);

    // Resolve the position set + per-portfolio ownership windows. The combined view
    // (no portfolioId) takes every position with no clipping. A single-portfolio
    // view additionally pulls in positions that were *transferred out* (for the
    // pre-transfer period) and clips each position to the windows the portfolio
    // actually owned it — so history follows the holding across whole transfers.
    const selected = await this.selectLedgerPositions(userId, portfolioId);
    if (selected.length === 0) {
      return { reportingCurrency, method: accountingMethod, ledgers: [] };
    }

    const listingIds = [...new Set(selected.map((s) => s.position.listing_id))];
    const [listings, txnsByPosition, splitsByPosition] = await Promise.all([
      this.deps.listings.getListings(listingIds, bearerToken),
      this.deps.repo.listTransactionsForPositions(selected.map((s) => s.position.id)),
      this.activeSplits(selected.map((s) => s.position.id)),
    ]);
    const ledgers = selected.map(({ position, ownershipWindows }) => ({
      listingId: position.listing_id,
      listingCurrency: listings.get(position.listing_id)?.currency ?? 'EUR',
      transactions: txnsByPosition.get(position.id) ?? [],
      splits: splitsByPosition.get(position.id) ?? [],
      ownershipWindows,
    }));
    return { reportingCurrency, method: accountingMethod, ledgers };
  }

  /**
   * The positions contributing to a scope's series, each with the ownership
   * windows relative to the queried portfolio. Combined view: all positions,
   * windows undefined. Single portfolio: positions it owns now or owned before a
   * whole transfer out, with windows derived from each position's transfer chain.
   */
  private async selectLedgerPositions(
    userId: string,
    portfolioId?: string,
  ): Promise<{ position: PositionRecord; ownershipWindows?: { from: string | null; to: string | null }[] }[]> {
    if (!portfolioId) {
      const all = await this.deps.repo.listPositionsForUser(userId);
      return all.map((position) => ({ position }));
    }

    const [allPositions, wholeTransfers] = await Promise.all([
      this.deps.repo.listPositionsForUser(userId),
      this.deps.repo.listWholeTransfersForUser(userId),
    ]);
    const byPosition = new Map<string, typeof wholeTransfers>();
    for (const t of wholeTransfers) {
      const list = byPosition.get(t.positionId) ?? [];
      list.push(t);
      byPosition.set(t.positionId, list);
    }

    const out: { position: PositionRecord; ownershipWindows?: { from: string | null; to: string | null }[] }[] = [];
    for (const position of allPositions) {
      const transfers = byPosition.get(position.id);
      if (!transfers || transfers.length === 0) {
        // No transfers: owned by its current portfolio throughout — include only
        // when that is the queried portfolio, with no clipping.
        if (position.portfolio_id === portfolioId) out.push({ position });
        continue;
      }
      const windows = ownershipWindowsFor(transfers, portfolioId);
      if (windows.length > 0) out.push({ position, ownershipWindows: windows });
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
    const listing = listings.get(input.listingId);
    if (!listing) {
      throw AppError.notFound('listing_not_found', 'Listing not found');
    }
    // Index listings are non-holdable benchmark references (spec §2.2); hold the
    // corresponding fund/ETF listing instead.
    if (listing.asset_type === 'index') {
      throw AppError.badRequest('index_not_holdable', 'Index listings are benchmark references and cannot be held');
    }

    const { id: positionId, created } = await this.deps.repo.upsertPosition(
      input.portfolioId,
      input.listingId,
    );
    const { id: transactionId, aggregateVersion } = await this.deps.repo.insertTransaction(
      positionId,
      input.transaction,
      (result) => ({
        userId,
        entityType: 'transaction',
        entityId: result.id,
        action: 'created',
        after: transactionSnapshot(input.transaction),
        portfolioId: input.portfolioId,
        positionId,
      }),
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

    const { id } = await this.deps.repo.insertTransaction(position.id, tx, (result) => ({
      userId,
      entityType: 'transaction',
      entityId: result.id,
      action: 'created',
      after: transactionSnapshot(tx),
      portfolioId: position.portfolio_id,
      positionId: position.id,
    }));
    await this.recalculate(position.id, bearerToken);
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
    await this.deps.repo.updateTransaction(txId, tx, () => ({
      userId,
      entityType: 'transaction',
      entityId: txId,
      action: 'updated',
      before: before ? storedTransactionSnapshot(before) : null,
      after: transactionSnapshot(tx),
      portfolioId: position.portfolio_id,
      positionId: position.id,
    }));
    await this.recalculate(position.id, bearerToken);
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
    await this.deps.repo.deleteTransaction(txId, () => ({
      userId,
      entityType: 'transaction',
      entityId: txId,
      action: 'deleted',
      before: before ? storedTransactionSnapshot(before) : null,
      portfolioId: position.portfolio_id,
      positionId: position.id,
    }));
    await this.recalculate(position.id, bearerToken);
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

  /** Public recalculation hook for sibling write workflows (e.g. corporate actions). */
  async recalculatePosition(positionId: string, bearerToken: string): Promise<void> {
    await this.recalculate(positionId, bearerToken);
  }

  /** Active split adjustments per position (empty when no corporate-action reader is wired). */
  private async activeSplits(positionIds: string[]): Promise<Map<string, SplitAdjustment[]>> {
    if (!this.deps.corporateActions || positionIds.length === 0) return new Map();
    return this.deps.corporateActions.activeSplitsForPositions(positionIds);
  }

  /** Recomputes derived state from the ledger and persists it. */
  private async recalculate(positionId: string, bearerToken: string): Promise<void> {
    const { accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);
    const transactions = await this.deps.repo.listTransactions(positionId);
    const splits = (await this.activeSplits([positionId])).get(positionId) ?? [];
    const realization = computeRealization(transactions, accountingMethod, splits, todayIso());
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

  /**
   * Moves a position (with its full ledger) to another portfolio the user owns,
   * preserving cost basis and history. If the destination already holds the
   * listing the two ledgers merge into one position; otherwise the position is
   * reassigned. Derived state is recomputed for the surviving position.
   */
  async transferPosition(
    userId: string,
    bearerToken: string,
    positionId: string,
    input: { destinationPortfolioId: string; effectiveAt?: Date },
  ): Promise<{ transfer_id: string; position_id: string; merged: boolean }> {
    const position = await this.requireOwnedPosition(positionId, userId);
    if (position.portfolio_id === input.destinationPortfolioId) {
      throw AppError.badRequest('transfer_same_portfolio', 'The position is already in that portfolio');
    }
    const ownsDestination = await this.deps.repo.assertPortfolioOwned(input.destinationPortfolioId, userId);
    if (!ownsDestination) throw AppError.notFound('portfolio_not_found', 'Destination portfolio not found');

    const result = await this.deps.repo.transferPosition({
      positionId: position.id,
      listingId: position.listing_id,
      sourcePortfolioId: position.portfolio_id,
      destinationPortfolioId: input.destinationPortfolioId,
      effectiveAt: input.effectiveAt ?? new Date(),
    });
    // The merged/destination ledger changed; re-derive its state and allocations.
    await this.recalculate(result.resultingPositionId, bearerToken);
    return { transfer_id: result.transferId, position_id: result.resultingPositionId, merged: result.merged };
  }

  /**
   * Moves a subset of a position's **fully-open** buy lots to a same-listing
   * position in another owned portfolio. The selected buy transactions are
   * re-pointed (ids survive, so their cost basis, fees, and acquisition dates
   * travel with them — no synthetic trades, no realized P&L); the source keeps
   * its remaining ledger. Only lots untouched by any sell may move, so neither
   * side's realized P&L changes; average-cost positions with sales are rejected
   * (pooled basis has no movable lot identity). Both positions are re-derived.
   */
  async transferLots(
    userId: string,
    bearerToken: string,
    positionId: string,
    input: { destinationPortfolioId: string; lotTransactionIds: string[]; effectiveAt?: Date },
  ): Promise<{ transfer_id: string; source_position_id: string; destination_position_id: string; created: boolean }> {
    const position = await this.requireOwnedPosition(positionId, userId);
    if (position.portfolio_id === input.destinationPortfolioId) {
      throw AppError.badRequest('transfer_same_portfolio', 'The position is already in that portfolio');
    }
    if (!(await this.deps.repo.assertPortfolioOwned(input.destinationPortfolioId, userId))) {
      throw AppError.notFound('portfolio_not_found', 'Destination portfolio not found');
    }

    const requested = [...new Set(input.lotTransactionIds)];
    if (requested.length === 0) {
      throw AppError.badRequest('no_lots_selected', 'Select at least one lot to transfer');
    }

    const [{ accountingMethod }, transactions, splitsByPosition] = await Promise.all([
      this.deps.settings.getUserSettings(bearerToken),
      this.deps.repo.listTransactions(position.id),
      this.activeSplits([position.id]),
    ]);
    const byId = new Map(transactions.map((tx) => [tx.id, tx]));
    const realization = computeRealization(
      transactions,
      accountingMethod,
      splitsByPosition.get(position.id) ?? [],
      todayIso(),
    );
    if (realization.invalid) {
      throw AppError.badRequest('position_invalid', 'Resolve the invalid position before transferring lots');
    }
    // A lot is movable only if it is a buy that no sell has consumed (fully open),
    // so removing it leaves the source's realized P&L unchanged. Average-cost
    // pooling erases lot identity once anything has been sold.
    const hasSells = transactions.some((tx) => tx.side === 'sell');
    if (accountingMethod === 'average_cost' && hasSells) {
      throw AppError.badRequest(
        'partial_transfer_unsupported',
        'Partial transfers are not supported for average-cost positions with sales',
      );
    }
    const consumedBuyIds = new Set(realization.lotConsumptions.map((c) => c.buyTransactionId));

    let transferredQuantity = new Decimal(0);
    for (const id of requested) {
      const tx = byId.get(id);
      if (!tx) throw AppError.badRequest('lot_not_in_position', `Transaction ${id} is not in this position`);
      if (tx.side !== 'buy') throw AppError.badRequest('lot_not_a_buy', 'Only buy lots can be transferred');
      if (consumedBuyIds.has(id)) {
        throw AppError.badRequest('lot_not_fully_open', 'Only lots untouched by a sale can be transferred');
      }
      transferredQuantity = transferredQuantity.plus(new Decimal(tx.quantity));
    }

    const result = await this.deps.repo.transferLots({
      sourcePositionId: position.id,
      listingId: position.listing_id,
      sourcePortfolioId: position.portfolio_id,
      destinationPortfolioId: input.destinationPortfolioId,
      lotTransactionIds: requested,
      transferredQuantity: transferredQuantity.toString(),
      effectiveAt: input.effectiveAt ?? new Date(),
    });
    // Both ledgers changed: the source lost lots, the destination gained them.
    await this.recalculate(position.id, bearerToken);
    await this.recalculate(result.destinationPositionId, bearerToken);
    return {
      transfer_id: result.transferId,
      source_position_id: position.id,
      destination_position_id: result.destinationPositionId,
      created: result.createdDestination,
    };
  }

  /** Recorded transfers affecting an owned position, most recent first. */
  async listTransfers(userId: string, positionId: string): Promise<SerializedTransfer[]> {
    await this.requireOwnedPosition(positionId, userId);
    const transfers = await this.deps.repo.listTransfers(positionId);
    return transfers.map(serializeTransfer);
  }

  /** The owned position record, or a 404 — for sibling workflows (corporate actions). */
  async getOwnedPositionRecord(userId: string, positionId: string) {
    return this.requireOwnedPosition(positionId, userId);
  }

  private async requireOwnedPosition(positionId: string, userId: string) {
    const position = await this.deps.repo.getOwnedPosition(positionId, userId);
    if (!position) throw AppError.notFound('position_not_found', 'Position not found');
    return position;
  }
}

/** Today's date as YYYY-MM-DD (UTC) — the `asOf` for live re-derivation. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Half-open `[from, to)` date windows (YYYY-MM-DD) during which `portfolioId`
 * owned a position, derived from its ascending whole-transfer chain. The owner
 * starts at the first transfer's source, then becomes each transfer's destination
 * at that transfer's effective date; segments owned by the queried portfolio
 * become windows (`null` = unbounded). Re-entry (A→B→A) yields multiple windows.
 */
function ownershipWindowsFor(
  transfers: { sourcePortfolioId: string; destinationPortfolioId: string; effectiveAt: Date }[],
  portfolioId: string,
): { from: string | null; to: string | null }[] {
  const windows: { from: string | null; to: string | null }[] = [];
  let segStart: string | null = null;
  let owner = transfers[0]!.sourcePortfolioId;
  for (const t of transfers) {
    const date = t.effectiveAt.toISOString().slice(0, 10);
    if (owner === portfolioId) windows.push({ from: segStart, to: date });
    segStart = date;
    owner = t.destinationPortfolioId;
  }
  if (owner === portfolioId) windows.push({ from: segStart, to: null });
  return windows;
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
