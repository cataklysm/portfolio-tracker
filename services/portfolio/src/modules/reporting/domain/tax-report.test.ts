import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { computeTaxReport, type ConvertedTaxEvent } from './tax-report.js';

const ev = (
  component: ConvertedTaxEvent['component'],
  direction: ConvertedTaxEvent['direction'],
  amount: number | null,
  linked = true,
): ConvertedTaxEvent => ({ component, direction, amount: amount === null ? null : new Decimal(amount), linked });

describe('computeTaxReport', () => {
  test('no tax events → unavailable, after-tax equals gross', () => {
    const r = computeTaxReport(new Decimal('1000'), [], 'EUR');
    assert.equal(r.status, 'unavailable');
    assert.equal(r.net_actual_tax, '0.00');
    assert.equal(r.realized_pnl_after_actual_tax, '1000.00');
    assert.equal(r.gross_realized_pnl, '1000.00');
    assert.equal(r.by_component.length, 0);
  });

  test('withheld minus refunded gives net, after-tax = gross − net', () => {
    const r = computeTaxReport(
      new Decimal('1000'),
      [ev('capital_income', 'withheld', 250), ev('solidarity', 'withheld', 13.75), ev('capital_income', 'refunded', 50)],
      'EUR',
    );
    assert.equal(r.status, 'actual_complete');
    assert.equal(r.actual_tax_withheld, '263.75');
    assert.equal(r.actual_tax_refunded, '50.00');
    assert.equal(r.net_actual_tax, '213.75'); // 263.75 − 50
    assert.equal(r.realized_pnl_after_actual_tax, '786.25'); // 1000 − 213.75
  });

  test('aggregates per component in a stable order', () => {
    const r = computeTaxReport(
      new Decimal('0'),
      [ev('capital_income', 'withheld', 100), ev('capital_income', 'refunded', 30), ev('church', 'withheld', 20)],
      'EUR',
    );
    assert.deepEqual(r.by_component.map((b) => b.component), ['capital_income', 'church']);
    const cap = r.by_component.find((b) => b.component === 'capital_income')!;
    assert.equal(cap.withheld, '100.00');
    assert.equal(cap.refunded, '30.00');
    assert.equal(cap.net, '70.00');
  });

  test('an unconvertible event marks the report partial but keeps converted totals', () => {
    const r = computeTaxReport(
      new Decimal('500'),
      [ev('capital_income', 'withheld', 100), ev('foreign_withholding', 'withheld', null)],
      'EUR',
    );
    assert.equal(r.status, 'actual_partial');
    assert.equal(r.actual_tax_withheld, '100.00');
    assert.equal(r.net_actual_tax, '100.00');
    assert.equal(r.realized_pnl_after_actual_tax, '400.00');
    assert.equal(r.event_count, 2);
  });

  test('counts unlinked corrections without affecting completeness', () => {
    const r = computeTaxReport(
      new Decimal('0'),
      [ev('generic', 'withheld', 40, false), ev('capital_income', 'withheld', 10, true)],
      'EUR',
    );
    assert.equal(r.unlinked_count, 1);
    assert.equal(r.status, 'actual_complete'); // both converted; linkage is informational
  });
});
