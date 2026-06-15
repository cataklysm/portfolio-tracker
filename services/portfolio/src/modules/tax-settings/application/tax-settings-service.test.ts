import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, type TaxSettingsSchema } from '@portfolio/platform';
import { TaxSettingsService } from './tax-settings-service.js';
import type {
  PortfolioTaxSettings,
  PortfolioTaxSettingsRepository,
  TaxRuleLookup,
  UserTaxSettings,
  UserTaxSettingsRepository,
} from './ports.js';

const USER = 'user-1';
const OWNED = 'pf-owned';

const userSchema: TaxSettingsSchema = {
  schemaKey: 'de_user_tax_settings',
  version: 1,
  fields: [
    { key: 'churchTaxEnabled', label: 'Church tax', type: 'checkbox', order: 1 },
    { key: 'taxCurrency', label: 'Tax currency', type: 'currency', required: true, order: 2 },
  ],
};

const portfolioSchema: TaxSettingsSchema = {
  schemaKey: 'de_securities_portfolio_tax_settings',
  version: 1,
  fields: [{ key: 'automaticTaxWithholding', label: 'Withholding', type: 'checkbox', required: true, order: 1 }],
};

class FakeUsers implements UserTaxSettingsRepository {
  row: UserTaxSettings | null = null;
  async get(): Promise<UserTaxSettings | null> {
    return this.row;
  }
  async upsert(_userId: string, countryCode: string, settings: Record<string, unknown>): Promise<UserTaxSettings> {
    this.row = { country_code: countryCode, settings, updated_at: '2026-06-14T00:00:00.000Z' };
    return this.row;
  }
}

class FakePortfolios implements PortfolioTaxSettingsRepository {
  store = new Map<string, PortfolioTaxSettings>([[OWNED, { portfolio_id: OWNED, tax_rule_key: null, tax_settings: {} }]]);
  async getForOwner(_userId: string, portfolioId: string): Promise<PortfolioTaxSettings | null> {
    return this.store.get(portfolioId) ?? null;
  }
  async listForUser() {
    return [...this.store.values()].map((s) => ({ ...s, name: s.portfolio_id }));
  }
  async setForOwner(
    _userId: string,
    portfolioId: string,
    ruleKey: string | null,
    settings: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.store.has(portfolioId)) return false;
    this.store.set(portfolioId, { portfolio_id: portfolioId, tax_rule_key: ruleKey, tax_settings: settings });
    return true;
  }
}

const rules: TaxRuleLookup = {
  async getRule(ruleKey) {
    return ruleKey === 'de_securities_tax' ? { portfolio_settings_schema: portfolioSchema, rule_version: 1 } : null;
  },
  async userSchemaForCountry(countryCode) {
    return countryCode === 'DE' ? userSchema : null;
  },
};

function service(): { svc: TaxSettingsService; users: FakeUsers; portfolios: FakePortfolios } {
  const users = new FakeUsers();
  const portfolios = new FakePortfolios();
  return { svc: new TaxSettingsService(users, portfolios, rules), users, portfolios };
}

describe('TaxSettingsService — user settings', () => {
  test('valid settings are validated and stored', async () => {
    const { svc, users } = service();
    const saved = await svc.setUserSettings(USER, { countryCode: 'de', settings: { churchTaxEnabled: false, taxCurrency: 'EUR' } });
    assert.equal(saved.country_code, 'DE');
    assert.deepEqual(users.row?.settings, { churchTaxEnabled: false, taxCurrency: 'EUR' });
  });

  test('invalid settings are rejected with a 400 and field errors', async () => {
    const { svc, users } = service();
    await assert.rejects(
      () => svc.setUserSettings(USER, { countryCode: 'DE', settings: { taxCurrency: 'euro' } }),
      (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'invalid_tax_settings',
    );
    assert.equal(users.row, null); // nothing persisted
  });

  test('a residence with no rule is rejected', async () => {
    const { svc } = service();
    await assert.rejects(
      () => svc.setUserSettings(USER, { countryCode: 'US', settings: {} }),
      (err: unknown) => err instanceof AppError && err.code === 'unsupported_tax_residence',
    );
  });
});

describe('TaxSettingsService — portfolio settings', () => {
  test('unknown / unowned portfolio is a 404', async () => {
    const { svc } = service();
    await assert.rejects(
      () => svc.setPortfolioSettings(USER, 'pf-other', { ruleKey: 'de_securities_tax', settings: { automaticTaxWithholding: true } }),
      (err: unknown) => err instanceof AppError && err.status === 404,
    );
  });

  test('unknown rule key is rejected', async () => {
    const { svc } = service();
    await assert.rejects(
      () => svc.setPortfolioSettings(USER, OWNED, { ruleKey: 'nope', settings: {} }),
      (err: unknown) => err instanceof AppError && err.code === 'unknown_tax_rule',
    );
  });

  test('settings are validated against the rule schema', async () => {
    const { svc } = service();
    await assert.rejects(
      () => svc.setPortfolioSettings(USER, OWNED, { ruleKey: 'de_securities_tax', settings: {} }),
      (err: unknown) => err instanceof AppError && err.code === 'invalid_tax_settings',
    );
  });

  test('valid settings are stored with the rule key', async () => {
    const { svc, portfolios } = service();
    const saved = await svc.setPortfolioSettings(USER, OWNED, { ruleKey: 'de_securities_tax', settings: { automaticTaxWithholding: true } });
    assert.equal(saved.tax_rule_key, 'de_securities_tax');
    assert.deepEqual(portfolios.store.get(OWNED)?.tax_settings, { automaticTaxWithholding: true });
  });

  test('null rule key clears the portfolio tax configuration', async () => {
    const { svc, portfolios } = service();
    await svc.setPortfolioSettings(USER, OWNED, { ruleKey: 'de_securities_tax', settings: { automaticTaxWithholding: true } });
    const cleared = await svc.setPortfolioSettings(USER, OWNED, { ruleKey: null, settings: {} });
    assert.equal(cleared.tax_rule_key, null);
    assert.deepEqual(portfolios.store.get(OWNED)?.tax_settings, {});
  });
});
