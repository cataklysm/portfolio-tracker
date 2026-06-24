import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeRealization, type LedgerTransaction } from './realization.js';
import { buildRealizationView } from './realization-view.js';

const tx = (over: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'id' | 'side' | 'quantity' | 'price'>): LedgerTransaction => ({
  fee: '0',
  currency: 'EUR',
  tax_relevant_value_date: '2026-01-01',
  ...over,
});

describe('buildRealizationView (FIFO/LIFO)', () => {
  const transactions: LedgerTransaction[] = [
    tx({ id: 'b1', side: 'buy', quantity: '10', price: '100', fee: '10', tax_relevant_value_date: '2026-01-01' }),
    tx({ id: 'b2', side: 'buy', quantity: '10', price: '120', fee: '10', tax_relevant_value_date: '2026-02-01' }),
    tx({ id: 's1', side: 'sell', quantity: '15', price: '150', fee: '15', tax_relevant_value_date: '2026-03-01' }),
  ];

  test('builds one sell with its consumed buy lots; per-lot pieces reconcile', () => {
    const result = computeRealization(transactions, 'fifo');
    const view = buildRealizationView({ positionId: 'p1', transactions, result, method: 'fifo', calculationVersion: '7' });

    assert.equal(view.accounting_method, 'fifo');
    assert.equal(view.source, 'persisted');
    assert.equal(view.sells.length, 1);
    const sell = view.sells[0]!;
    assert.equal(sell.sell_transaction_id, 's1');
    assert.equal(sell.lots.length, 2); // consumes all of b1 + 5 of b2

    // Per-lot realized P&L sums to the sell's realized P&L.
    const lotRealized = sell.lots.reduce((s, l) => s + Number(l.realized_pnl), 0);
    assert.ok(Math.abs(lotRealized - Number(sell.realized_pnl)) < 1e-9);
    // Per-lot cost basis sums to the sell's consumed cost basis.
    const lotCost = sell.lots.reduce((s, l) => s + Number(l.cost_basis), 0);
    assert.ok(Math.abs(lotCost - Number(sell.consumed_cost_basis)) < 1e-9);
    // First lot is the whole b1 (FIFO).
    assert.equal(sell.lots[0]!.buy_transaction_id, 'b1');
    assert.equal(Number(sell.lots[0]!.consumed_quantity), 10);
    assert.equal(Number(sell.lots[1]!.consumed_quantity), 5);
    // Buy fee share is the proportional embedded buy fee (b1: full 10 fee on 10 shares consumed).
    assert.ok(Number(sell.lots[0]!.buy_fee_share) > 0);
  });

  test('derived source when no calculation version persisted', () => {
    const result = computeRealization(transactions, 'lifo');
    const view = buildRealizationView({ positionId: 'p1', transactions, result, method: 'lifo', calculationVersion: null });
    assert.equal(view.source, 'derived');
    // LIFO consumes b2 first.
    assert.equal(view.sells[0]!.lots[0]!.buy_transaction_id, 'b2');
  });
});

describe('buildRealizationView (average cost)', () => {
  test('pools cost basis, emits no synthetic buy lots', () => {
    const transactions: LedgerTransaction[] = [
      tx({ id: 'b1', side: 'buy', quantity: '10', price: '100' }),
      tx({ id: 'b2', side: 'buy', quantity: '10', price: '200' }),
      tx({ id: 's1', side: 'sell', quantity: '10', price: '180' }),
    ];
    const result = computeRealization(transactions, 'average_cost');
    const view = buildRealizationView({ positionId: 'p1', transactions, result, method: 'average_cost', calculationVersion: '3' });
    assert.equal(view.sells.length, 1);
    const sell = view.sells[0]!;
    assert.equal(sell.lots.length, 0);
    assert.equal(Number(sell.average_cost_basis), 150); // (1000+2000)/20
    assert.equal(Number(sell.consumed_cost_basis), 1500);
  });
});
