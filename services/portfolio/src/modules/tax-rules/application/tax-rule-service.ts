import { AppError } from '@portfolio/platform';
import type { TaxRule, TaxRuleFilter, TaxRuleRepository } from './ports.js';

export interface FindTaxRulesInput {
  countryCode?: string;
  assetClass?: string;
  on?: string;
}

/**
 * Read access to the tax-rules registry. Rules are global reference data, so no
 * user scoping applies; the service only normalises the lookup and defaults the
 * effective date to today. It never computes tax — the matched rule's
 * `calculation_engine_key` points to the code engine that does (in a later phase).
 */
export class TaxRuleService {
  constructor(private readonly repo: TaxRuleRepository) {}

  find(input: FindTaxRulesInput): Promise<TaxRule[]> {
    const filter: TaxRuleFilter = {
      countryCode: input.countryCode ? normalizeCountry(input.countryCode) : undefined,
      assetClass: input.assetClass?.trim() || undefined,
      on: input.on ? requireDate(input.on, 'on') : new Date().toISOString().slice(0, 10),
    };
    return this.repo.list(filter);
  }

  /** The supported rule for a key valid today (or `on`), or null. */
  getRule(ruleKey: string, on?: string): Promise<TaxRule | null> {
    return this.repo.getByKey(ruleKey, on ? requireDate(on, 'on') : undefined);
  }

  /**
   * The user-level settings schema for a residence. The userTaxSettingsSchema is
   * residence-level (shared across a country's asset-class rules), so any current
   * rule for the country supplies it. Null when the country has no supported rule.
   */
  async userSchemaForCountry(countryCode: string, on?: string): Promise<TaxRule['user_settings_schema'] | null> {
    const rules = await this.find({ countryCode, on });
    return rules[0]?.user_settings_schema ?? null;
  }
}

function normalizeCountry(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw AppError.badRequest('invalid_country_code', 'country must be an ISO 3166-1 alpha-2 code');
  }
  return code;
}

function requireDate(raw: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw AppError.badRequest('invalid_date', `${field} must be YYYY-MM-DD`);
  return raw;
}
