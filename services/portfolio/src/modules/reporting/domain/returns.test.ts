import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { computeXirr, computeTwr, computeReturns, type XirrFlow, type TwrInterval } from './returns.js';
import type { PerformancePoint, SeriesPosition, SeriesCashFlow } from './performance-series.js';
import type { LedgerTransaction } from '../../positions/domain/realization.js';

const approx = (actual: number | null, expected: number, tol = 1e-4) => {
  assert.ok(actual !== null, 'expected a value, got null');
  assert.ok(Math.abs(actual - expected) < tol, `expected ≈ ${expected}, got ${actual}`);
};

describe('computeXirr', () => {
  test('a one-year 10% gain returns ~0.10', () => {
    const flows: XirrFlow[] = [
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ];
    approx(computeXirr(flows), 0.1);
  });

  test('annualizes a sub-year holding period', () => {
    // +5% over ~half a year ≈ ~10.2% annualized.
    const flows: XirrFlow[] = [
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-07-02', amount: 1050 },
    ];
    const r = computeXirr(flows);
    assert.ok(r !== null && r > 0.09 && r < 0.11, `got ${r}`);
  });

  test('requires both an inflow and an outflow', () => {
    assert.equal(computeXirr([{ date: '2025-01-01', amount: -100 }]), null);
    assert.equal(
      computeXirr([
        { date: '2025-01-01', amount: 100 },
        { date: '2026-01-01', amount: 200 },
      ]),
      null,
    );
  });

  test('handles intermediate contributions', () => {
    const flows: XirrFlow[] = [
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-07-01', amount: -1000 },
      { date: '2026-01-01', amount: 2200 },
    ];
    const r = computeXirr(flows);
    assert.ok(r !== null && r > 0 && Number.isFinite(r), `got ${r}`);
  });
});

describe('computeTwr', () => {
  test('a single 10% interval', () => {
    approx(computeTwr([{ startValue: 1000, endValue: 1100, netContribution: 0, income: 0 }]), 0.1);
  });

  test('chains sub-period returns geometrically', () => {
    const intervals: TwrInterval[] = [
      { startValue: 1000, endValue: 1100, netContribution: 0, income: 0 },
      { startValue: 1100, endValue: 1210, netContribution: 0, income: 0 },
    ];
    approx(computeTwr(intervals), 0.21); // 1.1 × 1.1 − 1
  });

  test('neutralizes a mid-interval contribution', () => {
    // Start 1000, +500 bought, end 1600 → the 100 of price gain is 1600/1500 − 1.
    approx(computeTwr([{ startValue: 1000, endValue: 1600, netContribution: 500, income: 0 }]), 1600 / 1500 - 1);
  });

  test('counts income toward the period return', () => {
    approx(computeTwr([{ startValue: 1000, endValue: 1000, netContribution: 0, income: 50 }]), 0.05);
  });

  test('returns null when no interval has a positive base', () => {
    assert.equal(computeTwr([{ startValue: 0, endValue: 0, netContribution: 0, income: 0 }]), null);
  });
});

// --- computeReturns integration --------------------------------------------

function tx(side: 'buy' | 'sell', quantity: string, price: string, date: string): LedgerTransaction {
  return { side, quantity, price, fee: '0', currency: 'EUR', tax_relevant_value_date: date };
}

function point(date: string, value: string): PerformancePoint {
  return {
    date,
    value,
    invested_capital: value,
    net_contributed: '0.00',
    realized_pnl: '0.00',
    unrealized_pnl: '0.00',
    dividends: '0.00',
    total_pnl: '0.00',
    complete: true,
  };
}

function position(transactions: LedgerTransaction[]): SeriesPosition {
  return { transactions, method: 'fifo', listingCurrency: 'EUR', priceOnOrBefore: () => null };
}

describe('computeReturns', () => {
  test('a held EUR position: XIRR and TWR agree with no interim flows', () => {
    const result = computeReturns({
      sampleDates: ['2025-01-01', '2026-01-01'],
      points: [point('2025-01-01', '1000.00'), point('2026-01-01', '1100.00')],
      positions: [position([tx('buy', '10', '100', '2025-01-01')])],
      cashFlows: [],
      reportingCurrency: 'EUR',
      rateOnOrBefore: () => null,
    });
    // Starting value 1000 (outflow) → 1100 terminal: 10% both ways.
    assert.equal(result.money_weighted, '10.00');
    assert.equal(result.time_weighted, '10.00');
  });

  test('a dividend lifts the time-weighted return', () => {
    const flows: SeriesCashFlow[] = [
      { type: 'dividend', amount: new Decimal('50'), currency: 'EUR', valueDate: '2025-07-01' },
    ];
    const result = computeReturns({
      sampleDates: ['2025-01-01', '2025-07-01', '2026-01-01'],
      points: [point('2025-01-01', '1000.00'), point('2025-07-01', '1000.00'), point('2026-01-01', '1000.00')],
      positions: [position([tx('buy', '10', '100', '2025-01-01')])],
      cashFlows: flows,
      reportingCurrency: 'EUR',
      rateOnOrBefore: () => null,
    });
    // Flat value but a 50 dividend on 1000 → 5% time-weighted.
    approx(Number.parseFloat(result.time_weighted ?? '0') / 100, 0.05);
    assert.ok(result.money_weighted !== null);
  });

  test('too little history yields nulls', () => {
    const result = computeReturns({
      sampleDates: ['2026-01-01'],
      points: [point('2026-01-01', '1000.00')],
      positions: [],
      cashFlows: [],
      reportingCurrency: 'EUR',
      rateOnOrBefore: () => null,
    });
    assert.deepEqual(result, { money_weighted: null, time_weighted: null });
  });
});
