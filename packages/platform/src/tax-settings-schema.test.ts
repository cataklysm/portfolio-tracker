import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaxSettings, type TaxSettingsSchema } from './tax-settings-schema.js';

const userSchema: TaxSettingsSchema = {
  schemaKey: 'de_user_tax_settings',
  version: 1,
  fields: [
    { key: 'churchTaxEnabled', label: 'Church tax', type: 'checkbox', order: 1 },
    {
      key: 'churchTaxRate',
      label: 'Church tax rate',
      type: 'select',
      required: true,
      order: 2,
      visibleWhen: [{ field: 'churchTaxEnabled', equals: true }],
      options: [
        { value: '0.08', label: '8%' },
        { value: '0.09', label: '9%' },
      ],
    },
    { key: 'taxCurrency', label: 'Tax currency', type: 'currency', required: true, order: 3 },
  ],
};

const portfolioSchema: TaxSettingsSchema = {
  schemaKey: 'de_securities_portfolio_tax_settings',
  version: 1,
  fields: [
    { key: 'automaticTaxWithholding', label: 'Withholding', type: 'checkbox', order: 1 },
    {
      key: 'exemptionOrderHistory',
      label: 'Exemption order',
      type: 'array',
      order: 2,
      visibleWhen: [{ field: 'automaticTaxWithholding', equals: true }],
      itemFields: [
        { key: 'validFrom', label: 'From', type: 'date', required: true, order: 1 },
        { key: 'amount', label: 'Amount', type: 'money', required: true, currencyField: 'currency', order: 2 },
        { key: 'currency', label: 'Currency', type: 'currency', required: true, order: 3 },
      ],
    },
  ],
};

describe('validateTaxSettings', () => {
  test('non-object value fails', () => {
    const r = validateTaxSettings(userSchema, 'nope');
    assert.equal(r.ok, false);
  });

  test('hidden conditional field is neither required nor checked', () => {
    // churchTaxRate is hidden while churchTaxEnabled is false, so its absence is fine.
    const r = validateTaxSettings(userSchema, { churchTaxEnabled: false, taxCurrency: 'EUR' });
    assert.equal(r.ok, true);
  });

  test('visible conditional field becomes required', () => {
    const r = validateTaxSettings(userSchema, { churchTaxEnabled: true, taxCurrency: 'EUR' });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.some((e) => e.path === 'churchTaxRate'));
  });

  test('select rejects a value outside its options', () => {
    const r = validateTaxSettings(userSchema, { churchTaxEnabled: true, churchTaxRate: '0.10', taxCurrency: 'EUR' });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.some((e) => e.path === 'churchTaxRate'));
  });

  test('bad currency and missing required field both reported', () => {
    const r = validateTaxSettings(userSchema, { churchTaxEnabled: false, taxCurrency: 'euro' });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.some((e) => e.path === 'taxCurrency'));
  });

  test('valid full user settings pass', () => {
    const r = validateTaxSettings(userSchema, { churchTaxEnabled: true, churchTaxRate: '0.09', taxCurrency: 'EUR' });
    assert.equal(r.ok, true);
  });

  test('array items are validated by dotted path', () => {
    const r = validateTaxSettings(portfolioSchema, {
      automaticTaxWithholding: true,
      exemptionOrderHistory: [
        { validFrom: '2026-01-01', amount: 1000, currency: 'EUR' },
        { validFrom: 'not-a-date', amount: -5, currency: 'EUR' },
      ],
    });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.some((e) => e.path === 'exemptionOrderHistory.1.validFrom'));
    assert.ok(!r.ok && r.errors.some((e) => e.path === 'exemptionOrderHistory.1.amount'));
  });

  test('array field hidden by condition is skipped', () => {
    const r = validateTaxSettings(portfolioSchema, { automaticTaxWithholding: false });
    assert.equal(r.ok, true);
  });
});
