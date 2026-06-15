import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  computePerformanceSeries,
  buildSampleDates,
  isOwnedAt,
  type PerformancePoint,
  type SeriesPosition,
  type SeriesCashFlow,
} from './performance-series.js';
import type { LedgerTransaction } from '../../positions/domain/realization.js';

const dec = (v: string) => new Decimal(v);

/** Indexed access with a defined-check (the repo uses noUncheckedIndexedAccess). */
function at<T>(arr: T[], i: number): T {
  const value = arr[i];
  assert.ok(value !== undefined, `expected an element at index ${i}`);
  return value;
}

function tx(side: 'buy' | 'sell', quantity: string, price: string, date: string, currency = 'EUR'): LedgerTransaction {
  return { side, quantity, price, fee: '0', currency, tax_relevant_value_date: date };
}

/** A close-price lookup from a sorted {date: price} map (latest on or before). */
function pricer(map: Record<string, string>): (date: string) => Decimal | null {
  const entries = Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1));
  return (date: string) => {
    let found: string | null = null;
    for (const [d, p] of entries) {
      if (d <= date) found = p;
      else break;
    }
    return found === null ? null : dec(found);
  };
}

function position(
  over: Partial<SeriesPosition> & Pick<SeriesPosition, 'transactions' | 'priceOnOrBefore'>,
): SeriesPosition {
  return { method: 'fifo', listingCurrency: 'EUR', ...over };
}

// EUR reporting: no FX needed (rate lookup should never be hit for EUR amounts).
const noFx = () => {
  throw new Error('FX rate should not be requested for EUR amounts');
};

describe('computePerformanceSeries — single EUR position', () => {
  const pos = position({
    transactions: [tx('buy', '10', '100', '2026-01-10')],
    priceOnOrBefore: pricer({ '2026-01-10': '100', '2026-01-15': '120', '2026-01-20': '90' }),
  });

  const series = computePerformanceSeries({
    sampleDates: ['2026-01-09', '2026-01-10', '2026-01-15', '2026-01-20'],
    reportingCurrency: 'EUR',
    positions: [pos],
    cashFlows: [],
    rateOnOrBefore: noFx,
  });

  test('is zero before the first trade settles', () => {
    assert.equal(at(series, 0).value, '0.00');
    assert.equal(at(series, 0).invested_capital, '0.00');
    assert.equal(at(series, 0).total_pnl, '0.00');
  });

  test('marks holdings to the day close', () => {
    assert.equal(at(series, 1).value, '1000.00'); // 10 × 100, at cost
    assert.equal(at(series, 1).invested_capital, '1000.00');
    assert.equal(at(series, 1).unrealized_pnl, '0.00');

    assert.equal(at(series, 2).value, '1200.00'); // 10 × 120
    assert.equal(at(series, 2).unrealized_pnl, '200.00');
    assert.equal(at(series, 2).total_pnl, '200.00');

    assert.equal(at(series, 3).value, '900.00'); // price fell below cost
    assert.equal(at(series, 3).unrealized_pnl, '-100.00');
  });

  test('all points are complete', () => {
    assert.ok(series.every((p) => p.complete));
  });
});

describe('computePerformanceSeries — realized P&L after a sell', () => {
  const pos = position({
    transactions: [tx('buy', '10', '100', '2026-01-10'), tx('sell', '4', '150', '2026-01-15')],
    priceOnOrBefore: pricer({ '2026-01-10': '100', '2026-01-15': '150' }),
  });

  const series = computePerformanceSeries({
    sampleDates: ['2026-01-12', '2026-01-15'],
    reportingCurrency: 'EUR',
    positions: [pos],
    cashFlows: [],
    rateOnOrBefore: noFx,
  });

  test('before the sell: full holding, no realized', () => {
    assert.equal(at(series, 0).value, '1000.00');
    assert.equal(at(series, 0).realized_pnl, '0.00');
  });

  test('after the sell: realized booked and holding reduced', () => {
    // Sold 4 @ 150 with cost 100 → realized 200; 6 remain at 150 → value 900, cost 600.
    const p = at(series, 1);
    assert.equal(p.realized_pnl, '200.00');
    assert.equal(p.value, '900.00');
    assert.equal(p.invested_capital, '600.00');
    assert.equal(p.unrealized_pnl, '300.00');
    assert.equal(p.total_pnl, '500.00'); // 200 realized + 300 unrealized
  });
});

describe('isOwnedAt — ownership windows', () => {
  test('undefined windows = always owned', () => {
    assert.equal(isOwnedAt(undefined, '2026-01-01'), true);
  });
  test('half-open [from, to): from inclusive, to exclusive', () => {
    const w = [{ from: null, to: '2026-01-15' }];
    assert.equal(isOwnedAt(w, '2026-01-14'), true);
    assert.equal(isOwnedAt(w, '2026-01-15'), false); // transfer-out day no longer owned
  });
  test('open-ended window from a transfer-in date', () => {
    const w = [{ from: '2026-01-15', to: null }];
    assert.equal(isOwnedAt(w, '2026-01-14'), false);
    assert.equal(isOwnedAt(w, '2026-01-15'), true);
  });
  test('re-entry (A→B→A) leaves a gap', () => {
    const w = [{ from: null, to: '2026-01-10' }, { from: '2026-01-20', to: null }];
    assert.equal(isOwnedAt(w, '2026-01-09'), true);
    assert.equal(isOwnedAt(w, '2026-01-15'), false); // belonged to B in between
    assert.equal(isOwnedAt(w, '2026-01-21'), true);
  });
});

describe('computePerformanceSeries — transfer attribution (cost-basis)', () => {
  // Bought 10 @ 100 on the 10th; whole-transferred between portfolios on the 15th.
  const txns = [tx('buy', '10', '100', '2026-01-10')];
  const prices = pricer({ '2026-01-10': '100', '2026-01-15': '120', '2026-01-20': '90' });
  const sampleDates = ['2026-01-12', '2026-01-15', '2026-01-20'];

  const source = computePerformanceSeries({
    sampleDates,
    reportingCurrency: 'EUR',
    positions: [position({ transactions: txns, priceOnOrBefore: prices, ownershipWindows: [{ from: null, to: '2026-01-15' }] })],
    cashFlows: [],
    rateOnOrBefore: noFx,
  });

  const destination = computePerformanceSeries({
    sampleDates,
    reportingCurrency: 'EUR',
    positions: [position({ transactions: txns, priceOnOrBefore: prices, ownershipWindows: [{ from: '2026-01-15', to: null }] })],
    cashFlows: [],
    rateOnOrBefore: noFx,
  });

  test('source counts the holding only before the transfer', () => {
    assert.equal(at(source, 0).value, '1000.00'); // 01-12: owned
    assert.equal(at(source, 1).value, '0.00'); // 01-15: transferred out
    assert.equal(at(source, 2).value, '0.00');
  });

  test('destination counts the holding only from the transfer', () => {
    assert.equal(at(destination, 0).value, '0.00'); // 01-12: not yet owned
    assert.equal(at(destination, 1).value, '1200.00'); // 01-15: owned, 10 × 120
    assert.equal(at(destination, 2).value, '900.00'); // 10 × 90
  });

  test('the two sides reconstruct the undivided holding (combined is unaffected)', () => {
    const combined = computePerformanceSeries({
      sampleDates,
      reportingCurrency: 'EUR',
      positions: [position({ transactions: txns, priceOnOrBefore: prices })], // no windows
      cashFlows: [],
      rateOnOrBefore: noFx,
    });
    for (let i = 0; i < sampleDates.length; i += 1) {
      const sum = Number(at(source, i).value) + Number(at(destination, i).value);
      assert.equal(sum, Number(at(combined, i).value));
    }
  });
});

describe('computePerformanceSeries — FX (USD listing, EUR reporting)', () => {
  const pos = position({
    listingCurrency: 'USD',
    transactions: [tx('buy', '10', '100', '2026-01-10', 'USD')],
    priceOnOrBefore: pricer({ '2026-01-10': '100', '2026-01-20': '120' }),
  });

  // USD per EUR: parity early, stronger EUR later.
  const rates: Record<string, string> = { '2026-01-10': '1.00', '2026-01-20': '1.20' };
  const rateOnOrBefore = (currency: string, date: string) => {
    assert.equal(currency, 'USD');
    let found: string | null = null;
    for (const [d, r] of Object.entries(rates)) if (d <= date) found = r;
    return found === null ? null : dec(found);
  };

  const series = computePerformanceSeries({
    sampleDates: ['2026-01-10', '2026-01-20'],
    reportingCurrency: 'EUR',
    positions: [pos],
    cashFlows: [],
    rateOnOrBefore,
  });

  test('converts value and cost at the day FX', () => {
    assert.equal(at(series, 0).value, '1000.00'); // $1000 / 1.00
    assert.equal(at(series, 1).value, '1000.00'); // $1200 / 1.20
    assert.equal(at(series, 1).invested_capital, '833.33'); // $1000 / 1.20
  });
});

describe('computePerformanceSeries — cash flows', () => {
  const flows: SeriesCashFlow[] = [
    { type: 'deposit', amount: dec('1000'), currency: 'EUR', valueDate: '2026-01-05' },
    { type: 'withdrawal', amount: dec('200'), currency: 'EUR', valueDate: '2026-01-12' },
    { type: 'dividend', amount: dec('30'), currency: 'EUR', valueDate: '2026-01-12' },
  ];

  const series = computePerformanceSeries({
    sampleDates: ['2026-01-04', '2026-01-10', '2026-01-15'],
    reportingCurrency: 'EUR',
    positions: [],
    cashFlows: flows,
    rateOnOrBefore: noFx,
  });

  test('accumulates net contributions and dividends by value date', () => {
    assert.equal(at(series, 0).net_contributed, '0.00');
    assert.equal(at(series, 1).net_contributed, '1000.00');
    assert.equal(at(series, 1).dividends, '0.00');
    assert.equal(at(series, 2).net_contributed, '800.00'); // 1000 − 200
    assert.equal(at(series, 2).dividends, '30.00');
    assert.equal(at(series, 2).total_pnl, '30.00'); // dividends only (no holdings)
  });
});

describe('computePerformanceSeries — completeness', () => {
  const pos = position({
    transactions: [tx('buy', '5', '100', '2026-01-10')],
    priceOnOrBefore: pricer({ '2026-01-15': '110' }), // no price on/before the 10th
  });

  const series = computePerformanceSeries({
    sampleDates: ['2026-01-10', '2026-01-15'],
    reportingCurrency: 'EUR',
    positions: [pos],
    cashFlows: [],
    rateOnOrBefore: noFx,
  });

  test('flags a day where an open holding cannot be priced', () => {
    assert.equal(at(series, 0).complete, false);
    assert.equal(at(series, 0).value, '0.00'); // unpriced holding skipped
    assert.equal(at(series, 1).complete, true);
    assert.equal(at(series, 1).value, '550.00');
  });
});

describe('buildSampleDates', () => {
  const first = (dates: string[]) => at(dates, 0);
  const last = (dates: string[]) => at(dates, dates.length - 1);

  test('1W yields 7 daily points ending today', () => {
    const dates = buildSampleDates('1W', '2020-01-01', '2026-06-15');
    assert.equal(dates.length, 7);
    assert.equal(first(dates), '2026-06-09');
    assert.equal(last(dates), '2026-06-15');
  });

  test('YTD starts at Jan 1', () => {
    const dates = buildSampleDates('YTD', '2020-01-01', '2026-06-15');
    assert.equal(first(dates), '2026-01-01');
    assert.equal(last(dates), '2026-06-15');
  });

  test('start is clamped to first activity', () => {
    const dates = buildSampleDates('1Y', '2026-06-10', '2026-06-15');
    assert.equal(first(dates), '2026-06-10');
  });

  test('a long ALL range is strided but always ends today', () => {
    const dates = buildSampleDates('ALL', '2010-01-01', '2026-06-15');
    assert.ok(dates.length <= 367, `expected <= 367 points, got ${dates.length}`);
    assert.equal(first(dates), '2010-01-01');
    assert.equal(last(dates), '2026-06-15');
  });

  test('no activity collapses to a single point', () => {
    const dates = buildSampleDates('ALL', null, '2026-06-15');
    assert.deepEqual(dates, ['2026-06-15']);
  });
});
