import { AppError } from '@portfolio/platform';
import { computeRealization, type AccountingMethod } from '../domain/realization.js';
import { deriveState } from '../domain/position-state.js';
import { buildPositionView, type PositionView } from './build-position-view.js';
import type {
  FxReader,
  ListingReader,
  NewTransaction,
  PositionRepository,
  QuoteReader,
  SettingsReader,
  StoredTransaction,
} from './ports.js';

export interface PositionServiceDeps {
  repo: PositionRepository;
  listings: ListingReader;
  quotes: QuoteReader;
  fx: FxReader;
  settings: SettingsReader;
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
    const eurRates = await this.deps.fx.getEurRates(currencies, bearerToken);

    return positions.map((position) =>
      buildPositionView({
        position,
        transactions: txnsByPosition.get(position.id) ?? [],
        listing: listings.get(position.listing_id),
        quote: quotes.get(position.listing_id),
        eurRates,
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
    const eurRates = await this.deps.fx.getEurRates(currencies, bearerToken);

    const view = buildPositionView({
      position,
      transactions,
      listing,
      quote: quotes.get(position.listing_id),
      eurRates,
      reportingCurrency,
      method: accountingMethod,
    });

    return {
      ...view,
      transactions: transactions.map(serializeTransaction),
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
    await this.deps.repo.updateTransaction(txId, tx);
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
    await this.deps.repo.deleteTransaction(txId);
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

  /** Recomputes derived state from the ledger and persists it. */
  private async recalculate(positionId: string, bearerToken: string): Promise<void> {
    const { accountingMethod } = await this.deps.settings.getUserSettings(bearerToken);
    const transactions = await this.deps.repo.listTransactions(positionId);
    const realization = computeRealization(transactions, accountingMethod);
    const state = deriveState(realization);

    if (state === 'invalid') {
      // Retain the last successfully calculated values; only flag the position.
      await this.deps.repo.applyPositionState(positionId, {
        state: 'invalid',
        calculatedValues: null,
        invalidReason: { code: 'ledger_inconsistent', reason: 'A sell exceeded available quantity' },
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
    });
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

function serializeTransaction(tx: StoredTransaction): PositionDetail['transactions'][number] {
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
  };
}

export type { AccountingMethod };
