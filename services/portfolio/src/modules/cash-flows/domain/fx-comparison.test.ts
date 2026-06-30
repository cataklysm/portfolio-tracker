import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeFxComparison, type EurRateLookup } from './fx-comparison.js';
import type { CashFlowRecord } from '../application/ports.js';

/** A stored cash-flow record with overridable fields; defaults to a plain EUR dividend. */
function cf(over: Partial<CashFlowRecord> = {}): CashFlowRecord {
  return {
    id: 'cf-1',
    portfolio_id: 'pf-1',
    position_id: 'pos-1',
    type: 'dividend',
    gross_amount: '100',
    withholding_tax: '0',
    fee: '0',
    net_amount: '100',
    currency: 'EUR',
    payment_date: '2026-06-30',
    tax_relevant_value_date: '2026-06-30',
    note: null,
    source_event_id: null,
    source_event_version: null,
    source_event_type: null,
    ex_date: null,
    amount_per_share: null,
    quantity_at_ex_date: null,
    expected_gross_amount: null,
    source_currency: null,
    source_gross_amount: null,
    source_withholding_tax: null,
    source_fee: null,
    source_net_amount: null,
    source_amount_per_share: null,
    broker_fx_rate: null,
    broker_fx_from_currency: null,
    broker_fx_to_currency: null,
    broker_fx_rate_date: null,
    created_at: 'now',
    updated_at: 'now',
    ...over,
  };
}

describe('computeFxComparison', () => {
  test('same_currency when there is no source layer', () => {
    const result = computeFxComparison(cf(), () => '1.25');
    assert.equal(result.fx_comparison_status, 'same_currency');
    assert.equal(result.reference_fx_rate, null);
    assert.equal(result.broker_fx_difference_amount, null);
  });

  test('USD→EUR: reference 1/r_source, difference and pct against the broker net', () => {
    const usdDividend = cf({
      currency: 'EUR',
      source_currency: 'USD',
      source_net_amount: '85',
      broker_fx_rate: '0.92',
      broker_fx_rate_date: '2026-06-30',
    });
    const rate: EurRateLookup = (currency) => (currency === 'USD' ? '1.25' : '1'); // 1.25 USD per EUR
    const result = computeFxComparison(usdDividend, rate);
    assert.equal(result.fx_comparison_status, 'available');
    assert.equal(result.reference_fx_rate, '0.8'); // 1 / 1.25
    assert.equal(result.reference_fx_net_amount, '68'); // 85 × 0.8
    assert.equal(result.broker_fx_difference_amount, '10.2'); // 85 × 0.92 − 68
    assert.equal(result.broker_fx_difference_pct, '15'); // 10.2 / 68 × 100
    assert.equal(result.reference_fx_rate_date, '2026-06-30');
  });

  test('non-EUR settlement uses r_settlement / r_source', () => {
    const usdToChf = cf({
      currency: 'CHF',
      source_currency: 'USD',
      source_net_amount: '100',
      broker_fx_rate: '0.80',
      broker_fx_rate_date: '2026-06-30',
    });
    const rate: EurRateLookup = (currency) => (currency === 'USD' ? '1.25' : currency === 'CHF' ? '0.95' : '1');
    const result = computeFxComparison(usdToChf, rate);
    assert.equal(result.fx_comparison_status, 'available');
    assert.equal(result.reference_fx_rate, '0.76'); // 0.95 / 1.25
    assert.equal(result.reference_fx_net_amount, '76'); // 100 × 0.76
  });

  test('falls back to the value date when no broker FX date is set', () => {
    const usdDividend = cf({
      currency: 'EUR',
      source_currency: 'USD',
      source_net_amount: '85',
      broker_fx_rate: '0.92',
      broker_fx_rate_date: null,
      tax_relevant_value_date: '2026-05-01',
    });
    const seen: string[] = [];
    const rate: EurRateLookup = (currency, date) => {
      seen.push(date);
      return currency === 'USD' ? '1.25' : '1';
    };
    const result = computeFxComparison(usdDividend, rate);
    assert.equal(result.reference_fx_rate_date, '2026-05-01');
    assert.ok(seen.every((d) => d === '2026-05-01'));
  });

  test('unavailable when a reference rate is missing (read still yields a result)', () => {
    const usdDividend = cf({
      currency: 'EUR',
      source_currency: 'USD',
      source_net_amount: '85',
      broker_fx_rate: '0.92',
      broker_fx_rate_date: '2026-06-30',
    });
    const result = computeFxComparison(usdDividend, () => null);
    assert.equal(result.fx_comparison_status, 'unavailable');
    assert.equal(result.reference_fx_rate, null);
  });
});
