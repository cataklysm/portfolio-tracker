import type { LatestQuote, OwnTarget } from '../../../platform/clients.js';
import type { Severity } from '../application/ports.js';

/**
 * Pure §2.7 alert rules. Each returns an AlertCandidate (with a dedup
 * `signature` that stays stable while the condition holds) or null when the
 * condition is not met. No I/O — given the inputs, the verdict is deterministic.
 */
export interface AlertCandidate {
  signature: string;
  severity: Severity;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
}

/** Significant daily move: |price change vs previous close| ≥ threshold%. */
export function evaluateDailyMove(
  symbol: string,
  quote: LatestQuote,
  thresholdPct: number,
  todayIso: string,
): AlertCandidate | null {
  const { latest, previous } = quote;
  if (latest === null || previous === null || previous === 0) return null;
  const pct = ((latest - previous) / previous) * 100;
  if (Math.abs(pct) < thresholdPct) return null;
  const up = pct >= 0;
  return {
    // One alert per day per direction; flips re-fire, a steady move does not.
    signature: `${todayIso}:${up ? 'up' : 'down'}`,
    severity: Math.abs(pct) >= thresholdPct * 2 ? 'warning' : 'info',
    title: `${symbol} ${up ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% today`,
    body: null,
    data: { daily_change_pct: pct, latest, previous },
  };
}

/** Upcoming earnings within the configured horizon. */
export function evaluateEarnings(
  symbol: string,
  reportDate: string | undefined,
  withinDays: number,
  todayIso: string,
): AlertCandidate | null {
  if (!reportDate) return null;
  const days = daysBetween(todayIso, reportDate);
  if (days < 0 || days > withinDays) return null;
  return {
    signature: reportDate, // one alert per report date
    severity: 'info',
    title: `${symbol} reports earnings ${reportDate}`,
    body: days === 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`,
    data: { report_date: reportDate, days_until: days },
  };
}

/** Price has entered one of the user's own target zones. */
export function evaluateTargetZone(
  symbol: string,
  price: number | null,
  targets: OwnTarget[],
  currency: string,
): AlertCandidate | null {
  if (price === null || targets.length === 0) return null;
  const hits = targets.filter((t) => inZone(price, t.zoneLow, t.zoneHigh));
  if (hits.length === 0) return null;
  const ids = hits.map((t) => t.id).sort();
  return {
    // Signature is the set of currently-hit zones; entering new zones re-fires,
    // and the evaluator clears state on exit so a later re-entry re-fires too.
    signature: ids.join(','),
    severity: 'info',
    title: `${symbol} reached your target zone`,
    body: hits.map((t) => describeZone(t, currency)).join('; '),
    data: { target_ids: ids, price },
  };
}

/** Price crossed a user-set threshold (above/below). */
export function evaluatePriceThreshold(
  symbol: string,
  price: number | null,
  direction: 'above' | 'below',
  threshold: number,
  currency: string,
): AlertCandidate | null {
  if (price === null) return null;
  const hit = direction === 'above' ? price >= threshold : price <= threshold;
  if (!hit) return null;
  return {
    // Stable while held; clears on exit so a later re-cross re-fires.
    signature: `${direction}:${threshold}`,
    severity: 'info',
    title: `${symbol} ${direction} ${currency} ${threshold}`,
    body: `Now ${currency} ${price}`,
    data: { direction, threshold, price },
  };
}

/** Unrealized return vs average cost crossed a user-set threshold. */
export function evaluateCostBasisMove(
  symbol: string,
  price: number | null,
  avgCost: number | undefined,
  direction: 'above' | 'below',
  thresholdPct: number,
): AlertCandidate | null {
  if (price === null || avgCost === undefined || avgCost <= 0) return null;
  const pct = ((price - avgCost) / avgCost) * 100;
  const hit = direction === 'above' ? pct >= thresholdPct : pct <= thresholdPct;
  if (!hit) return null;
  return {
    signature: `${direction}:${thresholdPct}`,
    severity: 'info',
    title: `${symbol} ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% from cost`,
    body: null,
    data: { unrealized_pct: pct, avg_cost: avgCost, price, direction, threshold_pct: thresholdPct },
  };
}

function inZone(price: number, low: number | null, high: number | null): boolean {
  if (low !== null && high !== null) return price >= low && price <= high;
  if (low !== null) return price >= low;
  if (high !== null) return price <= high;
  return false;
}

function describeZone(t: OwnTarget, fallbackCurrency: string): string {
  const ccy = t.currency || fallbackCurrency;
  const fmt = (n: number) => `${ccy} ${n}`;
  if (t.zoneLow !== null && t.zoneHigh !== null) return `${fmt(t.zoneLow)} – ${fmt(t.zoneHigh)}`;
  if (t.zoneLow !== null) return `≥ ${fmt(t.zoneLow)}`;
  if (t.zoneHigh !== null) return `≤ ${fmt(t.zoneHigh)}`;
  return '';
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD, UTC). */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return -1;
  return Math.round((to - from) / 86_400_000);
}
