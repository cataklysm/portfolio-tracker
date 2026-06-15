import type { TaxSettingsSchema } from '@portfolio/platform';

/** Saved user-level (residence) tax settings. */
export interface UserTaxSettings {
  country_code: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface UserTaxSettingsRepository {
  get(userId: string): Promise<UserTaxSettings | null>;
  upsert(userId: string, countryCode: string, settings: Record<string, unknown>): Promise<UserTaxSettings>;
}

/** Saved per-portfolio tax settings and the rule that governs the portfolio. */
export interface PortfolioTaxSettings {
  portfolio_id: string;
  tax_rule_key: string | null;
  tax_settings: Record<string, unknown>;
}

/** Per-portfolio tax config including the portfolio name, for the estimate read. */
export interface PortfolioTaxConfig extends PortfolioTaxSettings {
  name: string;
}

export interface PortfolioTaxSettingsRepository {
  /** Settings for an owned portfolio, or null when it does not exist / is not owned. */
  getForOwner(userId: string, portfolioId: string): Promise<PortfolioTaxSettings | null>;
  /** Tax config for the user's portfolios (optionally one), for the estimate read. */
  listForUser(userId: string, portfolioId?: string): Promise<PortfolioTaxConfig[]>;
  /** Updates an owned portfolio's tax settings; false when not found / not owned. */
  setForOwner(
    userId: string,
    portfolioId: string,
    ruleKey: string | null,
    settings: Record<string, unknown>,
  ): Promise<boolean>;
}

/** The slice of the tax-rules registry this module needs for validation. */
export interface TaxRuleLookup {
  getRule(
    ruleKey: string,
  ): Promise<{ portfolio_settings_schema: TaxSettingsSchema; rule_version: number } | null>;
  userSchemaForCountry(countryCode: string): Promise<TaxSettingsSchema | null>;
}
