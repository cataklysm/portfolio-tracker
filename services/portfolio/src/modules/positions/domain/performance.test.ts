import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { D } from './money.js';
import { makeConverter, makeDatedConverter } from './currency.js';
import { computeRealization, type LedgerTransaction } from './realization.js';
import { computePerformance } from './performance.js';

const tx = (side: 'buy' | 'sell', quantity: string, price: string, fee: string, date: string): LedgerTransaction => ({
  side, quantity, price, fee, currency: 'USD', tax_relevant_value_date: date,
});

// Buy 10@100 f5, sell 10@150 f5 → realized = 1500 - 5 - 1005 = 490 USD (still 5 held? no: bought 10, sold 10 → flat).
const realized = computeRealization(
  [tx('buy', '10', '100', '5', '2024-01-02'), tx('sell', '10', '150', '5', '2024-06-03')],
  'fifo',
);

describe('computePerformance — historical FX for realized amounts', () => {
  // latest weak (1.00 USD/EUR), historical strong on the sell date (1.25 USD/EUR)
  const convertToReporting = makeConverter(new Map([['USD', '1.00']]), 'USD', 'EUR');
  const histRates = new Map([['USD@2024-06-03', '1.25'], ['USD@2024-01-02', '1.10']]);

  test('realized P&L converts at the value-date rate, not the latest', () => {
    const withHist = computePerformance({
      realization: realized, latestPrice: null, previousPrice: null,
      listingCurrency: 'USD', reportingCurrency: 'EUR', convertToReporting,
      convertAt: makeDatedConverter(histRates, 'EUR'),
    });
    const latestOnly = computePerformance({
      realization: realized, latestPrice: null, previousPrice: null,
      listingCurrency: 'USD', reportingCurrency: 'EUR', convertToReporting,
    });
    assert.equal(withHist.realized_pnl_reporting, '392.00'); // 490 / 1.25
    assert.equal(latestOnly.realized_pnl_reporting, '490.00'); // 490 / 1.00
  });

  test('fees convert per value date', () => {
    const withHist = computePerformance({
      realization: realized, latestPrice: null, previousPrice: null,
      listingCurrency: 'USD', reportingCurrency: 'EUR', convertToReporting,
      convertAt: makeDatedConverter(histRates, 'EUR'),
    });
    // 5/1.10 + 5/1.25 = 4.5454.. + 4.00 = 8.55 (vs latest 10.00)
    assert.equal(withHist.total_fees_reporting, '8.55');
  });

  test('falls back to the latest rate when a value-date rate is missing', () => {
    const withHist = computePerformance({
      realization: realized, latestPrice: null, previousPrice: null,
      listingCurrency: 'USD', reportingCurrency: 'EUR', convertToReporting,
      convertAt: makeDatedConverter(new Map([['USD@2024-01-02', '1.10']]), 'EUR'), // sell-date rate absent
    });
    assert.equal(withHist.realized_pnl_reporting, '490.00'); // fell back to latest 1.00
  });
});

describe('computePerformance — daily change amount', () => {
  // 10 held @ EUR, latest 150, prior close 140 → held qty × (150-140) = 100 EUR
  const held = computeRealization([{ side: 'buy', quantity: '10', price: '100', fee: '0', currency: 'EUR', tax_relevant_value_date: '2024-01-02' }], 'fifo');

  test('amount = held quantity × (latest − prior close), at the latest rate', () => {
    const p = computePerformance({
      realization: held, latestPrice: D(150), previousPrice: D(140),
      listingCurrency: 'EUR', reportingCurrency: 'EUR', convertToReporting: makeConverter(new Map(), 'EUR', 'EUR'),
    });
    assert.equal(p.daily_change_amount_reporting, '100.00');
    assert.equal(p.daily_change_pct, '7.14'); // (150-140)/140
  });

  test('null daily change when there is no prior close', () => {
    const p = computePerformance({
      realization: held, latestPrice: D(150), previousPrice: null,
      listingCurrency: 'EUR', reportingCurrency: 'EUR', convertToReporting: makeConverter(new Map(), 'EUR', 'EUR'),
    });
    assert.equal(p.daily_change_amount_reporting, null);
    assert.equal(p.daily_change_pct, null);
  });
});
