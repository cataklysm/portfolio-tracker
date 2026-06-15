import { sql, type Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type {
  PortfolioTaxConfig,
  PortfolioTaxSettings,
  PortfolioTaxSettingsRepository,
} from '../application/ports.js';

interface Row {
  id: string;
  tax_rule_key: string | null;
  tax_settings: unknown;
}

/** Kysely adapter for the tax columns on `portfolio.portfolios`, scoped to the owner. */
export class KyselyPortfolioTaxSettingsRepository implements PortfolioTaxSettingsRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async getForOwner(userId: string, portfolioId: string): Promise<PortfolioTaxSettings | null> {
    const row = (await this.db
      .selectFrom('portfolio.portfolios')
      .select(['id', 'tax_rule_key', 'tax_settings'])
      .where('id', '=', portfolioId)
      .where('user_id', '=', userId)
      .executeTakeFirst()) as Row | undefined;
    return row ? toSettings(row) : null;
  }

  async listForUser(userId: string, portfolioId?: string): Promise<PortfolioTaxConfig[]> {
    let q = this.db
      .selectFrom('portfolio.portfolios')
      .select(['id', 'name', 'tax_rule_key', 'tax_settings'])
      .where('user_id', '=', userId)
      .where('archived_at', 'is', null);
    if (portfolioId) q = q.where('id', '=', portfolioId);
    const rows = await q.orderBy('sort_order').execute();
    return rows.map((row) => ({
      portfolio_id: row.id,
      name: row.name,
      tax_rule_key: row.tax_rule_key,
      tax_settings: (row.tax_settings ?? {}) as Record<string, unknown>,
    }));
  }

  async setForOwner(
    userId: string,
    portfolioId: string,
    ruleKey: string | null,
    settings: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('portfolio.portfolios')
      .set({ tax_rule_key: ruleKey, tax_settings: JSON.stringify(settings), updated_at: sql`now()` })
      .where('id', '=', portfolioId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}

function toSettings(row: Row): PortfolioTaxSettings {
  return {
    portfolio_id: row.id,
    tax_rule_key: row.tax_rule_key,
    tax_settings: (row.tax_settings ?? {}) as Record<string, unknown>,
  };
}
