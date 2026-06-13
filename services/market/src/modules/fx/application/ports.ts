export interface FxRateRecord {
  baseCurrency: string;
  quoteCurrency: string;
  effectiveDate: string;
  rate: string;
  provider: string;
}

export interface FxRepository {
  /** Latest stored EUR-based rate per requested quote currency. */
  getLatestEurRates(quoteCurrencies: string[]): Promise<Map<string, string>>;
  /** Most recent EUR-based rate on or before the given date (last-available fallback). */
  getEurRateOnOrBefore(quoteCurrency: string, date: string): Promise<{ date: string; rate: string } | null>;
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
