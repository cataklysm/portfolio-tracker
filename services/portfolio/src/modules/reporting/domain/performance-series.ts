import type Decimal from 'decimal.js';
import { D } from '../../positions/domain/money.js';
import {
  computeRealization,
  type AccountingMethod,
  type LedgerTransaction,
  type SplitAdjustment,
} from '../../positions/domain/realization.js';

export type PerformancePeriod = '1W' | '1M' | 'YTD' | '1Y' | 'ALL';

export const PERFORMANCE_PERIODS: PerformancePeriod[] = ['1W', '1M', 'YTD', '1Y', 'ALL'];

/** Caps the number of points so a long `ALL` range degrades to coarser sampling. */
const MAX_POINTS = 366;

/** One position's ledger plus how to price it, for the historical reconstruction. */
export interface SeriesPosition {
  /** Authoritative ledger in creation (ledger) order. */
  transactions: LedgerTransaction[];
  method: AccountingMethod;
  listingCurrency: string;
  /** Daily close on or before a date (YYYY-MM-DD), in the listing currency; null if none. */
  priceOnOrBefore: (date: string) => Decimal | null;
  /** Applied split adjustments; only those effective on/before each sample date apply. */
  splits?: SplitAdjustment[];
}

/** An external/​income cash flow contributing to contributed capital and dividends. */
export interface SeriesCashFlow {
  type: 'deposit' | 'withdrawal' | 'dividend' | 'cash_in_lieu';
  /** Net amount in `currency` (always positive; sign is implied by `type`). */
  amount: Decimal;
  currency: string;
  valueDate: string;
}

export interface PerformanceSeriesInput {
  /** Ascending sample dates (YYYY-MM-DD) to evaluate the series at. */
  sampleDates: string[];
  reportingCurrency: string;
  positions: SeriesPosition[];
  cashFlows: SeriesCashFlow[];
  /**
   * EUR-based rate (units of `currency` per 1 EUR) on or before `date`, or null
   * if unknown. EUR is implicit (rate 1) and never queried.
   */
  rateOnOrBefore: (currency: string, date: string) => Decimal | null;
}

export interface PerformancePoint {
  date: string;
  /** Market value of open holdings at the day's close, reporting currency. */
  value: string;
  /** Open cost basis of holdings at the day's FX, reporting currency. */
  invested_capital: string;
  /** Cumulative net external contributions (deposits − withdrawals) to date. */
  net_contributed: string;
  /** Cumulative realized P&L to date (per-sell value-date FX), reporting currency. */
  realized_pnl: string;
  /** value − invested_capital, reporting currency. */
  unrealized_pnl: string;
  /** Cumulative dividends/cash-in-lieu to date (value-date FX), reporting currency. */
  dividends: string;
  /** realized + unrealized + dividends, reporting currency. */
  total_pnl: string;
  /** False when an open holding was unpriced or a needed FX rate was missing that day. */
  complete: boolean;
}

const INCOME_TYPES = new Set<SeriesCashFlow['type']>(['dividend', 'cash_in_lieu']);

/**
 * Builds a converter from a trade currency to the reporting currency at a given
 * date's EUR-based FX (pivoting through EUR), returning null when a needed rate
 * is missing. Shared by the value series and the return calculations so both use
 * identical conversion semantics.
 */
export function makeRateConverter(
  rateOnOrBefore: (currency: string, date: string) => Decimal | null,
  reportingCurrency: string,
): (amount: Decimal, fromCurrency: string, atDate: string) => Decimal | null {
  return (amount, fromCurrency, atDate) => {
    if (fromCurrency === reportingCurrency) return amount;
    const fromRate = fromCurrency === 'EUR' ? new D(1) : rateOnOrBefore(fromCurrency, atDate);
    const toRate = reportingCurrency === 'EUR' ? new D(1) : rateOnOrBefore(reportingCurrency, atDate);
    if (fromRate === null || toRate === null || fromRate.lte(0)) return null;
    return amount.div(fromRate).times(toRate);
  };
}

/**
 * Reconstructs a portfolio's value, contributed capital, and cumulative P&L at
 * each sample date by replaying every position's ledger as of that date and
 * marking holdings to the day's close. Conventions mirror the live snapshot
 * (`computeSummary`): market value and open cost basis convert at the day's FX
 * rate, while realized P&L and dividends convert at each event's own value-date
 * FX — so the last point reconciles with `/reporting/summary`. A point is
 * `complete: false` when an open holding could not be priced or converted that
 * day; the value still sums the holdings that could be, matching the snapshot's
 * partial-completeness behaviour.
 */
export function computePerformanceSeries(input: PerformanceSeriesInput): PerformancePoint[] {
  const { sampleDates, reportingCurrency, positions, cashFlows, rateOnOrBefore } = input;

  // Converts a trade-currency amount to the reporting currency at `atDate`'s FX.
  const convertAt = makeRateConverter(rateOnOrBefore, reportingCurrency);

  // Converts at the event's own value date, falling back to the sample date's
  // rate when the value-date rate is missing (mirrors the snapshot fallback).
  const convertDated = (
    amount: Decimal,
    currency: string,
    valueDate: string,
    sampleDate: string,
  ): Decimal | null => convertAt(amount, currency, valueDate) ?? convertAt(amount, currency, sampleDate);

  return sampleDates.map((date) => {
    let value = new D(0);
    let invested = new D(0);
    let realized = new D(0);
    let complete = true;

    for (const pos of positions) {
      const ledger = pos.transactions.filter((tx) => (tx.tax_relevant_value_date ?? '') <= date);
      if (ledger.length === 0) continue;

      const r = computeRealization(ledger, pos.method, pos.splits ?? [], date);
      if (r.invalid) {
        complete = false; // a broken ledger as of this date — cannot value it
        continue;
      }

      // Cumulative realized P&L from the sells that had settled by this date.
      for (const ev of r.realizedByDate) {
        const converted = convertDated(ev.amount, ev.currency, ev.valueDate, date);
        if (converted === null) {
          complete = false;
          continue;
        }
        realized = realized.plus(converted);
      }

      if (r.openQuantity.lte(0)) continue; // fully closed by this date: no value/cost

      const price = pos.priceOnOrBefore(date);
      if (price === null) {
        complete = false; // held but unpriced that day
        continue;
      }
      const valueReporting = convertAt(r.openQuantity.times(price), pos.listingCurrency, date);
      const costReporting = convertAt(r.openCostBasis, pos.listingCurrency, date);
      if (valueReporting === null || costReporting === null) {
        complete = false;
        continue;
      }
      value = value.plus(valueReporting);
      invested = invested.plus(costReporting);
    }

    let netContributed = new D(0);
    let dividends = new D(0);
    for (const flow of cashFlows) {
      if (flow.valueDate > date) continue;
      const converted = convertDated(flow.amount, flow.currency, flow.valueDate, date);
      if (converted === null) {
        complete = false;
        continue;
      }
      if (INCOME_TYPES.has(flow.type)) dividends = dividends.plus(converted);
      else if (flow.type === 'deposit') netContributed = netContributed.plus(converted);
      else if (flow.type === 'withdrawal') netContributed = netContributed.minus(converted);
    }

    const unrealized = value.minus(invested);
    const totalPnl = realized.plus(unrealized).plus(dividends);

    return {
      date,
      value: value.toFixed(2),
      invested_capital: invested.toFixed(2),
      net_contributed: netContributed.toFixed(2),
      realized_pnl: realized.toFixed(2),
      unrealized_pnl: unrealized.toFixed(2),
      dividends: dividends.toFixed(2),
      total_pnl: totalPnl.toFixed(2),
      complete,
    };
  });
}

/**
 * Ascending sample dates (YYYY-MM-DD) for a period, ending at `today`. The start
 * is clamped to `firstActivity` (no point precedes any holding), and a span
 * longer than `MAX_POINTS` days is strided to coarser, evenly spaced samples
 * that always include the final day.
 */
export function buildSampleDates(
  period: PerformancePeriod,
  firstActivity: string | null,
  today: string,
): string[] {
  const end = parseDate(today);
  let start: Date;
  switch (period) {
    case '1W':
      start = addDays(end, -6);
      break;
    case '1M':
      start = addDays(end, -29);
      break;
    case 'YTD':
      start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
      break;
    case '1Y':
      start = addDays(end, -364);
      break;
    case 'ALL':
      start = firstActivity ? parseDate(firstActivity) : end;
      break;
  }
  if (firstActivity) {
    const first = parseDate(firstActivity);
    if (first > start) start = first;
  }
  if (start > end) start = end;

  const spanDays = daysBetween(start, end);
  const stride = Math.ceil((spanDays + 1) / MAX_POINTS);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, stride)) dates.push(fmt(d));
  const last = fmt(end);
  if (dates[dates.length - 1] !== last) dates.push(last);
  return dates;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
