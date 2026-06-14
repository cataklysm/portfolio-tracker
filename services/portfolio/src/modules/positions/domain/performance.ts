import type Decimal from 'decimal.js';
import { D } from './money.js';
import type { DatedAmount, RealizationResult } from './realization.js';

export interface PerformanceInput {
  realization: RealizationResult;
  latestPrice: Decimal | null;
  previousPrice: Decimal | null;
  listingCurrency: string;
  reportingCurrency: string;
  /** Converts a trade-currency amount to the reporting currency at the latest rate; null if no rate. */
  convertToReporting: (amount: Decimal) => Decimal | null;
  /**
   * Converts an amount to the reporting currency at the FX rate of a specific
   * value date. When provided, realized P&L and fees are converted per their
   * value date (historical FX) rather than at the latest rate; per-event it
   * falls back to `convertToReporting` if the dated rate is missing. When
   * omitted, realized P&L and fees use the latest rate (prior behavior).
   */
  convertAt?: (amount: Decimal, fromCurrency: string, valueDate: string) => Decimal | null;
}

export interface PerformanceMetrics {
  open_quantity: string;
  listing_currency: string;
  reporting_currency: string;
  current_price: string | null;
  daily_change_pct: string | null;
  /** Held quantity × (latest − prior close), in the reporting currency. */
  daily_change_amount_reporting: string | null;
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
 * Sums dated amounts in the reporting currency. With a `convertAt` resolver each
 * event converts at its own value date (falling back to the latest rate when a
 * dated rate is missing); without one, the aggregate converts at the latest rate
 * (prior behavior). Returns null if any required conversion is unavailable.
 */
function sumDated(
  events: DatedAmount[],
  aggregate: Decimal,
  convertAt: ((amount: Decimal, fromCurrency: string, valueDate: string) => Decimal | null) | undefined,
  convertToReporting: (amount: Decimal) => Decimal | null,
): Decimal | null {
  if (!convertAt) return convertToReporting(aggregate);
  let total = new D(0);
  for (const event of events) {
    const dated = event.currency && event.valueDate ? convertAt(event.amount, event.currency, event.valueDate) : null;
    const converted = dated ?? convertToReporting(event.amount);
    if (converted === null) return null;
    total = total.plus(converted);
  }
  return total;
}

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
  // Open positions are marked to market at the latest rate; realized P&L and
  // fees are historical and convert at their value-date rate when available.
  const openCostReporting = convertToReporting(r.openCostBasis);
  const realizedReporting = sumDated(r.realizedByDate, r.realizedPnl, input.convertAt, convertToReporting);
  const feesReporting = sumDated(r.feesByDate, r.totalFees, input.convertAt, convertToReporting);

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
  let dailyChangeAmountReporting: Decimal | null = null;
  if (latestPrice && previousPrice && previousPrice.gt(0)) {
    dailyChangePct = latestPrice.minus(previousPrice).div(previousPrice).times(100);
    // Exact daily P&L: held quantity × prior-close-to-latest delta, at the latest rate.
    if (r.openQuantity.gt(0)) {
      dailyChangeAmountReporting = convertToReporting(r.openQuantity.times(latestPrice.minus(previousPrice)));
    }
  }

  return {
    open_quantity: r.openQuantity.toFixed(8),
    listing_currency: input.listingCurrency,
    reporting_currency: input.reportingCurrency,
    current_price: latestPrice ? latestPrice.toFixed(2) : null,
    daily_change_pct: dailyChangePct ? dailyChangePct.toFixed(2) : null,
    daily_change_amount_reporting: money(dailyChangeAmountReporting),
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
