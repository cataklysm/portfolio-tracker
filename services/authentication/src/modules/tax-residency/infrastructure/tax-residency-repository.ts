import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { AuthDatabase } from '../../../platform/database/schema.js';

export interface TaxResidency {
  id: string;
  country_code: string;
  valid_from: string;
  valid_until: string | null;
  is_primary: boolean;
  confirmed_at: string;
}

export interface NewTaxResidency {
  countryCode: string;
  validFrom: string;
  isPrimary: boolean;
}

interface ResidencyRow {
  id: string;
  country_code: string;
  valid_from: Date | string;
  valid_until: Date | string | null;
  is_primary: boolean;
  confirmed_at: Date | string;
}

const COLUMNS = ['id', 'country_code', 'valid_from', 'valid_until', 'is_primary', 'confirmed_at'] as const;

/** Kysely adapter for `authentication.tax_residencies`. */
export class KyselyTaxResidencyRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async listForUser(userId: string): Promise<TaxResidency[]> {
    const rows = await this.db
      .selectFrom('authentication.tax_residencies')
      .select(COLUMNS)
      .where('user_id', '=', userId)
      .orderBy('valid_from', 'desc')
      .execute();
    return rows.map((r) => toRecord(r as ResidencyRow));
  }

  /**
   * Records a new tax residence effective from `validFrom`. The currently open
   * residence (if any) is closed at that date, so history stays contiguous and
   * the partial unique index (one current primary per user) is never violated.
   */
  async setResidency(userId: string, input: NewTaxResidency): Promise<TaxResidency> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('authentication.tax_residencies')
        .set({ valid_until: input.validFrom, updated_at: new Date() })
        .where('user_id', '=', userId)
        .where('valid_until', 'is', null)
        .execute();

      const row = await trx
        .insertInto('authentication.tax_residencies')
        .values({
          user_id: userId,
          country_code: input.countryCode,
          valid_from: input.validFrom,
          valid_until: null,
          is_primary: input.isPrimary,
          confirmed_at: sql`now()`,
        })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      return toRecord(row as ResidencyRow);
    });
  }
}

function toRecord(row: ResidencyRow): TaxResidency {
  return {
    id: row.id,
    country_code: row.country_code,
    valid_from: dateStr(row.valid_from),
    valid_until: row.valid_until === null ? null : dateStr(row.valid_until),
    is_primary: row.is_primary,
    confirmed_at: iso(row.confirmed_at),
  };
}

function dateStr(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
