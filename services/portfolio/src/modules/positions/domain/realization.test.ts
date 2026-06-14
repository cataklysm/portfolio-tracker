import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { D } from './money.js';
import { computeRealization, type LedgerTransaction } from './realization.js';

const tx = (
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  fee: string,
  date: string,
): LedgerTransaction => ({ side, quantity, price, fee, currency: 'USD', tax_relevant_value_date: date });

// Two lots then a partial sell: lot1 unitCost (1000+5)/10 = 100.5, lot2 (1200+5)/10 = 120.5.
const ledger: LedgerTransaction[] = [
  tx('buy', '10', '100', '5', '2024-01-02'),
  tx('buy', '10', '120', '5', '2024-03-01'),
  tx('sell', '10', '150', '5', '2024-06-03'),
];

describe('computeRealization', () => {
  test('FIFO consumes the first lot', () => {
    const r = computeRealization(ledger, 'fifo');
    assert.equal(r.invalid, false);
    assert.equal(r.realizedPnl.toFixed(2), '490.00'); // 1500 - 5 - 1005
    assert.equal(r.openQuantity.toFixed(0), '10');
    assert.equal(r.openCostBasis.toFixed(2), '1205.00'); // remaining lot2
    assert.equal(r.realizedCostBasis.toFixed(2), '1005.00');
    assert.equal(r.totalFees.toFixed(2), '15.00');
  });

  test('LIFO consumes the last lot', () => {
    const r = computeRealization(ledger, 'lifo');
    assert.equal(r.realizedPnl.toFixed(2), '290.00'); // 1500 - 5 - 1205
    assert.equal(r.openCostBasis.toFixed(2), '1005.00');
  });

  test('average cost uses the blended unit cost', () => {
    const r = computeRealization(ledger, 'average_cost');
    // avg unit cost = (1005 + 1205) / 20 = 110.5 → consumed 1105
    assert.equal(r.realizedPnl.toFixed(2), '390.00'); // 1500 - 5 - 1105
    assert.equal(r.openCostBasis.toFixed(2), '1105.00');
  });

  test('emits dated realized + fee events (FIFO)', () => {
    const r = computeRealization(ledger, 'fifo');
    assert.equal(r.realizedByDate.length, 1);
    assert.equal(r.realizedByDate[0]!.amount.toFixed(2), '490.00');
    assert.equal(r.realizedByDate[0]!.valueDate, '2024-06-03');
    assert.equal(r.realizedByDate[0]!.currency, 'USD');
    // one fee event per transaction
    assert.equal(r.feesByDate.length, 3);
    assert.deepEqual(r.feesByDate.map((e) => e.valueDate), ['2024-01-02', '2024-03-01', '2024-06-03']);
  });

  test('an oversell marks the result invalid', () => {
    const r = computeRealization([tx('buy', '5', '100', '0', '2024-01-02'), tx('sell', '10', '150', '0', '2024-02-02')], 'fifo');
    assert.equal(r.invalid, true);
    assert.equal(r.openQuantity.toFixed(0), '0');
    assert.equal(r.realizedByDate.length, 0);
  });

  test('dated-event sums reconcile with the aggregates', () => {
    const r = computeRealization(ledger, 'fifo');
    const realizedSum = r.realizedByDate.reduce((s, e) => s.plus(e.amount), D(0));
    const feeSum = r.feesByDate.reduce((s, e) => s.plus(e.amount), D(0));
    assert.equal(realizedSum.toFixed(2), r.realizedPnl.toFixed(2));
    assert.equal(feeSum.toFixed(2), r.totalFees.toFixed(2));
  });
});
