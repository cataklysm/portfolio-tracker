import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { computeHoldings } from './holdings.js';
import { perf, view, listing } from './view.fixtures.js';

const names = new Map([['A', 'Main'], ['B', 'Trading']]);

describe('computeHoldings', () => {
  test('merges the same instrument across portfolios into one group', () => {
    const views = [
      view({ id: 'p1', portfolio_id: 'A', listing_id: 'LX', listing: listing('X', 'X'), performance: perf({ open_quantity: '10', current_value_reporting: '1000.00', open_cost_basis_reporting: '800.00', unrealized_pnl_reporting: '200.00' }) }),
      view({ id: 'p2', portfolio_id: 'B', listing_id: 'LX', listing: listing('X', 'X'), performance: perf({ open_quantity: '5', current_value_reporting: '500.00', open_cost_basis_reporting: '400.00', unrealized_pnl_reporting: '100.00' }) }),
    ];
    const groups = computeHoldings(views, names, new Map([['X', new Decimal('50.00')]]));
    assert.equal(groups.length, 1);
    const x = groups[0]!;
    assert.equal(x.market_value, '1500.00');
    assert.equal(x.quantity, '15.00000000');
    assert.equal(x.weight_pct, '100.00');
    assert.deepEqual(x.portfolios.map((p) => p.name).sort(), ['Main', 'Trading']);
    assert.equal(x.dividends, '50.00');
    assert.equal(x.listings.length, 1); // both share one listing
  });

  test('weights are shares of total value and sum to 100', () => {
    const views = [
      view({ id: 'p1', portfolio_id: 'A', listing_id: 'LX', listing: listing('X', 'X'), performance: perf({ open_quantity: '1', current_value_reporting: '1000.00' }) }),
      view({ id: 'p2', portfolio_id: 'A', listing_id: 'LY', listing: listing('Y', 'Y'), performance: perf({ open_quantity: '1', current_value_reporting: '3000.00' }) }),
    ];
    const groups = computeHoldings(views, names, new Map());
    const weights = Object.fromEntries(groups.map((g) => [g.symbol, g.weight_pct]));
    assert.equal(weights['Y'], '75.00');
    assert.equal(weights['X'], '25.00');
    assert.equal(groups.reduce((s, g) => s + Number(g.weight_pct), 0), 100);
    assert.equal(groups[0]!.symbol, 'Y'); // sorted by value desc
  });

  test('realized P&L accrues from closed positions in the group', () => {
    const views = [
      view({ id: 'p1', portfolio_id: 'A', listing_id: 'LX', state: 'closed', listing: listing('X', 'X'), performance: perf({ realized_pnl_reporting: '150.00' }) }),
    ];
    const groups = computeHoldings(views, names, new Map());
    assert.equal(groups[0]!.realized_pnl, '150.00');
    assert.equal(groups[0]!.market_value, '0.00');
  });
});
