import type { Kysely } from 'kysely';
import type { TaxSettingsSchema } from '@portfolio/platform';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { TaxRule, TaxRuleFilter, TaxRuleRepository } from '../application/ports.js';

interface TaxRuleRow {
  id: string;
  country_code: string;
  rule_key: string;
  rule_version: number;
  asset_classes: string[];
  valid_from: Date | string;
  valid_to: Date | string | null;
  user_settings_schema: unknown;
  portfolio_settings_schema: unknown;
  parameters: unknown;
  calculation_engine_key: string;
  supported: boolean;
}

const COLUMNS = [
  'id',
  'country_code',
  'rule_key',
  'rule_version',
  'asset_classes',
  'valid_from',
  'valid_to',
  'user_settings_schema',
  'portfolio_settings_schema',
  'parameters',
  'calculation_engine_key',
  'supported',
] as const;

/** Kysely adapter for `portfolio.tax_rules` (global reference data). */
export class KyselyTaxRuleRepository implements TaxRuleRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async list(filter: TaxRuleFilter): Promise<TaxRule[]> {
    let q = this.db.selectFrom('portfolio.tax_rules').select(COLUMNS).where('supported', '=', true);
    if (filter.countryCode) q = q.where('country_code', '=', filter.countryCode);
    if (filter.on) {
      q = q.where('valid_from', '<=', filter.on).where((eb) =>
        eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', filter.on!)]),
      );
    }
    const rows = (await q.orderBy('valid_from', 'desc').orderBy('rule_key', 'asc').execute()) as TaxRuleRow[];

    // Asset-class membership is narrowed here: the column is a text[] and the set
    // of supported rules is tiny, so an in-memory filter is simpler than a SQL
    // array operator and keeps the query portable.
    const matched = filter.assetClass ? rows.filter((r) => r.asset_classes.includes(filter.assetClass!)) : rows;
    return matched.map(toRule);
  }

  async getByKey(ruleKey: string, on?: string): Promise<TaxRule | null> {
    const effective = on ?? new Date().toISOString().slice(0, 10);
    const row = (await this.db
      .selectFrom('portfolio.tax_rules')
      .select(COLUMNS)
      .where('rule_key', '=', ruleKey)
      .where('supported', '=', true)
      .where('valid_from', '<=', effective)
      .where((eb) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>=', effective)]))
      .orderBy('rule_version', 'desc')
      .executeTakeFirst()) as TaxRuleRow | undefined;
    return row ? toRule(row) : null;
  }
}

function toRule(row: TaxRuleRow): TaxRule {
  return {
    id: row.id,
    country_code: row.country_code,
    rule_key: row.rule_key,
    rule_version: row.rule_version,
    asset_classes: row.asset_classes,
    valid_from: dateStr(row.valid_from),
    valid_to: row.valid_to === null ? null : dateStr(row.valid_to),
    user_settings_schema: row.user_settings_schema as TaxSettingsSchema,
    portfolio_settings_schema: row.portfolio_settings_schema as TaxSettingsSchema,
    parameters: (row.parameters ?? {}) as Record<string, unknown>,
    calculation_engine_key: row.calculation_engine_key,
    supported: row.supported,
  };
}

function dateStr(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
