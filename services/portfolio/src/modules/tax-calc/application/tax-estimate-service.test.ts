import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TaxEstimateService, type TaxEstimateDeps } from './tax-estimate-service.js';
import type {
  FxReader,
  ListingReader,
  ListingSummary,
  PositionRecord,
  PositionRepository,
  StoredTransaction,
} from '../../positions/application/ports.js';
import type { PortfolioTaxSettingsRepository } from '../../tax-settings/application/ports.js';
import type { UserTaxSettingsRepository } from '../../tax-settings/application/ports.js';
import type { TaxRule } from '../../tax-rules/application/ports.js';
import type { TaxEventRepository } from '../../tax-events/application/ports.js';

const USER = 'user-1';
const TOKEN = 'token';

function stx(id: string, side: 'buy' | 'sell', quantity: string, price: string, date: string): StoredTransaction {
  return {
    id,
    side,
    quantity,
    price,
    fee: '0',
    currency: 'EUR',
    tax_relevant_value_date: date,
    effective_at: new Date(date),
    creation_sequence: '0',
    savings_plan: false,
    note: null,
  };
}

function listing(id: string, assetType: ListingSummary['asset_type']): ListingSummary {
  return { listing_id: id, instrument_id: `i-${id}`, symbol: id, name: id, asset_type: assetType, currency: 'EUR' };
}

const emptySchema = { schemaKey: 's', version: 1, fields: [] };
function rule(ruleKey: string, assetClasses: string[], engine: string, parameters: Record<string, unknown>): TaxRule {
  return {
    id: `r-${ruleKey}`,
    country_code: 'DE',
    rule_key: ruleKey,
    rule_version: 1,
    asset_classes: assetClasses,
    valid_from: '2009-01-01',
    valid_to: null,
    user_settings_schema: emptySchema,
    portfolio_settings_schema: emptySchema,
    parameters,
    calculation_engine_key: engine,
    supported: true,
  };
}

const RULES: Record<string, TaxRule> = {
  de_securities_tax: rule('de_securities_tax', ['equity'], 'germanCapitalGainsTax', {
    capitalGainsTaxRate: 0.25,
    solidaritySurchargeRate: 0.055,
  }),
  de_crypto_private_disposal: rule('de_crypto_private_disposal', ['crypto'], 'germanCryptoTaxableGainOnly', {
    holdingPeriodMonths: 12,
    taxFreeLimit: 1000,
  }),
};

function buildDeps(over: Partial<{ churchEnabled: boolean }> = {}): TaxEstimateDeps {
  const positions: PositionRecord[] = [
    { id: 'pos-eq', portfolio_id: 'pf-sec', listing_id: 'l-eq', state: 'closed' },
    { id: 'pos-fund', portfolio_id: 'pf-sec', listing_id: 'l-fund', state: 'open' },
    { id: 'pos-cry', portfolio_id: 'pf-cry', listing_id: 'l-cry', state: 'closed' },
  ];
  const txns = new Map<string, StoredTransaction[]>([
    ['pos-eq', [stx('eb', 'buy', '10', '100', '2026-01-02'), stx('es', 'sell', '10', '150', '2026-06-02')]],
    ['pos-fund', [stx('fb', 'buy', '5', '100', '2026-01-02')]],
    ['pos-cry', [stx('cb', 'buy', '1', '1000', '2025-01-01'), stx('cs', 'sell', '1', '1500', '2025-06-01')]],
  ]);

  return {
    positions: {
      listPositionsForUser: async () => positions,
      listTransactionsForPositions: async () => txns,
    } as unknown as PositionRepository,
    listings: {
      getListings: async () =>
        new Map([
          ['l-eq', listing('l-eq', 'equity')],
          ['l-fund', listing('l-fund', 'fund')],
          ['l-cry', listing('l-cry', 'crypto')],
        ]),
    } as ListingReader,
    fx: {
      getEurRates: async () => new Map(),
      getEurRatesAt: async () => new Map(), // all amounts are already EUR (== tax currency)
      getEurRateSeries: async () => new Map(),
    } as FxReader,
    portfolioTax: {
      listForUser: async () => [
        { portfolio_id: 'pf-sec', name: 'Securities', tax_rule_key: 'de_securities_tax', tax_settings: { automaticTaxWithholding: true } },
        { portfolio_id: 'pf-cry', name: 'Crypto', tax_rule_key: 'de_crypto_private_disposal', tax_settings: {} },
      ],
    } as unknown as PortfolioTaxSettingsRepository,
    userTax: {
      get: async () => ({
        country_code: 'DE',
        settings: over.churchEnabled ? { taxCurrency: 'EUR', churchTaxEnabled: true, churchTaxRate: '0.09' } : { taxCurrency: 'EUR' },
      }),
    } as unknown as UserTaxSettingsRepository,
    rules: { getRule: async (key: string) => RULES[key] ?? null },
    taxEvents: { listForUser: async () => [] } as unknown as TaxEventRepository,
  };
}

describe('TaxEstimateService', () => {
  test('produces a securities block, a crypto block, and a fund-unsupported note', async () => {
    const svc = new TaxEstimateService(buildDeps());
    const est = await svc.getEstimate(USER, TOKEN);

    assert.equal(est.tax_currency, 'EUR');
    assert.equal(est.fx_complete, true);

    assert.equal(est.securities.length, 1);
    const sec = est.securities[0]!;
    assert.equal(sec.portfolio_id, 'pf-sec');
    assert.equal(sec.result.perSale.length, 1);
    assert.equal(sec.result.perSale[0]!.calculatedTax, '131.88'); // 500 * 0.26375
    assert.equal(sec.result.totalWithheldTax, '131.88');

    assert.equal(est.crypto.length, 1);
    const cry = est.crypto[0]!;
    assert.equal(cry.portfolio_id, 'pf-cry');
    assert.equal(cry.result.byYear[0]!.taxableGain, '500.00'); // short-term gain

    assert.ok(est.unsupported.some((u) => u.portfolio_id === 'pf-sec' && u.reason === 'fund_tax_deferred'));
  });

  test('user church-tax setting flows into the securities calculation', async () => {
    const svc = new TaxEstimateService(buildDeps({ churchEnabled: true }));
    const est = await svc.getEstimate(USER, TOKEN);
    // 500 * 0.25 = 125 cgt; +soli 6.875 +church 11.25 = 143.125
    assert.equal(est.securities[0]!.result.perSale[0]!.calculatedTax, '143.13');
  });

  test('no configured portfolios yields an empty estimate', async () => {
    const deps = buildDeps();
    deps.portfolioTax.listForUser = async () => [
      { portfolio_id: 'pf-sec', name: 'Securities', tax_rule_key: null, tax_settings: {} },
    ];
    const est = await new TaxEstimateService(deps).getEstimate(USER, TOKEN);
    assert.deepEqual([est.securities.length, est.crypto.length, est.unsupported.length], [0, 0, 0]);
  });
});
