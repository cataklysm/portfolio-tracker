import type { Kysely } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type {
  CorporateActionRow,
  CorporateActionsRepository,
  CorporateActionsQuery,
  Page,
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

  async query(input: CorporateActionsQuery): Promise<Page<StoredCorporateAction>> {
    if (input.instrumentIds.length === 0) return { items: [], total: 0, limit: input.limit, offset: input.offset };

    let base = this.db
      .selectFrom('events.corporate_actions')
      .where('instrument_id', 'in', input.instrumentIds);

    if (input.types && input.types.length > 0) base = base.where('type', 'in', input.types);
    if (input.dateFrom) base = base.where('ex_date', '>=', dateFromIso(input.dateFrom));
    if (input.dateTo) base = base.where('ex_date', '<=', dateFromIso(input.dateTo));

    const selection = [
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
    ] as const;

    const [countRow, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirst(),
      base
        .select(selection)
        .orderBy('ex_date', 'desc')
        .limit(input.limit)
        .offset(input.offset)
        .execute(),
    ]);

    return {
      items: rows.map(toStoredCorporateAction),
      total: Number(countRow?.count ?? 0),
      limit: input.limit,
      offset: input.offset,
    };
  }
}

function toStoredCorporateAction(row: {
  stable_action_id: string;
  version: number;
  instrument_id: string;
  type: string;
  ex_date: Date | string;
  ratio_numerator: string | null;
  ratio_denominator: string | null;
  dividend_amount: string | null;
  dividend_currency: string | null;
  provider: string;
}): StoredCorporateAction {
  return {
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
  };
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function dateFromIso(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}
