export interface FxRateRecord {
  baseCurrency: string;
  quoteCurrency: string;
  effectiveDate: string;
  rate: string;
  provider: string;
}

/** A single dated EUR-based rate point in a series. */
export interface FxRatePoint {
  date: string;
  rate: string;
}

export interface FxRepository {
  /** Distinct quote currencies currently available in stored EUR-based FX rates. */
  listAvailableQuoteCurrencies(): Promise<string[]>;
  /** Latest stored EUR-based rate per requested quote currency. */
  getLatestEurRates(quoteCurrencies: string[]): Promise<Map<string, string>>;
  /** Most recent EUR-based rate on or before the given date (last-available fallback). */
  getEurRateOnOrBefore(quoteCurrency: string, date: string): Promise<{ date: string; rate: string } | null>;
  /**
   * Daily EUR-based rate series per quote currency over `[from, to]`, each list
   * prefixed with the most recent point strictly before `from` (the anchor) so a
   * consumer can forward-fill any date in the range. Ascending by date.
   */
  getEurRateSeries(
    quoteCurrencies: string[],
    from: string,
    to: string,
  ): Promise<Map<string, FxRatePoint[]>>;
  upsertRates(records: FxRateRecord[]): Promise<void>;
}

export interface ProviderDailyRates {
  date: string;
  /** quote currency -> rate (units per 1 EUR). */
  rates: Map<string, string>;
}

export interface FxProvider {
  readonly name: string;
  fetchDaily(): Promise<ProviderDailyRates | null>;
  fetchHistory(): Promise<ProviderDailyRates[]>;
}
