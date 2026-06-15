import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  computeGermanSecuritiesTax,
  type ExemptionOrderEntry,
  type GermanSecuritiesInput,
  type RealizedSecuritySale,
} from './german-securities.js';

const D = (n: number | string) => new Decimal(n);

const PARAMS = { capitalGainsTaxRate: D('0.25'), solidaritySurchargeRate: D('0.055'), churchTaxRate: null };
// Effective rate without church = 0.25 * 1.055 = 0.26375.

function sale(
  id: string,
  date: string,
  gainLoss: number | string,
  assetClass = 'equity',
): RealizedSecuritySale {
  return {
    sellTransactionId: id,
    date,
    assetClass,
    economicGainLoss: D(gainLoss),
    taxRelevantGainLoss: D(gainLoss),
  };
}

function input(over: Partial<GermanSecuritiesInput>): GermanSecuritiesInput {
  return {
    taxCurrency: 'EUR',
    ruleKey: 'de_securities_tax',
    ruleVersion: 1,
    params: PARAMS,
    automaticTaxWithholding: true,
    exemptionOrderHistory: [],
    sales: [],
    ...over,
  };
}

describe('computeGermanSecuritiesTax', () => {
  test('Scenario 1 — stock loss with no prior gains feeds the pot, no refund', () => {
    const r = computeGermanSecuritiesTax(input({ sales: [sale('s1', '2026-03-01', -93.3)] }));
    assert.equal(r.stockLossPot, '93.30');
    assert.equal(r.totalWithheldTax, '0.00');
    assert.equal(r.expectedTaxCorrection, '0.00');
    assert.equal(r.outstandingTaxCorrection, '0.00');
    assert.equal(r.perSale[0]!.addedLossPotAmount, '93.30');
    assert.equal(r.perSale[0]!.taxWithholdingStatus, 'loss');
  });

  test('Scenario 2 — gain offset by an existing pot, then exemption, then tax', () => {
    const r = computeGermanSecuritiesTax(
      input({ openingStockLossPot: D('93.30'), sales: [sale('s1', '2026-04-01', 100)] }),
    );
    const ps = r.perSale[0]!;
    assert.equal(ps.usedLossPotAmount, '93.30');
    assert.equal(ps.remainingTaxableGain, '6.70'); // 100 − 93.30, before exemption (none)
    assert.equal(ps.calculatedTax, '1.77'); // 6.70 * 0.26375 = 1.767…
    assert.equal(r.stockLossPot, '0.00');
  });

  test('Scenario 3 — gain with automatic withholding is calculated and withheld', () => {
    const r = computeGermanSecuritiesTax(input({ sales: [sale('s1', '2026-04-01', 100)] }));
    const ps = r.perSale[0]!;
    assert.equal(ps.calculatedTax, '26.38'); // 100 * 0.26375
    assert.equal(ps.withheldTax, '26.38');
    assert.equal(ps.taxWithholdingStatus, 'withheld');
    assert.equal(r.totalWithheldTax, '26.38');
  });

  test('Scenario 4 — gain without automatic withholding is estimated only', () => {
    const r = computeGermanSecuritiesTax(
      input({ automaticTaxWithholding: false, sales: [sale('s1', '2026-04-01', 100)] }),
    );
    const ps = r.perSale[0]!;
    assert.equal(ps.calculatedTax, '26.38');
    assert.equal(ps.withheldTax, '0.00');
    assert.equal(ps.taxWithholdingStatus, 'estimated_not_withheld');
    assert.equal(r.totalWithheldTax, '0.00');
  });

  test('Scenario 7 — a later same-year loss yields an expected, not booked, correction', () => {
    const r = computeGermanSecuritiesTax(
      input({ sales: [sale('gain', '2026-03-01', 100), sale('loss', '2026-09-01', -100)] }),
    );
    assert.equal(r.expectedTaxCorrection, '26.38'); // reverses the withheld 26.375
    assert.equal(r.bookedTaxCorrection, '0.00'); // nothing booked automatically
    assert.equal(r.outstandingTaxCorrection, '26.38');
    assert.equal(r.stockLossPot, '0.00'); // loss fully absorbed the same-year gain
    assert.equal(r.perSale[1]!.expectedTaxCorrection, '26.38');
    const y = r.byYear[0]!;
    assert.equal(y.taxableGain, '0.00');
    assert.equal(y.withheldTax, '0.00');
  });

  test('Scenario 7 (booked) — recording a refund clears the outstanding correction', () => {
    const r = computeGermanSecuritiesTax(
      input({
        sales: [sale('gain', '2026-03-01', 100), sale('loss', '2026-09-01', -100)],
        bookedTaxCorrection: D('26.375'),
      }),
    );
    assert.equal(r.outstandingTaxCorrection, '0.00');
  });

  test('Scenario 8 — exemption order change mid-year applies by transaction date', () => {
    const history: ExemptionOrderEntry[] = [
      { validFrom: '2026-01-01', validTo: '2026-06-30', amount: D('500') },
      { validFrom: '2026-07-01', validTo: null, amount: D('1000') },
    ];
    const r = computeGermanSecuritiesTax(
      input({ exemptionOrderHistory: history, sales: [sale('mar', '2026-03-01', 600), sale('aug', '2026-08-01', 600)] }),
    );
    // March: cap 500 → uses 500, 100 taxable. August: cap 1000 − 500 used = 500 → uses 500, 100 taxable.
    assert.equal(r.perSale[0]!.usedExemptionAmount, '500.00');
    assert.equal(r.perSale[0]!.remainingTaxableGain, '100.00');
    assert.equal(r.perSale[1]!.usedExemptionAmount, '500.00');
    assert.equal(r.perSale[1]!.remainingTaxableGain, '100.00');
    assert.equal(r.byYear[0]!.usedExemption, '1000.00');
  });

  test('loss carries across years without refunding the prior year', () => {
    const r = computeGermanSecuritiesTax(
      input({ sales: [sale('loss', '2025-11-01', -100), sale('gain', '2026-04-01', 100)] }),
    );
    assert.equal(r.expectedTaxCorrection, '0.00'); // different years: no same-year reversal
    assert.equal(r.stockLossPot, '0.00'); // 2025 loss offsets the 2026 gain
    assert.equal(r.perSale[1]!.usedLossPotAmount, '100.00');
    assert.equal(r.perSale[1]!.remainingTaxableGain, '0.00');
    assert.equal(r.perSale[1]!.taxWithholdingStatus, 'fully_offset');
  });

  test('church tax adds to the calculated tax when enabled', () => {
    const r = computeGermanSecuritiesTax(
      input({
        params: { capitalGainsTaxRate: D('0.25'), solidaritySurchargeRate: D('0.055'), churchTaxRate: D('0.09') },
        sales: [sale('s1', '2026-04-01', 100)],
      }),
    );
    // cgt 25 + soli 1.375 + church 2.25 = 28.625
    assert.equal(r.perSale[0]!.calculatedTax, '28.63');
  });
});
