import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  computeGermanCryptoTax,
  type CryptoDisposalLot,
  type GermanCryptoInput,
} from './german-crypto.js';

const D = (n: number | string) => new Decimal(n);

function lot(id: string, acquisitionDate: string, disposalDate: string, gainLoss: number | string): CryptoDisposalLot {
  return { sellTransactionId: id, acquisitionDate, disposalDate, gainLoss: D(gainLoss) };
}

function input(lots: CryptoDisposalLot[]): GermanCryptoInput {
  return {
    taxCurrency: 'EUR',
    ruleKey: 'de_crypto_private_disposal',
    ruleVersion: 1,
    params: { holdingPeriodMonths: 12, annualFreeLimit: D('1000') },
    lots,
  };
}

describe('computeGermanCryptoTax', () => {
  test('Scenario 5 — sold within a year: gain is tax-relevant, no tax/withholding', () => {
    const r = computeGermanCryptoTax(input([lot('s1', '2025-01-01', '2025-06-01', 500)]));
    const d = r.perDisposal[0]!;
    assert.equal(d.longTerm, false);
    assert.equal(d.taxRelevant, true);
    assert.equal(r.byYear[0]!.taxableGain, '500.00');
    assert.equal(r.byYear[0]!.taxFreeGains, '0.00');
    // No CGT / withholding fields exist on the result at all.
    assert.ok(!('withheldTax' in r));
  });

  test('Scenario 6 — held more than a year: gain is tax-free', () => {
    const r = computeGermanCryptoTax(input([lot('s1', '2024-01-01', '2025-06-01', 500)]));
    const d = r.perDisposal[0]!;
    assert.equal(d.longTerm, true);
    assert.equal(d.taxRelevant, false);
    assert.equal(r.byYear[0]!.taxableGain, '0.00');
    assert.equal(r.byYear[0]!.taxFreeGains, '500.00');
  });

  test('exactly one year is still within the speculation period (taxable)', () => {
    const r = computeGermanCryptoTax(input([lot('s1', '2024-01-10', '2025-01-10', 100)]));
    assert.equal(r.perDisposal[0]!.longTerm, false);
    const r2 = computeGermanCryptoTax(input([lot('s2', '2024-01-10', '2025-01-11', 100)]));
    assert.equal(r2.perDisposal[0]!.longTerm, true);
  });

  test('short-term losses are reported separately from gains', () => {
    const r = computeGermanCryptoTax(
      input([lot('g', '2025-01-01', '2025-03-01', 800), lot('l', '2025-02-01', '2025-04-01', -200)]),
    );
    const y = r.byYear[0]!;
    assert.equal(y.taxableGain, '800.00');
    assert.equal(y.realizedLosses, '200.00');
    assert.equal(y.netTaxRelevant, '600.00');
  });

  test('annual Freigrenze flag is informational (below vs at/above)', () => {
    const below = computeGermanCryptoTax(input([lot('s1', '2025-01-01', '2025-06-01', 500)]));
    assert.equal(below.byYear[0]!.belowAnnualFreeLimit, true);
    const above = computeGermanCryptoTax(input([lot('s1', '2025-01-01', '2025-06-01', 1500)]));
    assert.equal(above.byYear[0]!.belowAnnualFreeLimit, false);
  });

  test('holding period is reported in days', () => {
    const r = computeGermanCryptoTax(input([lot('s1', '2025-01-01', '2025-01-31', 10)]));
    assert.equal(r.perDisposal[0]!.holdingPeriodDays, 30);
  });

  test('disposals bucket by their own year', () => {
    const r = computeGermanCryptoTax(
      input([lot('a', '2024-06-01', '2024-09-01', 100), lot('b', '2025-02-01', '2025-05-01', 200)]),
    );
    assert.deepEqual(
      r.byYear.map((y) => [y.year, y.taxableGain]),
      [
        [2024, '100.00'],
        [2025, '200.00'],
      ],
    );
  });

  test('a long-term loss is neither tax-relevant nor a reported tax-free gain', () => {
    const r = computeGermanCryptoTax(input([lot('s1', '2023-01-01', '2025-01-01', -300)]));
    const y = r.byYear[0]!;
    assert.equal(y.taxableGain, '0.00');
    assert.equal(y.realizedLosses, '0.00');
    assert.equal(y.taxFreeGains, '0.00');
    assert.equal(r.perDisposal[0]!.taxRelevant, false);
  });
});
