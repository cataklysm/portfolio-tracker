import { AppError, validateTaxSettings, type TaxSettingsValidationError } from '@portfolio/platform';
import type {
  PortfolioTaxSettings,
  PortfolioTaxSettingsRepository,
  TaxRuleLookup,
  UserTaxSettings,
  UserTaxSettingsRepository,
} from './ports.js';

export interface SetUserTaxSettingsInput {
  countryCode: string;
  settings: Record<string, unknown>;
}

export interface SetPortfolioTaxSettingsInput {
  /** The governing tax rule, or null to clear the portfolio's tax configuration. */
  ruleKey: string | null;
  settings: Record<string, unknown>;
}

/**
 * Stores the user's and a portfolio's saved tax settings, validating each against
 * the JSON schema of the matching tax rule before persisting. This is the
 * "settings" layer of the design: it never computes tax and never touches the
 * recorded-tax ledger — it only captures validated configuration the engines
 * (later phases) will consume. Residence stays authoritative in the auth service;
 * `country_code` here only records which rule schema validated the values.
 */
export class TaxSettingsService {
  constructor(
    private readonly users: UserTaxSettingsRepository,
    private readonly portfolios: PortfolioTaxSettingsRepository,
    private readonly rules: TaxRuleLookup,
  ) {}

  getUserSettings(userId: string): Promise<UserTaxSettings | null> {
    return this.users.get(userId);
  }

  async setUserSettings(userId: string, input: SetUserTaxSettingsInput): Promise<UserTaxSettings> {
    const countryCode = normalizeCountry(input.countryCode);
    const schema = await this.rules.userSchemaForCountry(countryCode);
    if (!schema) {
      throw AppError.badRequest(
        'unsupported_tax_residence',
        `No tax rule is available for residence ${countryCode}`,
      );
    }
    const result = validateTaxSettings(schema, input.settings);
    if (!result.ok) throw invalidSettings(result.errors);
    return this.users.upsert(userId, countryCode, input.settings);
  }

  async getPortfolioSettings(userId: string, portfolioId: string): Promise<PortfolioTaxSettings> {
    const found = await this.portfolios.getForOwner(userId, portfolioId);
    if (!found) throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
    return found;
  }

  async setPortfolioSettings(
    userId: string,
    portfolioId: string,
    input: SetPortfolioTaxSettingsInput,
  ): Promise<PortfolioTaxSettings> {
    // Ownership is enforced by reading the row first; both clear and set paths need it.
    const existing = await this.portfolios.getForOwner(userId, portfolioId);
    if (!existing) throw AppError.notFound('portfolio_not_found', 'Portfolio not found');

    if (input.ruleKey === null) {
      await this.portfolios.setForOwner(userId, portfolioId, null, {});
      return { portfolio_id: portfolioId, tax_rule_key: null, tax_settings: {} };
    }

    const rule = await this.rules.getRule(input.ruleKey);
    if (!rule) {
      throw AppError.badRequest('unknown_tax_rule', `No supported tax rule '${input.ruleKey}'`);
    }
    const result = validateTaxSettings(rule.portfolio_settings_schema, input.settings);
    if (!result.ok) throw invalidSettings(result.errors);

    await this.portfolios.setForOwner(userId, portfolioId, input.ruleKey, input.settings);
    return { portfolio_id: portfolioId, tax_rule_key: input.ruleKey, tax_settings: input.settings };
  }
}

function invalidSettings(errors: TaxSettingsValidationError[]): AppError {
  return AppError.badRequest(
    'invalid_tax_settings',
    'Tax settings failed schema validation',
    errors.map((e) => ({ field: e.path || '(root)', code: 'invalid', message: e.message })),
  );
}

function normalizeCountry(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw AppError.badRequest('invalid_country_code', 'country must be an ISO 3166-1 alpha-2 code');
  }
  return code;
}
