import { sql, type Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { UserTaxSettings, UserTaxSettingsRepository } from '../application/ports.js';

interface Row {
  country_code: string;
  settings: unknown;
  updated_at: Date | string;
}

/** Kysely adapter for `portfolio.user_tax_settings` (one row per user). */
export class KyselyUserTaxSettingsRepository implements UserTaxSettingsRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async get(userId: string): Promise<UserTaxSettings | null> {
    const row = (await this.db
      .selectFrom('portfolio.user_tax_settings')
      .select(['country_code', 'settings', 'updated_at'])
      .where('user_id', '=', userId)
      .executeTakeFirst()) as Row | undefined;
    return row ? toSettings(row) : null;
  }

  async upsert(
    userId: string,
    countryCode: string,
    settings: Record<string, unknown>,
  ): Promise<UserTaxSettings> {
    const row = (await this.db
      .insertInto('portfolio.user_tax_settings')
      .values({ user_id: userId, country_code: countryCode, settings: JSON.stringify(settings) })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          country_code: countryCode,
          settings: JSON.stringify(settings),
          updated_at: sql`now()`,
        }),
      )
      .returning(['country_code', 'settings', 'updated_at'])
      .executeTakeFirstOrThrow()) as Row;
    return toSettings(row);
  }
}

function toSettings(row: Row): UserTaxSettings {
  return {
    country_code: row.country_code,
    settings: (row.settings ?? {}) as Record<string, unknown>,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}
