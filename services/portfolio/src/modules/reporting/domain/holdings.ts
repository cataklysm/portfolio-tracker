import Decimal from 'decimal.js';
import type { PositionView } from '../../positions/application/build-position-view.js';

const D = (v: string | null | undefined): Decimal => {
  if (v === null || v === undefined) return new Decimal(0);
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

export interface HoldingListing {
  listing_id: string;
  currency: string;
  quantity: string;
  price: string | null;
  value_reporting: string;
}

export interface HoldingGroup {
  instrument_id: string;
  symbol: string;
  name: string;
  asset_type: string;
  /** Portfolios contributing to this instrument (badges in the combined view). */
  portfolios: { id: string; name: string }[];
  /** Per-listing rows when one or more listings/currencies contribute. */
  listings: HoldingListing[];
  quantity: string;
  market_value: string;
  open_cost_basis: string;
  realized_pnl: string;
  unrealized_pnl: string;
  dividends: string;
  daily_change_amount: string;
  weight_pct: string | null;
}

interface Acc {
  instrument_id: string;
  symbol: string;
  name: string;
  asset_type: string;
  portfolios: Map<string, string>;
  listings: Map<string, { currency: string; quantity: Decimal; price: string | null; value: Decimal }>;
  quantity: Decimal;
  marketValue: Decimal;
  openCost: Decimal;
  realized: Decimal;
  unrealized: Decimal;
  daily: Decimal;
}

/**
 * Aggregates positions by instrument across portfolios for the combined holdings
 * view: accounting stays listing-specific (each position contributes its own
 * reporting-currency figures), then the instrument groups them. Dividends are
 * passed in pre-converted, keyed by instrument id.
 */
export function computeHoldings(
  views: PositionView[],
  portfolioNames: Map<string, string>,
  dividendsByInstrument: Map<string, Decimal>,
): HoldingGroup[] {
  const groups = new Map<string, Acc>();

  for (const view of views) {
    if (!view.listing) continue;
    const id = view.listing.instrument_id;
    let acc = groups.get(id);
    if (!acc) {
      acc = {
        instrument_id: id,
        symbol: view.listing.symbol,
        name: view.listing.name,
        asset_type: view.listing.asset_type,
        portfolios: new Map(),
        listings: new Map(),
        quantity: new Decimal(0),
        marketValue: new Decimal(0),
        openCost: new Decimal(0),
        realized: new Decimal(0),
        unrealized: new Decimal(0),
        daily: new Decimal(0),
      };
      groups.set(id, acc);
    }

    acc.portfolios.set(view.portfolio_id, portfolioNames.get(view.portfolio_id) ?? view.portfolio_id);
    // Realized P&L accrues from every contributing position (open or closed).
    acc.realized = acc.realized.plus(D(view.performance.realized_pnl_reporting));
    if (view.state !== 'open') continue;

    const value = D(view.performance.current_value_reporting);
    const qty = D(view.performance.open_quantity);
    acc.quantity = acc.quantity.plus(qty);
    acc.marketValue = acc.marketValue.plus(value);
    acc.openCost = acc.openCost.plus(D(view.performance.open_cost_basis_reporting));
    acc.unrealized = acc.unrealized.plus(D(view.performance.unrealized_pnl_reporting));
    acc.daily = acc.daily.plus(D(view.performance.daily_change_amount_reporting));

    const listing = acc.listings.get(view.listing_id) ?? {
      currency: view.listing.currency,
      quantity: new Decimal(0),
      price: view.performance.current_price,
      value: new Decimal(0),
    };
    listing.quantity = listing.quantity.plus(qty);
    listing.value = listing.value.plus(value);
    acc.listings.set(view.listing_id, listing);
  }

  const totalValue = [...groups.values()].reduce((s, g) => s.plus(g.marketValue), new Decimal(0));

  return [...groups.values()]
    .map((acc) => {
      const dividends = dividendsByInstrument.get(acc.instrument_id) ?? new Decimal(0);
      return {
        instrument_id: acc.instrument_id,
        symbol: acc.symbol,
        name: acc.name,
        asset_type: acc.asset_type,
        portfolios: [...acc.portfolios].map(([id, name]) => ({ id, name })),
        listings: [...acc.listings].map(([listing_id, l]) => ({
          listing_id,
          currency: l.currency,
          quantity: l.quantity.toFixed(8),
          price: l.price,
          value_reporting: l.value.toFixed(2),
        })),
        quantity: acc.quantity.toFixed(8),
        market_value: acc.marketValue.toFixed(2),
        open_cost_basis: acc.openCost.toFixed(2),
        realized_pnl: acc.realized.toFixed(2),
        unrealized_pnl: acc.unrealized.toFixed(2),
        dividends: dividends.toFixed(2),
        daily_change_amount: acc.daily.toFixed(2),
        weight_pct: totalValue.gt(0) ? acc.marketValue.div(totalValue).times(100).toFixed(2) : null,
      };
    })
    .sort((a, b) => Number(b.market_value) - Number(a.market_value));
}
