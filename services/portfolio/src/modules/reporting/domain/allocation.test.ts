import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllocation } from './allocation.js';
import { perf, view, listing } from './view.fixtures.js';

const names = new Map([['A', 'Main'], ['B', 'Trading']]);
const views = [
  view({ id: 'p1', portfolio_id: 'A', listing_id: 'LX', listing: listing('X', 'X', 'EUR'), performance: perf({ current_value_reporting: '1000.00', daily_change_amount_reporting: '30.00', daily_change_pct: '3.00' }) }),
  view({ id: 'p2', portfolio_id: 'B', listing_id: 'LY', listing: listing('Y', 'Y', 'USD'), performance: perf({ current_value_reporting: '3000.00', daily_change_amount_reporting: '-100.00', daily_change_pct: '-3.20' }) }),
];

describe('computeAllocation', () => {
  const r = computeAllocation(views, names);

  test('breaks down value by every dimension', () => {
    assert.equal(r.total_value, '4000.00');
    assert.deepEqual(r.by_instrument.map((s) => [s.label, s.weight_pct]), [['Y', '75.00'], ['X', '25.00']]);
    assert.deepEqual(r.by_currency.map((s) => [s.label, s.weight_pct]), [['USD', '75.00'], ['EUR', '25.00']]);
    assert.deepEqual(r.by_portfolio.map((s) => [s.label, s.weight_pct]), [['Trading', '75.00'], ['Main', '25.00']]);
    assert.deepEqual(r.by_asset_type.map((s) => [s.label, s.weight_pct]), [['equity', '100.00']]);
  });

  test('flags concentration above the threshold', () => {
    assert.equal(r.intelligence.largest_concentration?.symbol, 'Y');
    assert.equal(r.intelligence.largest_concentration?.weight_pct, '75.00');
    assert.equal(r.intelligence.largest_concentration?.exceeds_threshold, true);
    assert.equal(r.intelligence.concentration_threshold_pct, '25.00');
  });

  test('picks the largest absolute daily mover', () => {
    assert.equal(r.intelligence.top_mover?.symbol, 'Y');
    assert.equal(r.intelligence.top_mover?.daily_change_amount, '-100.00');
  });

  test('excludes unpriced positions from the total', () => {
    const withUnpriced = [...views, view({ id: 'p3', portfolio_id: 'A', listing_id: 'LZ', listing: listing('Z', 'Z'), performance: perf({ current_value_reporting: null }) })];
    assert.equal(computeAllocation(withUnpriced, names).total_value, '4000.00');
  });
});
