import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { computeSummary } from './summary.js';
import { perf, view, listing } from './view.fixtures.js';

const views = [
  view({ id: 'p1', portfolio_id: 'A', listing_id: 'LX', listing: listing('X', 'X'), performance: perf({ current_value_reporting: '1000.00', open_cost_basis_reporting: '800.00', unrealized_pnl_reporting: '200.00', daily_change_amount_reporting: '30.00', total_fees_reporting: '5.00' }) }),
  view({ id: 'p2', portfolio_id: 'B', listing_id: 'LX', listing: listing('X', 'X'), performance: perf({ current_value_reporting: '500.00', open_cost_basis_reporting: '400.00', unrealized_pnl_reporting: '100.00', daily_change_amount_reporting: '10.00', total_fees_reporting: '2.00' }) }),
  view({ id: 'p3', portfolio_id: 'A', listing_id: 'LY', state: 'closed', listing: listing('Y', 'Y'), freshness_status: null, performance: perf({ realized_pnl_reporting: '150.00', total_fees_reporting: '3.00' }) }),
  view({ id: 'p4', portfolio_id: 'A', listing_id: 'LZ', listing: listing('Z', 'Z'), performance: perf({ current_value_reporting: null }) }), // unpriced open
];

describe('computeSummary', () => {
  const s = computeSummary(views, { amount: new Decimal('50.00'), complete: true }, 'EUR', '2026-06-14T00:00:00Z', 'total_return');

  test('aggregates absolute amounts across positions', () => {
    assert.equal(s.current_value, '1500.00');
    assert.equal(s.invested_capital, '1200.00');
    assert.equal(s.unrealized_pnl, '300.00');
    assert.equal(s.realized_pnl, '150.00'); // includes the closed position
    assert.equal(s.fees, '10.00');
    assert.equal(s.dividends, '50.00');
    assert.equal(s.total_pnl, '500.00'); // realized + unrealized + dividends
  });

  test('percentages are denominator-correct, not averaged', () => {
    assert.equal(s.daily_change_amount, '40.00');
    assert.equal(s.daily_change_pct, '2.74'); // 40 / (1500 - 40)
    assert.equal(s.simple_return_pct, '25.00'); // 300 / 1200
    assert.equal(s.total_return_pct, '41.67'); // 500 / 1200
  });

  test('counts each state and flags unpriced as unavailable', () => {
    assert.deepEqual(s.counts, { open: 3, closed: 1, invalid: 0, stale: 0, unavailable: 1 });
  });

  test('completeness is partial when an open position is unpriced', () => {
    assert.equal(s.completeness, 'partial');
    assert.equal(s.preferred_headline_metric, 'total_return');
  });

  test('an incomplete dividend conversion makes the snapshot partial', () => {
    const priced = views.filter((v) => v.id !== 'p4');
    const s2 = computeSummary(priced, { amount: new Decimal('0'), complete: false }, 'EUR', 'now', null);
    assert.equal(s2.completeness, 'partial');
    assert.equal(s2.preferred_headline_metric, null);
  });
});
