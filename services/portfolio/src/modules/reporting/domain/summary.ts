import Decimal from 'decimal.js';
import type { PositionView } from '../../positions/application/build-position-view.js';

const D = (v: string | null | undefined): Decimal | null => {
  if (v === null || v === undefined) return null;
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

export interface PortfolioSummary {
  snapshot_at: string;
  reporting_currency: string;
  /** The portfolio's chosen headline metric (single-portfolio scope only). */
  preferred_headline_metric: string | null;
  /** 'complete' when every open position is priced and every dividend converted. */
  completeness: 'complete' | 'partial';
  current_value: string;
  invested_capital: string;
  daily_change_amount: string;
  daily_change_pct: string | null;
  realized_pnl: string;
  unrealized_pnl: string;
  dividends: string;
  fees: string;
  total_pnl: string;
  /** Unrealized P&L over invested capital. */
  simple_return_pct: string | null;
  /** Booked + unbooked gains over invested capital (XIRR/time-weighted: Phase 2). */
  total_return_pct: string | null;
  counts: { open: number; closed: number; invalid: number; stale: number; unavailable: number };
}

/**
 * Aggregates per-position reporting-currency figures into one authoritative
 * portfolio snapshot. Percentages are derived from summed cash amounts and their
 * denominators — never by averaging position percentages. Realized P&L and fees
 * are already historical-FX converted by the position calculation; dividends are
 * passed in pre-converted to the reporting currency.
 */
export function computeSummary(
  views: PositionView[],
  dividends: { amount: Decimal; complete: boolean },
  reportingCurrency: string,
  snapshotAt: string,
  preferredHeadlineMetric: string | null,
): PortfolioSummary {
  let currentValue = new Decimal(0);
  let invested = new Decimal(0);
  let unrealized = new Decimal(0);
  let realized = new Decimal(0);
  let fees = new Decimal(0);
  let daily = new Decimal(0);
  const counts = { open: 0, closed: 0, invalid: 0, stale: 0, unavailable: 0 };
  let priced = true;

  for (const view of views) {
    const p = view.performance;
    if (view.state === 'closed') counts.closed += 1;
    else if (view.state === 'invalid') counts.invalid += 1;
    else counts.open += 1;

    // Realized P&L and fees accrue across all states.
    realized = realized.plus(D(p.realized_pnl_reporting) ?? 0);
    fees = fees.plus(D(p.total_fees_reporting) ?? 0);

    if (view.state !== 'open') continue;

    const value = D(p.current_value_reporting);
    if (value === null) {
      counts.unavailable += 1;
      priced = false; // an open position with no price → snapshot is partial
      continue;
    }
    if (view.freshness_status && view.freshness_status !== 'fresh') counts.stale += 1;

    currentValue = currentValue.plus(value);
    invested = invested.plus(D(p.open_cost_basis_reporting) ?? 0);
    unrealized = unrealized.plus(D(p.unrealized_pnl_reporting) ?? 0);
    daily = daily.plus(D(p.daily_change_amount_reporting) ?? 0);
  }

  const totalPnl = realized.plus(unrealized).plus(dividends.amount);
  const priorValue = currentValue.minus(daily);
  const dailyPct = priorValue.gt(0) ? daily.div(priorValue).times(100) : null;
  const simpleReturn = invested.gt(0) ? unrealized.div(invested).times(100) : null;
  const totalReturn = invested.gt(0) ? totalPnl.div(invested).times(100) : null;

  return {
    snapshot_at: snapshotAt,
    reporting_currency: reportingCurrency,
    preferred_headline_metric: preferredHeadlineMetric,
    completeness: priced && dividends.complete ? 'complete' : 'partial',
    current_value: currentValue.toFixed(2),
    invested_capital: invested.toFixed(2),
    daily_change_amount: daily.toFixed(2),
    daily_change_pct: dailyPct ? dailyPct.toFixed(2) : null,
    realized_pnl: realized.toFixed(2),
    unrealized_pnl: unrealized.toFixed(2),
    dividends: dividends.amount.toFixed(2),
    fees: fees.toFixed(2),
    total_pnl: totalPnl.toFixed(2),
    simple_return_pct: simpleReturn ? simpleReturn.toFixed(2) : null,
    total_return_pct: totalReturn ? totalReturn.toFixed(2) : null,
    counts,
  };
}
