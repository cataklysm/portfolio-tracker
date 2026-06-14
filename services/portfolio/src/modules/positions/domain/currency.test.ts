import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { D } from './money.js';
import { makeConverter, makeDatedConverter } from './currency.js';

describe('makeConverter (latest EUR-based rates)', () => {
  test('identity when from === to', () => {
    const convert = makeConverter(new Map(), 'USD', 'USD');
    assert.equal(convert(D(100))?.toString(), '100');
  });

  test('converts via the EUR pivot (USD→EUR)', () => {
    // 1.25 USD per EUR → 125 USD = 100 EUR
    const convert = makeConverter(new Map([['USD', '1.25']]), 'USD', 'EUR');
    assert.equal(convert(D(125))?.toFixed(2), '100.00');
  });

  test('converts between two non-EUR currencies', () => {
    // 1.25 USD/EUR, 0.80 GBP/EUR → 125 USD = 100 EUR = 80 GBP
    const convert = makeConverter(new Map([['USD', '1.25'], ['GBP', '0.80']]), 'USD', 'GBP');
    assert.equal(convert(D(125))?.toFixed(2), '80.00');
  });

  test('returns null when a required rate is missing', () => {
    const convert = makeConverter(new Map(), 'USD', 'EUR');
    assert.equal(convert(D(100)), null);
  });
});

describe('makeDatedConverter (historical, value-date keyed)', () => {
  const rates = new Map([['USD@2024-06-03', '1.25'], ['USD@2024-01-02', '1.10']]);

  test('uses the rate for the specific value date', () => {
    const convert = makeDatedConverter(rates, 'EUR');
    assert.equal(convert(D(125), 'USD', '2024-06-03')?.toFixed(2), '100.00'); // /1.25
    assert.equal(convert(D(110), 'USD', '2024-01-02')?.toFixed(2), '100.00'); // /1.10
  });

  test('identity when from === reporting currency', () => {
    const convert = makeDatedConverter(new Map(), 'EUR');
    assert.equal(convert(D(50), 'EUR', '2024-06-03')?.toString(), '50');
  });

  test('returns null when the dated rate is absent (caller falls back)', () => {
    const convert = makeDatedConverter(rates, 'EUR');
    assert.equal(convert(D(100), 'USD', '2099-12-31'), null);
  });
});
