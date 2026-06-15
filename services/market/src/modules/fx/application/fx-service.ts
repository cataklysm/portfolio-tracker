import type { FxProvider, FxRateRecord, FxRepository, ProviderDailyRates } from './ports.js';

export interface FxServiceDeps {
  repo: FxRepository;
  provider: FxProvider;
}

/**
 * Serves official daily EUR-based FX rates from stored data and refreshes them
 * from the provider (ECB). Historical conversions use the most recent rate on
 * or before the requested date — the last-available-rate fallback for weekends
 * and holidays.
 */
export class FxService {
  constructor(private readonly deps: FxServiceDeps) {}

  async getEurRates(quoteCurrencies: string[]): Promise<Record<string, string>> {
    const filtered = quoteCurrencies.filter((c) => c !== 'EUR');
    const map = await this.deps.repo.getLatestEurRates(filtered);
    return Object.fromEntries(map);
  }

  async getEurRateForDate(quoteCurrency: string, date: string): Promise<{ date: string; rate: string } | null> {
    if (quoteCurrency === 'EUR') return { date, rate: '1' };
    return this.deps.repo.getEurRateOnOrBefore(quoteCurrency, date);
  }

  /**
   * Daily EUR-based rate series per quote currency over `[from, to]` (EUR is
   * implicit and excluded). Each series is prefixed with the most recent point
   * before `from` so a consumer can forward-fill any date in the range.
   */
  async getEurRateSeries(
    quoteCurrencies: string[],
    from: string,
    to: string,
  ): Promise<Record<string, { date: string; rate: string }[]>> {
    const filtered = quoteCurrencies.filter((c) => c !== 'EUR');
    const map = await this.deps.repo.getEurRateSeries(filtered, from, to);
    return Object.fromEntries(map);
  }

  /** Refreshes the latest published day. Returns the number of rates stored. */
  async refreshDaily(): Promise<number> {
    const daily = await this.deps.provider.fetchDaily();
    if (!daily) return 0;
    return this.persist([daily]);
  }

  /** Backfills the rolling history (e.g. on first start). */
  async refreshHistory(): Promise<number> {
    const history = await this.deps.provider.fetchHistory();
    return this.persist(history);
  }

  private async persist(days: ProviderDailyRates[]): Promise<number> {
    const records: FxRateRecord[] = [];
    for (const day of days) {
      for (const [quoteCurrency, rate] of day.rates) {
        records.push({
          baseCurrency: 'EUR',
          quoteCurrency,
          effectiveDate: day.date,
          rate,
          provider: this.deps.provider.name,
        });
      }
    }
    if (records.length > 0) await this.deps.repo.upsertRates(records);
    return records.length;
  }
}
