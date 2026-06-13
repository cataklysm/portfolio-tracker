import { dec } from '../domain/money.js';
import { makeConverter } from '../domain/currency.js';
import { computeRealization, type AccountingMethod } from '../domain/realization.js';
import { computePerformance, type PerformanceMetrics } from '../domain/performance.js';
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
    asset_type: 'equity' | 'crypto';
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
  reportingCurrency: string;
  method: AccountingMethod;
}

/**
 * Assembles the derived, read-only view of a position: its state, the latest
 * quote, and the computed performance metrics in the reporting currency. The
 * listing currency comes from the instruments read-model; quotes from the
 * market read-model.
 */
export function buildPositionView(args: BuildPositionViewArgs): PositionView {
  const listingCurrency = args.listing?.currency ?? 'EUR';
  const realization = computeRealization(args.transactions, args.method);
  const state = deriveState(realization);

  const latestPrice = args.quote?.latest ? dec(args.quote.latest) : null;
  const previousPrice = args.quote?.previous ? dec(args.quote.previous) : null;
  const convertToReporting = makeConverter(args.eurRates, listingCurrency, args.reportingCurrency);

  const performance = computePerformance({
    realization,
    latestPrice,
    previousPrice,
    listingCurrency,
    reportingCurrency: args.reportingCurrency,
    convertToReporting,
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
