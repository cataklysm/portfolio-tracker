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

// --- Per-transaction attribution -------------------------------------------

/** Like `tx`, but carries an ID so attribution can be mapped back to the row. */
const idTx = (
  id: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  fee: string,
  date: string,
): LedgerTransaction => ({ id, side, quantity, price, fee, currency: 'USD', tax_relevant_value_date: date });

const byId = (r: ReturnType<typeof computeRealization>) =>
  new Map(r.byTransaction.map((b) => [b.transactionId, b]));

describe('computeRealization — byTransaction attribution', () => {
  const identified: LedgerTransaction[] = [
    idTx('b1', 'buy', '10', '100', '5', '2024-01-02'),
    idTx('b2', 'buy', '10', '120', '5', '2024-03-01'),
    idTx('s1', 'sell', '10', '150', '5', '2024-06-03'),
  ];

  test('FIFO attributes the sell and leaves the first lot fully consumed', () => {
    const m = byId(computeRealization(identified, 'fifo'));
    assert.equal(m.get('b1')!.remainingQuantity!.toFixed(0), '0');
    assert.equal(m.get('b2')!.remainingQuantity!.toFixed(0), '10');
    assert.equal(m.get('b2')!.remainingCostBasis!.toFixed(2), '1205.00');
    const sell = m.get('s1')!;
    assert.equal(sell.realizedPnl!.toFixed(2), '490.00');
    assert.equal(sell.consumedCostBasis!.toFixed(2), '1005.00');
    assert.equal(sell.consumedQuantity!.toFixed(0), '10');
    assert.equal(sell.remainingQuantity, null);
    assert.equal(sell.method, 'fifo');
  });

  test('LIFO leaves the last lot consumed and the first one open', () => {
    const m = byId(computeRealization(identified, 'lifo'));
    assert.equal(m.get('b1')!.remainingQuantity!.toFixed(0), '10');
    assert.equal(m.get('b2')!.remainingQuantity!.toFixed(0), '0');
    assert.equal(m.get('s1')!.realizedPnl!.toFixed(2), '290.00');
  });

  test('one sell consuming multiple lots splits the remainder across buys', () => {
    const ledger2: LedgerTransaction[] = [
      idTx('b1', 'buy', '5', '100', '0', '2024-01-02'),
      idTx('b2', 'buy', '5', '100', '0', '2024-02-02'),
      idTx('s1', 'sell', '8', '120', '0', '2024-03-02'),
    ];
    const m = byId(computeRealization(ledger2, 'fifo'));
    assert.equal(m.get('b1')!.remainingQuantity!.toFixed(0), '0');
    assert.equal(m.get('b2')!.remainingQuantity!.toFixed(0), '2');
    assert.equal(m.get('s1')!.consumedQuantity!.toFixed(0), '8');
    assert.equal(m.get('s1')!.realizedPnl!.toFixed(2), '160.00'); // 960 - 800
  });

  test('attributes two sells on the same date by transaction ID, not date', () => {
    const ledger2: LedgerTransaction[] = [
      idTx('b1', 'buy', '20', '100', '0', '2024-01-02'),
      idTx('s1', 'sell', '5', '150', '0', '2024-06-03'),
      idTx('s2', 'sell', '5', '160', '0', '2024-06-03'),
    ];
    const m = byId(computeRealization(ledger2, 'fifo'));
    assert.equal(m.get('s1')!.realizedPnl!.toFixed(2), '250.00'); // 750 - 500
    assert.equal(m.get('s2')!.realizedPnl!.toFixed(2), '300.00'); // 800 - 500
    assert.equal(m.get('b1')!.remainingQuantity!.toFixed(0), '10');
  });

  test('average cost attributes sells but leaves buy remainders null', () => {
    const m = byId(computeRealization(identified, 'average_cost'));
    assert.equal(m.get('b1')!.remainingQuantity, null);
    assert.equal(m.get('b1')!.remainingCostBasis, null);
    assert.equal(m.get('b1')!.method, 'average_cost');
    assert.equal(m.get('s1')!.realizedPnl!.toFixed(2), '390.00'); // 1500 - 5 - 1105
    assert.equal(m.get('s1')!.consumedCostBasis!.toFixed(2), '1105.00');
  });

  test('reconciles: Σ sell realized = position realized; Σ buy remaining cost = open cost (FIFO)', () => {
    const r = computeRealization(identified, 'fifo');
    const sellSum = r.byTransaction
      .filter((b) => b.side === 'sell')
      .reduce((s, b) => s.plus(b.realizedPnl!), D(0));
    const openSum = r.byTransaction
      .filter((b) => b.side === 'buy')
      .reduce((s, b) => s.plus(b.remainingCostBasis!), D(0));
    assert.equal(sellSum.toFixed(2), r.realizedPnl.toFixed(2));
    assert.equal(openSum.toFixed(2), r.openCostBasis.toFixed(2));
  });

  test('an invalid ledger yields no attribution', () => {
    const r = computeRealization(
      [idTx('b1', 'buy', '5', '100', '0', '2024-01-02'), idTx('s1', 'sell', '10', '150', '0', '2024-02-02')],
      'fifo',
    );
    assert.equal(r.invalid, true);
    assert.equal(r.byTransaction.length, 0);
    assert.equal(r.lotConsumptions.length, 0);
  });
});

describe('computeRealization — lot consumptions (persistable allocations)', () => {
  test('FIFO records which buy lot each sell consumed', () => {
    const ledger2: LedgerTransaction[] = [
      idTx('b1', 'buy', '5', '100', '0', '2024-01-02'),
      idTx('b2', 'buy', '5', '100', '0', '2024-02-02'),
      idTx('s1', 'sell', '8', '120', '0', '2024-03-02'),
    ];
    const r = computeRealization(ledger2, 'fifo');
    // sell s1 takes 5 from b1 then 3 from b2.
    assert.deepEqual(
      r.lotConsumptions.map((c) => [c.sellTransactionId, c.buyTransactionId, c.quantity.toFixed(0)]),
      [['s1', 'b1', '5'], ['s1', 'b2', '3']],
    );
  });

  test('LIFO consumes the most recent lot first', () => {
    const ledger2: LedgerTransaction[] = [
      idTx('b1', 'buy', '5', '100', '0', '2024-01-02'),
      idTx('b2', 'buy', '5', '100', '0', '2024-02-02'),
      idTx('s1', 'sell', '8', '120', '0', '2024-03-02'),
    ];
    const r = computeRealization(ledger2, 'lifo');
    assert.deepEqual(
      r.lotConsumptions.map((c) => [c.buyTransactionId, c.quantity.toFixed(0)]),
      [['b2', '5'], ['b1', '3']],
    );
  });

  test('consumed quantity per sell reconciles with the quantity sold', () => {
    const r = computeRealization(
      [idTx('b1', 'buy', '20', '100', '0', '2024-01-02'), idTx('s1', 'sell', '5', '150', '0', '2024-06-03'), idTx('s2', 'sell', '7', '160', '0', '2024-06-04')],
      'fifo',
    );
    const consumedFor = (sellId: string) =>
      r.lotConsumptions.filter((c) => c.sellTransactionId === sellId).reduce((s, c) => s.plus(c.quantity), D(0));
    assert.equal(consumedFor('s1').toFixed(0), '5');
    assert.equal(consumedFor('s2').toFixed(0), '7');
  });

  test('average cost produces no lot consumptions', () => {
    const r = computeRealization(
      [idTx('b1', 'buy', '10', '100', '0', '2024-01-02'), idTx('s1', 'sell', '4', '150', '0', '2024-06-03')],
      'average_cost',
    );
    assert.equal(r.lotConsumptions.length, 0);
    // ...but the average-cost realization is still attributed per sell.
    const sell = r.byTransaction.find((b) => b.transactionId === 's1')!;
    assert.equal(sell.consumedCostBasis!.toFixed(0), '400');
    assert.equal(sell.consumedQuantity!.toFixed(0), '4');
  });
});
