import type Decimal from 'decimal.js';
import { D } from './money.js';
import type { RealizationResult } from './realization.js';

export interface PerformanceInput {
  realization: RealizationResult;
  latestPrice: Decimal | null;
  previousPrice: Decimal | null;
  listingCurrency: string;
  reportingCurrency: string;
  /** Converts a trade-currency amount to the reporting currency; null if no rate. */
  convertToReporting: (amount: Decimal) => Decimal | null;
}

export interface PerformanceMetrics {
  open_quantity: string;
  listing_currency: string;
  reporting_currency: string;
  current_price: string | null;
  daily_change_pct: string | null;
  open_cost_basis_reporting: string | null;
  current_value_reporting: string | null;
  unrealized_pnl_reporting: string | null;
  realized_pnl_reporting: string | null;
  total_fees_reporting: string | null;
  /** Currency-independent ratios, in percent. */
  simple_return_pct: string | null;
  total_return_pct: string | null;
  /** Realized P&L as a percent of the cost basis of sold shares; null if no sells. */
  realized_return_pct: string | null;
}

const money = (value: Decimal | null): string | null => (value === null ? null : value.toFixed(2));

/**
 * Combines the derived realization figures with the latest market price and FX
 * to produce the core performance metrics for a position. Percentage returns
 * are computed as currency-independent ratios; absolute values are expressed in
 * the user's reporting currency. Dividends are intentionally excluded from
 * realized and unrealized P&L per the specification.
 */
export function computePerformance(input: PerformanceInput): PerformanceMetrics {
  const { realization: r, latestPrice, previousPrice, convertToReporting } = input;

  const currentValueListing = latestPrice ? r.openQuantity.times(latestPrice) : null;
  const currentValueReporting = currentValueListing ? convertToReporting(currentValueListing) : null;
  const openCostReporting = convertToReporting(r.openCostBasis);
  const realizedReporting = convertToReporting(r.realizedPnl);
  const feesReporting = convertToReporting(r.totalFees);

  const unrealizedReporting =
    currentValueReporting !== null && openCostReporting !== null
      ? currentValueReporting.minus(openCostReporting)
      : null;

  let simpleReturnPct: Decimal | null = null;
  if (currentValueListing !== null && r.openCostBasis.gt(0)) {
    simpleReturnPct = currentValueListing.minus(r.openCostBasis).div(r.openCostBasis).times(100);
  }

  let totalReturnPct: Decimal | null = null;
  if (r.totalContributedCapital.gt(0)) {
    const valueComponent = currentValueListing ?? new D(0);
    const numerator = valueComponent
      .plus(r.grossSellProceeds)
      .minus(r.totalContributedCapital)
      .minus(r.totalFees);
    totalReturnPct = numerator.div(r.totalContributedCapital).times(100);
  }

  // Return on the capital invested in shares that have since been sold.
  let realizedReturnPct: Decimal | null = null;
  if (r.realizedCostBasis.gt(0)) {
    realizedReturnPct = r.realizedPnl.div(r.realizedCostBasis).times(100);
  }

  let dailyChangePct: Decimal | null = null;
  if (latestPrice && previousPrice && previousPrice.gt(0)) {
    dailyChangePct = latestPrice.minus(previousPrice).div(previousPrice).times(100);
  }

  return {
    open_quantity: r.openQuantity.toFixed(8),
    listing_currency: input.listingCurrency,
    reporting_currency: input.reportingCurrency,
    current_price: latestPrice ? latestPrice.toFixed(2) : null,
    daily_change_pct: dailyChangePct ? dailyChangePct.toFixed(2) : null,
    open_cost_basis_reporting: money(openCostReporting),
    current_value_reporting: money(currentValueReporting),
    unrealized_pnl_reporting: money(unrealizedReporting),
    realized_pnl_reporting: money(realizedReporting),
    total_fees_reporting: money(feesReporting),
    simple_return_pct: simpleReturnPct ? simpleReturnPct.toFixed(2) : null,
    total_return_pct: totalReturnPct ? totalReturnPct.toFixed(2) : null,
    realized_return_pct: realizedReturnPct ? realizedReturnPct.toFixed(2) : null,
  };
}
