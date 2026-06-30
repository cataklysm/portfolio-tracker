import { D } from '../../positions/domain/money.js';
import type Decimal from 'decimal.js';
import {
  isOwnedAt,
  makeRateConverter,
  type PerformancePoint,
  type SeriesCashFlow,
  type SeriesPosition,
} from './performance-series.js';

// All income flows count toward return (internal), distinct from deposits/
// withdrawals (external contributions). Interest is income like dividends.
const INCOME_TYPES = new Set<SeriesCashFlow['type']>(['dividend', 'cash_in_lieu', 'interest']);
const MS_PER_DAY = 86_400_000;

/** A signed cash flow for the money-weighted return (outflows negative). */
export interface XirrFlow {
  date: string;
  amount: number;
}

/**
 * A time-weighted sub-period: the portfolio value at the start and end, plus the
 * net capital added (buys − sells) and income received within it. The sub-period
 * return is `(endValue + income) / (startValue + netContribution)`.
 */
export interface TwrInterval {
  startValue: number;
  endValue: number;
  netContribution: number;
  income: number;
}

export interface ReturnsResult {
  /** Annualized money-weighted return (XIRR), in percent. Null if undefined. */
  money_weighted: string | null;
  /** Cumulative time-weighted return over the period, in percent. Null if undefined. */
  time_weighted: string | null;
}

export interface ReturnsInput {
  sampleDates: string[];
  /** The value series from `computePerformanceSeries` (same scope/period). */
  points: PerformancePoint[];
  positions: SeriesPosition[];
  cashFlows: SeriesCashFlow[];
  reportingCurrency: string;
  rateOnOrBefore: (currency: string, date: string) => Decimal | null;
}

/**
 * Money-weighted (XIRR) and time-weighted (TWR) returns over the period, layered
 * on the B-1 value series. Trades are the investment cash flows (a buy is capital
 * deployed, a sell capital returned) — consistent with the per-position
 * `total_return_pct` convention — together with received dividends; the starting
 * portfolio value is the opening outflow and the ending value the terminal
 * inflow. All amounts convert at value-date FX. TWR chains the per-sample-interval
 * returns; with strided (long `ALL`) sampling its sub-periods coarsen.
 */
export function computeReturns(input: ReturnsInput): ReturnsResult {
  const { sampleDates, points, positions, cashFlows, reportingCurrency, rateOnOrBefore } = input;
  if (points.length < 2 || sampleDates.length < 2) {
    return { money_weighted: null, time_weighted: null };
  }
  const convert = makeRateConverter(rateOnOrBefore, reportingCurrency);
  const from = sampleDates[0] ?? '';
  const to = sampleDates[sampleDates.length - 1] ?? '';
  const valueFrom = numeric(points[0]?.value);
  const valueTo = numeric(points[points.length - 1]?.value);

  // --- Money-weighted (XIRR) flow stream, in the reporting currency ---
  const flows: XirrFlow[] = [];
  if (Math.abs(valueFrom) > 1e-9) flows.push({ date: from, amount: -valueFrom });
  for (const pos of positions) {
    for (const tx of pos.transactions) {
      const date = tx.tax_relevant_value_date ?? '';
      if (date <= from || date > to) continue;
      if (!isOwnedAt(pos.ownershipWindows, date)) continue; // trade belongs to the owning portfolio
      const converted = convert(tradeCashAmount(tx), tx.currency ?? reportingCurrency, date);
      if (converted !== null) flows.push({ date, amount: converted.toNumber() });
    }
  }
  for (const flow of cashFlows) {
    if (!INCOME_TYPES.has(flow.type) || flow.valueDate <= from || flow.valueDate > to) continue;
    const converted = convert(flow.amount, flow.currency, flow.valueDate);
    if (converted !== null) flows.push({ date: flow.valueDate, amount: converted.toNumber() });
  }
  flows.push({ date: to, amount: valueTo });

  const intervals = buildTwrIntervals(input);
  const xirr = computeXirr(flows);
  const twr = computeTwr(intervals);
  return {
    money_weighted: xirr === null ? null : pct(xirr),
    time_weighted: twr === null ? null : pct(twr),
  };
}

/**
 * Time-weighted sub-period intervals between consecutive sample points: the start
 * and end value, plus net capital contributed (buys − sells) and income received
 * within each, all at value-date FX. Shared by `computeReturns` (TWR) and the
 * risk analytics (per-period return series).
 */
export function buildTwrIntervals(input: ReturnsInput): TwrInterval[] {
  const { sampleDates, points, positions, cashFlows, reportingCurrency, rateOnOrBefore } = input;
  const convert = makeRateConverter(rateOnOrBefore, reportingCurrency);
  const intervals: TwrInterval[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = sampleDates[i - 1] ?? '';
    const cur = sampleDates[i] ?? '';
    let netContribution = new D(0);
    let income = new D(0);
    for (const pos of positions) {
      for (const tx of pos.transactions) {
        const date = tx.tax_relevant_value_date ?? '';
        if (date <= prev || date > cur) continue;
        if (!isOwnedAt(pos.ownershipWindows, date)) continue; // trade belongs to the owning portfolio
        // Capital added to holdings: buy is positive, sell negative.
        const converted = convert(tradeCashAmount(tx).negated(), tx.currency ?? reportingCurrency, date);
        if (converted !== null) netContribution = netContribution.plus(converted);
      }
    }
    for (const flow of cashFlows) {
      if (!INCOME_TYPES.has(flow.type) || flow.valueDate <= prev || flow.valueDate > cur) continue;
      const converted = convert(flow.amount, flow.currency, flow.valueDate);
      if (converted !== null) income = income.plus(converted);
    }
    intervals.push({
      startValue: numeric(points[i - 1]?.value),
      endValue: numeric(points[i]?.value),
      netContribution: netContribution.toNumber(),
      income: income.toNumber(),
    });
  }
  return intervals;
}

/** Per-period simple return of a TWR interval, or null when the base is non-positive. */
export function intervalReturn(interval: TwrInterval): number | null {
  const base = interval.startValue + interval.netContribution;
  if (base <= 0) return null;
  return (interval.endValue + interval.income) / base - 1;
}

/**
 * Internal rate of return for dated flows (ACT/365), annualized. Needs at least
 * one inflow and one outflow. Newton–Raphson from a 10% guess, falling back to
 * bisection on `[-0.9999, 100]`; returns null when neither converges.
 */
export function computeXirr(flows: XirrFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;

  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const t0 = parseDate(sorted[0]?.date ?? '');
  const years = sorted.map((f) => (parseDate(f.date) - t0) / MS_PER_DAY / 365);
  const npv = (r: number): number =>
    sorted.reduce((sum, f, i) => sum + f.amount / (1 + r) ** (years[i] ?? 0), 0);

  // Newton–Raphson.
  let rate = 0.1;
  for (let k = 0; k < 100; k += 1) {
    const value = npv(rate);
    const slope = sorted.reduce(
      (sum, f, i) => sum - ((years[i] ?? 0) * f.amount) / (1 + rate) ** ((years[i] ?? 0) + 1),
      0,
    );
    if (!Number.isFinite(value) || !Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-8) return round(next);
    rate = next;
  }

  // Bisection fallback.
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let k = 0; k < 200; k += 1) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < 1e-9 || hi - lo < 1e-10) return round(mid);
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return round((lo + hi) / 2);
}

/**
 * Chains sub-period returns into a cumulative time-weighted return. Intervals
 * whose invested base (start value + net contribution) is non-positive are
 * skipped (no measurable return). Returns null if no interval is measurable.
 */
export function computeTwr(intervals: TwrInterval[]): number | null {
  let product = 1;
  let measured = false;
  for (const iv of intervals) {
    const base = iv.startValue + iv.netContribution;
    if (base <= 0) continue;
    const factor = (iv.endValue + iv.income) / base;
    if (!Number.isFinite(factor) || factor <= 0) continue;
    product *= factor;
    measured = true;
  }
  return measured ? product - 1 : null;
}

/** Reporting-currency cash impact of a trade: buy is negative (paid), sell positive. */
function tradeCashAmount(tx: SeriesPosition['transactions'][number]): Decimal {
  const gross = new D(tx.quantity).times(new D(tx.price));
  const fee = new D(tx.fee);
  return tx.side === 'buy' ? gross.plus(fee).negated() : gross.minus(fee);
}

function numeric(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseFloat(value);
}

function parseDate(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
}

function round(rate: number): number {
  return Math.round(rate * 1e6) / 1e6;
}

function pct(rate: number): string {
  return (rate * 100).toFixed(2);
}
