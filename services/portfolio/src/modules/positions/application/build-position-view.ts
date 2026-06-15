import { dec } from '../domain/money.js';
import { makeConverter, makeDatedConverter } from '../domain/currency.js';
import { computeRealization, type AccountingMethod, type SplitAdjustment } from '../domain/realization.js';
import { computePerformance, type PerformanceMetrics } from '../domain/performance.js';
import {
  computeTransactionPerformance,
  type TransactionPerformanceMetrics,
} from '../domain/transaction-performance.js';
import { deriveState, type PositionState } from '../domain/position-state.js';
import type { ListingSummary, QuotePair, StoredTransaction } from './ports.js';

export interface PositionView {
  id: string;
  portfolio_id: string;
  listing_id: string;
  state: PositionState;
  listing: {
    instrument_id: string;
    symbol: string;
    name: string;
    asset_type: 'equity' | 'crypto' | 'fund' | 'index';
    currency: string;
  } | null;
  quote_as_of: string | null;
  freshness_status: string | null;
  performance: PerformanceMetrics;
}

export interface BuildPositionViewArgs {
  position: { id: string; portfolio_id: string; listing_id: string };
  transactions: StoredTransaction[];
  listing: ListingSummary | undefined;
  quote: QuotePair | undefined;
  eurRates: Map<string, string>;
  /** Historical EUR-based rates keyed `${currency}@${date}` for value-date conversion. */
  historicalRates?: Map<string, string>;
  reportingCurrency: string;
  method: AccountingMethod;
  /** Applied split adjustments to replay; restate holdings as of `asOf` (default today). */
  splits?: SplitAdjustment[];
  asOf?: string;
}

/**
 * Assembles the derived, read-only view of a position: its state, the latest
 * quote, and the computed performance metrics in the reporting currency. The
 * listing currency comes from the instruments read-model; quotes from the
 * market read-model.
 */
export function buildPositionView(args: BuildPositionViewArgs): PositionView {
  const listingCurrency = args.listing?.currency ?? 'EUR';
  const realization = computeRealization(args.transactions, args.method, args.splits ?? [], args.asOf);
  const state = deriveState(realization);

  const latestPrice = args.quote?.latest ? dec(args.quote.latest) : null;
  const previousPrice = args.quote?.previous ? dec(args.quote.previous) : null;
  const convertToReporting = makeConverter(args.eurRates, listingCurrency, args.reportingCurrency);
  const convertAt = args.historicalRates
    ? makeDatedConverter(args.historicalRates, args.reportingCurrency)
    : undefined;

  const performance = computePerformance({
    realization,
    latestPrice,
    previousPrice,
    listingCurrency,
    reportingCurrency: args.reportingCurrency,
    convertToReporting,
    convertAt,
  });

  return {
    id: args.position.id,
    portfolio_id: args.position.portfolio_id,
    listing_id: args.position.listing_id,
    state,
    listing: args.listing
      ? {
          instrument_id: args.listing.instrument_id,
          symbol: args.listing.symbol,
          name: args.listing.name,
          asset_type: args.listing.asset_type,
          currency: args.listing.currency,
        }
      : null,
    quote_as_of: args.quote?.latestAt ? args.quote.latestAt.toISOString() : null,
    freshness_status: args.quote?.freshness ?? null,
    performance,
  };
}

/**
 * Per-transaction P&L attribution for a position detail, keyed by transaction
 * ID. Reuses the same realization replay and FX converters as the position view
 * so a row's realized P&L reconciles with the position's realized P&L (and the
 * open-lot unrealized P&L with the position's unrealized P&L under FIFO/LIFO).
 */
export function buildTransactionPerformance(
  args: BuildPositionViewArgs,
): Map<string, TransactionPerformanceMetrics> {
  const listingCurrency = args.listing?.currency ?? 'EUR';
  const realization = computeRealization(args.transactions, args.method, args.splits ?? [], args.asOf);
  const latestPrice = args.quote?.latest ? dec(args.quote.latest) : null;
  const convertToReporting = makeConverter(args.eurRates, listingCurrency, args.reportingCurrency);
  const convertAt = args.historicalRates
    ? makeDatedConverter(args.historicalRates, args.reportingCurrency)
    : undefined;

  return computeTransactionPerformance({
    byTransaction: realization.byTransaction,
    latestPrice,
    convertToReporting,
    convertAt,
  });
}
