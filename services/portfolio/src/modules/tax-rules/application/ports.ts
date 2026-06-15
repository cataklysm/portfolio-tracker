import type { TaxSettingsSchema } from '@portfolio/platform';

/**
 * A tax rule binds a (country, asset class, date range) to the settings schemas
 * the frontend renders, simple data-only parameters, and a code-defined
 * calculation engine named by `calculation_engine_key`. Rules are global
 * reference data, not user data.
 */
export interface TaxRule {
  id: string;
  country_code: string;
  rule_key: string;
  rule_version: number;
  asset_classes: string[];
  valid_from: string;
  valid_to: string | null;
  user_settings_schema: TaxSettingsSchema;
  portfolio_settings_schema: TaxSettingsSchema;
  /** Data-only engine parameters (rates, thresholds); never executable logic. */
  parameters: Record<string, unknown>;
  calculation_engine_key: string;
  supported: boolean;
}

export interface TaxRuleFilter {
  /** ISO 3166-1 alpha-2 country (tax residence). */
  countryCode?: string;
  /** Instrument asset type the rule must cover (e.g. `equity`, `crypto`). */
  assetClass?: string;
  /** Effective date the rule must be valid on; the repository resolves matching ranges. */
  on?: string;
}

export interface TaxRuleRepository {
  /**
   * Supported rules matching the filter, newest `valid_from` first. Country and
   * effective-date range are applied in the query; asset-class membership is
   * narrowed by the caller filter.
   */
  list(filter: TaxRuleFilter): Promise<TaxRule[]>;
  /**
   * The supported rule for a given `rule_key` valid on `on` (defaults to today),
   * highest `rule_version` first, or null when none applies.
   */
  getByKey(ruleKey: string, on?: string): Promise<TaxRule | null>;
}
