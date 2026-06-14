import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type Decimal from 'decimal.js';
import { D } from './money.js';
import { computeRealization, type LedgerTransaction } from './realization.js';
import { computeTransactionPerformance } from './transaction-performance.js';

const idTx = (
  id: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  fee: string,
  date: string,
): LedgerTransaction => ({ id, side, quantity, price, fee, currency: 'USD', tax_relevant_value_date: date });

// USD→EUR latest rate: halve. Value-date rate: ×0.8. (Distinct so the test can
// tell which converter was applied to which field.)
const convertToReporting = (amount: Decimal) => amount.times(0.5);
const convertAt = (amount: Decimal) => amount.times(0.8);

const ledger: LedgerTransaction[] = [
  idTx('b1', 'buy', '10', '100', '5', '2024-01-02'), // unit cost 100.5
  idTx('b2', 'buy', '10', '120', '5', '2024-03-01'), // unit cost 120.5
  idTx('s1', 'sell', '10', '150', '5', '2024-06-03'), // realized 490 (FIFO)
];

describe('computeTransactionPerformance', () => {
  test('sell row carries realized P&L at the value-date rate, open fields null', () => {
    const r = computeRealization(ledger, 'fifo');
    const m = computeTransactionPerformance({ byTransaction: r.byTransaction, latestPrice: null, convertToReporting, convertAt });
    const sell = m.get('s1')!;
    assert.equal(sell.realized_pnl, '490.00');
    assert.equal(sell.realized_pnl_reporting, '392.00'); // 490 × 0.8 (value-date FX)
    assert.equal(sell.consumed_cost_basis, '1005.00');
    assert.equal(sell.remaining_quantity, null);
    assert.equal(sell.unrealized_pnl, null);
    assert.equal(sell.attribution, 'fifo');
  });

  test('open FIFO buy lot marks unrealized P&L to the latest price and rate', () => {
    const r = computeRealization(ledger, 'fifo');
    const m = computeTransactionPerformance({ byTransaction: r.byTransaction, latestPrice: new D(160), convertToReporting, convertAt });
    const open = m.get('b2')!; // 10 open, cost 1205
    assert.equal(open.remaining_quantity, '10.00000000');
    assert.equal(open.unrealized_pnl, '395.00'); // 10×160 − 1205
    assert.equal(open.unrealized_pnl_reporting, '197.50'); // ×0.5 (latest FX)
    assert.equal(open.realized_pnl, null);
  });

  test('fully consumed buy lot shows zero remaining and no unrealized P&L', () => {
    const r = computeRealization(ledger, 'fifo');
    const m = computeTransactionPerformance({ byTransaction: r.byTransaction, latestPrice: new D(160), convertToReporting, convertAt });
    const consumed = m.get('b1')!;
    assert.equal(consumed.remaining_quantity, '0.00000000');
    assert.equal(consumed.unrealized_pnl, null);
    assert.equal(consumed.unrealized_pnl_reporting, null);
  });

  test('without a latest price, remaining quantity stands but unrealized is null', () => {
    const r = computeRealization(ledger, 'fifo');
    const m = computeTransactionPerformance({ byTransaction: r.byTransaction, latestPrice: null, convertToReporting, convertAt });
    const open = m.get('b2')!;
    assert.equal(open.remaining_quantity, '10.00000000');
    assert.equal(open.unrealized_pnl, null);
  });

  test('average cost leaves buy rows blank but still attributes the sell', () => {
    const r = computeRealization(ledger, 'average_cost');
    const m = computeTransactionPerformance({ byTransaction: r.byTransaction, latestPrice: new D(160), convertToReporting, convertAt });
    const buy = m.get('b1')!;
    assert.equal(buy.remaining_quantity, null);
    assert.equal(buy.unrealized_pnl, null);
    assert.equal(buy.attribution, 'average_cost');
    assert.equal(m.get('s1')!.realized_pnl, '390.00');
  });

  test('falls back to the latest rate for realized P&L when no dated converter is given', () => {
    const r = computeRealization(ledger, 'fifo');
    const m = computeTransactionPerformance({ byTransaction: r.byTransaction, latestPrice: null, convertToReporting });
    assert.equal(m.get('s1')!.realized_pnl_reporting, '245.00'); // 490 × 0.5 (latest FX)
  });
});
