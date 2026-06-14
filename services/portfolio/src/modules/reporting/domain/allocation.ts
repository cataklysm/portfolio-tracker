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

export interface AllocationSlice {
  key: string;
  label: string;
  value: string;
  weight_pct: string;
}

export interface IntelligenceSnapshot {
  /** The single largest holding by market value, and whether it breaches the threshold. */
  largest_concentration: { instrument_id: string; symbol: string; weight_pct: string; exceeds_threshold: boolean } | null;
  /** The holding with the largest absolute daily move, in the reporting currency. */
  top_mover: { instrument_id: string; symbol: string; daily_change_amount: string; daily_change_pct: string | null } | null;
  concentration_threshold_pct: string;
}

export interface AllocationReport {
  reporting_currency: string;
  total_value: string;
  by_instrument: AllocationSlice[];
  by_asset_type: AllocationSlice[];
  by_portfolio: AllocationSlice[];
  by_currency: AllocationSlice[];
  intelligence: IntelligenceSnapshot;
}

/** Default concentration warning threshold (a single holding above this share). */
const DEFAULT_CONCENTRATION_PCT = 25;

/**
 * Allocation breakdowns and intelligence derived from the same priced open
 * positions as the summary, so the views never disagree. Each breakdown's
 * weights are shares of the total market value.
 */
export function computeAllocation(
  views: PositionView[],
  portfolioNames: Map<string, string>,
  concentrationThresholdPct = DEFAULT_CONCENTRATION_PCT,
): AllocationReport {
  const open = views.filter((v) => v.state === 'open' && v.listing && D(v.performance.current_value_reporting).gt(0));
  const total = open.reduce((s, v) => s.plus(D(v.performance.current_value_reporting)), new Decimal(0));

  const byInstrument = new Map<string, { label: string; value: Decimal }>();
  const byAssetType = new Map<string, { label: string; value: Decimal }>();
  const byPortfolio = new Map<string, { label: string; value: Decimal }>();
  const byCurrency = new Map<string, { label: string; value: Decimal }>();
  // For intelligence:
  const instrumentDaily = new Map<string, { symbol: string; daily: Decimal; pct: string | null }>();

  for (const view of open) {
    const value = D(view.performance.current_value_reporting);
    const l = view.listing!;
    add(byInstrument, l.instrument_id, l.symbol, value);
    add(byAssetType, l.asset_type, l.asset_type, value);
    add(byPortfolio, view.portfolio_id, portfolioNames.get(view.portfolio_id) ?? view.portfolio_id, value);
    add(byCurrency, l.currency, l.currency, value);

    const daily = D(view.performance.daily_change_amount_reporting);
    const existing = instrumentDaily.get(l.instrument_id);
    instrumentDaily.set(l.instrument_id, {
      symbol: l.symbol,
      daily: (existing?.daily ?? new Decimal(0)).plus(daily),
      pct: view.performance.daily_change_pct,
    });
  }

  const slices = (m: Map<string, { label: string; value: Decimal }>): AllocationSlice[] =>
    [...m.entries()]
      .map(([key, v]) => ({
        key,
        label: v.label,
        value: v.value.toFixed(2),
        weight_pct: total.gt(0) ? v.value.div(total).times(100).toFixed(2) : '0.00',
      }))
      .sort((a, b) => Number(b.value) - Number(a.value));

  const byInstrumentSlices = slices(byInstrument);
  const top = byInstrumentSlices[0];
  const largest = top
    ? {
        instrument_id: top.key,
        symbol: top.label,
        weight_pct: top.weight_pct,
        exceeds_threshold: Number(top.weight_pct) > concentrationThresholdPct,
      }
    : null;

  let mover: IntelligenceSnapshot['top_mover'] = null;
  for (const [instrumentId, d] of instrumentDaily) {
    if (mover === null || d.daily.abs().gt(new Decimal(mover.daily_change_amount).abs())) {
      mover = {
        instrument_id: instrumentId,
        symbol: d.symbol,
        daily_change_amount: d.daily.toFixed(2),
        daily_change_pct: d.pct,
      };
    }
  }

  return {
    reporting_currency: open[0]?.performance.reporting_currency ?? 'EUR',
    total_value: total.toFixed(2),
    by_instrument: byInstrumentSlices,
    by_asset_type: slices(byAssetType),
    by_portfolio: slices(byPortfolio),
    by_currency: slices(byCurrency),
    intelligence: {
      largest_concentration: largest,
      top_mover: mover,
      concentration_threshold_pct: new Decimal(concentrationThresholdPct).toFixed(2),
    },
  };
}

function add(map: Map<string, { label: string; value: Decimal }>, key: string, label: string, value: Decimal): void {
  const existing = map.get(key);
  if (existing) existing.value = existing.value.plus(value);
  else map.set(key, { label, value });
}
