import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type {
  EarningsRepository,
  EarningsRow,
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
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
