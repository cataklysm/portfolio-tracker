import type { Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { FxRatePoint, FxRateRecord, FxRepository } from '../application/ports.js';

/** Kysely adapter for the `market.fx_rates` table (EUR-based daily rates). */
export class KyselyFxRepository implements FxRepository {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

  async listAvailableQuoteCurrencies(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('market.fx_rates')
      .select('quote_currency')
      .where('base_currency', '=', 'EUR')
      .groupBy('quote_currency')
      .orderBy('quote_currency')
      .execute();
    return rows.map((row) => row.quote_currency);
  }

  async getLatestEurRates(quoteCurrencies: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (quoteCurrencies.length === 0) return map;
    const rows = await this.db
      .selectFrom('market.fx_rates')
      .distinctOn('quote_currency')
      .select(['quote_currency', 'rate'])
      .where('base_currency', '=', 'EUR')
      .where('quote_currency', 'in', quoteCurrencies)
      .orderBy('quote_currency')
      .orderBy('effective_date', 'desc')
      .execute();
    for (const row of rows) map.set(row.quote_currency, row.rate);
    return map;
  }

  async getEurRateOnOrBefore(
    quoteCurrency: string,
    date: string,
  ): Promise<{ date: string; rate: string } | null> {
    const row = await this.db
      .selectFrom('market.fx_rates')
      .select(['effective_date', 'rate'])
      .where('base_currency', '=', 'EUR')
      .where('quote_currency', '=', quoteCurrency)
      .where('effective_date', '<=', date)
      .orderBy('effective_date', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? { date: row.effective_date, rate: row.rate } : null;
  }

  async getEurRateSeries(
    quoteCurrencies: string[],
    from: string,
    to: string,
  ): Promise<Map<string, FxRatePoint[]>> {
    const out = new Map<string, FxRatePoint[]>();
    if (quoteCurrencies.length === 0) return out;

    // Most recent point strictly before the window, per currency, so the first
    // in-range sample dates (e.g. a weekend) still resolve to a rate.
    const anchors = await this.db
      .selectFrom('market.fx_rates')
      .distinctOn('quote_currency')
      .select(['quote_currency', 'effective_date', 'rate'])
      .where('base_currency', '=', 'EUR')
      .where('quote_currency', 'in', quoteCurrencies)
      .where('effective_date', '<', from)
      .orderBy('quote_currency')
      .orderBy('effective_date', 'desc')
      .execute();

    const inRange = await this.db
      .selectFrom('market.fx_rates')
      .select(['quote_currency', 'effective_date', 'rate'])
      .where('base_currency', '=', 'EUR')
      .where('quote_currency', 'in', quoteCurrencies)
      .where('effective_date', '>=', from)
      .where('effective_date', '<=', to)
      .orderBy('quote_currency')
      .orderBy('effective_date', 'asc')
      .execute();

    // Anchors first (date < from), then ascending in-range points → ascending list.
    for (const row of [...anchors, ...inRange]) {
      const list = out.get(row.quote_currency) ?? [];
      list.push({ date: row.effective_date, rate: row.rate });
      out.set(row.quote_currency, list);
    }
    return out;
  }

  async upsertRates(records: FxRateRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.db
      .insertInto('market.fx_rates')
      .values(
        records.map((r) => ({
          base_currency: r.baseCurrency,
          quote_currency: r.quoteCurrency,
          effective_date: r.effectiveDate,
          rate: r.rate,
          provider: r.provider,
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(['base_currency', 'quote_currency', 'effective_date', 'provider'])
          .doUpdateSet({ rate: (eb) => eb.ref('excluded.rate'), retrieved_at: new Date() }),
      )
      .execute();
  }
}
