import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type {
  EarningsQuery,
  EarningsRepository,
  EarningsRow,
  Page,
  StoredEarnings,
  UpcomingEarnings,
} from '../application/ports.js';

/** Kysely adapter for `events.earnings`. */
export class KyselyEarningsRepository implements EarningsRepository {
  constructor(private readonly db: Kysely<EventsDatabase>) {}

  async upsert(rows: EarningsRow[]): Promise<void> {
    for (const row of rows) {
      await this.db
        .insertInto('events.earnings')
        .values({
          instrument_id: row.instrumentId,
          fiscal_year: row.fiscalYear,
          fiscal_quarter: row.fiscalQuarter,
          period_end_date: row.periodEndDate,
          report_date: row.reportDate,
          eps_estimate: row.epsEstimate,
          eps_actual: row.epsActual,
          revenue_estimate: row.revenueEstimate,
          revenue_actual: row.revenueActual,
          surprise_pct: row.surprisePct,
          provider: row.provider,
          raw_payload: JSON.stringify(row.rawPayload),
        })
        .onConflict((oc) =>
          oc.columns(['instrument_id', 'fiscal_year', 'fiscal_quarter', 'provider']).doUpdateSet({
            period_end_date: row.periodEndDate,
            report_date: row.reportDate,
            eps_estimate: row.epsEstimate,
            eps_actual: row.epsActual,
            revenue_estimate: row.revenueEstimate,
            revenue_actual: row.revenueActual,
            surprise_pct: row.surprisePct,
            raw_payload: JSON.stringify(row.rawPayload),
            updated_at: sql`now()`,
          }),
        )
        .execute();
    }
  }

  async listUpcomingForInstruments(instrumentIds: string[]): Promise<UpcomingEarnings[]> {
    if (instrumentIds.length === 0) return [];
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    // Earliest not-yet-reported earnings per instrument (DISTINCT ON, ascending).
    const rows = await this.db
      .selectFrom('events.earnings')
      .distinctOn('instrument_id')
      .select(['instrument_id', 'report_date'])
      .where('instrument_id', 'in', instrumentIds)
      .where('eps_actual', 'is', null)
      .where('report_date', 'is not', null)
      .where('report_date', '>=', today)
      .orderBy('instrument_id')
      .orderBy('report_date', 'asc')
      .execute();
    const out: UpcomingEarnings[] = [];
    for (const r of rows) {
      if (r.report_date === null) continue;
      out.push({ instrument_id: r.instrument_id, report_date: isoDate(r.report_date) });
    }
    return out;
  }

  async listByInstrument(instrumentId: string): Promise<StoredEarnings[]> {
    const rows = await this.db
      .selectFrom('events.earnings')
      .selectAll()
      .where('instrument_id', '=', instrumentId)
      .orderBy('fiscal_year', 'desc')
      .orderBy('fiscal_quarter', 'desc')
      .execute();

    return rows.map((row) => ({
      instrument_id: row.instrument_id,
      fiscal_year: row.fiscal_year,
      fiscal_quarter: row.fiscal_quarter,
      period_end_date: row.period_end_date ? isoDate(row.period_end_date) : null,
      report_date: row.report_date ? isoDate(row.report_date) : null,
      eps_estimate: row.eps_estimate,
      eps_actual: row.eps_actual,
      revenue_estimate: row.revenue_estimate,
      revenue_actual: row.revenue_actual,
      surprise_pct: row.surprise_pct,
      provider: row.provider,
      // No reported EPS yet ⇒ this is an upcoming report.
      is_upcoming: row.eps_actual === null,
    }));
  }

  async query(input: EarningsQuery): Promise<Page<StoredEarnings>> {
    if (input.instrumentIds.length === 0) return { items: [], total: 0, limit: input.limit, offset: input.offset };

    let base = this.db
      .selectFrom('events.earnings')
      .where('instrument_id', 'in', input.instrumentIds);

    if (input.isUpcoming !== undefined) {
      base = input.isUpcoming ? base.where('eps_actual', 'is', null) : base.where('eps_actual', 'is not', null);
    }
    if (input.dateFrom) base = base.where('report_date', '>=', dateFromIso(input.dateFrom));
    if (input.dateTo) base = base.where('report_date', '<=', dateFromIso(input.dateTo));

    const [countRow, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirst(),
      base
        .selectAll()
        .orderBy('report_date', input.isUpcoming === false ? 'desc' : 'asc')
        .orderBy('fiscal_year', 'desc')
        .orderBy('fiscal_quarter', 'desc')
        .limit(input.limit)
        .offset(input.offset)
        .execute(),
    ]);

    return {
      items: rows.map(toStoredEarnings),
      total: Number(countRow?.count ?? 0),
      limit: input.limit,
      offset: input.offset,
    };
  }
}

function toStoredEarnings(row: {
  instrument_id: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: Date | string | null;
  report_date: Date | string | null;
  eps_estimate: string | null;
  eps_actual: string | null;
  revenue_estimate: string | null;
  revenue_actual: string | null;
  surprise_pct: string | null;
  provider: string;
}): StoredEarnings {
  return {
    instrument_id: row.instrument_id,
    fiscal_year: row.fiscal_year,
    fiscal_quarter: row.fiscal_quarter,
    period_end_date: row.period_end_date ? isoDate(row.period_end_date) : null,
    report_date: row.report_date ? isoDate(row.report_date) : null,
    eps_estimate: row.eps_estimate,
    eps_actual: row.eps_actual,
    revenue_estimate: row.revenue_estimate,
    revenue_actual: row.revenue_actual,
    surprise_pct: row.surprise_pct,
    provider: row.provider,
    is_upcoming: row.eps_actual === null,
  };
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function dateFromIso(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}
