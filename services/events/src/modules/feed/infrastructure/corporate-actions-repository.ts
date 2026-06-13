import type { Kysely } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type {
  CorporateActionRow,
  CorporateActionsRepository,
  StoredCorporateAction,
} from '../application/ports.js';

/** Kysely adapter for `events.corporate_actions`. */
export class KyselyCorporateActionsRepository implements CorporateActionsRepository {
  constructor(private readonly db: Kysely<EventsDatabase>) {}

  async upsert(rows: CorporateActionRow[]): Promise<void> {
    for (const row of rows) {
      await this.db
        .insertInto('events.corporate_actions')
        .values({
          stable_action_id: row.stableActionId,
          version: row.version,
          instrument_id: row.instrumentId,
          type: row.type,
          ex_date: row.exDate,
          ratio_numerator: row.ratioNumerator,
          ratio_denominator: row.ratioDenominator,
          dividend_amount: row.dividendAmount,
          dividend_currency: row.dividendCurrency,
          provider: row.provider,
          raw_payload: JSON.stringify(row.rawPayload),
        })
        .onConflict((oc) =>
          oc.columns(['stable_action_id', 'version']).doUpdateSet({
            ex_date: row.exDate,
            ratio_numerator: row.ratioNumerator,
            ratio_denominator: row.ratioDenominator,
            dividend_amount: row.dividendAmount,
            dividend_currency: row.dividendCurrency,
            raw_payload: JSON.stringify(row.rawPayload),
          }),
        )
        .execute();
    }
  }

  async listByInstrument(instrumentId: string): Promise<StoredCorporateAction[]> {
    const rows = await this.db
      .selectFrom('events.corporate_actions')
      .select([
        'stable_action_id',
        'version',
        'instrument_id',
        'type',
        'ex_date',
        'ratio_numerator',
        'ratio_denominator',
        'dividend_amount',
        'dividend_currency',
        'provider',
      ])
      .where('instrument_id', '=', instrumentId)
      .orderBy('ex_date', 'desc')
      .execute();

    return rows.map((row) => ({
      stable_action_id: row.stable_action_id,
      version: row.version,
      instrument_id: row.instrument_id,
      type: row.type,
      ex_date: isoDate(row.ex_date),
      ratio_numerator: row.ratio_numerator,
      ratio_denominator: row.ratio_denominator,
      dividend_amount: row.dividend_amount,
      dividend_currency: row.dividend_currency,
      provider: row.provider,
    }));
  }
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
