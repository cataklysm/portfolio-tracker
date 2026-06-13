import type { EcbClient, EcbDailyRates } from './clients/ecb-client.js';
import type { Capability, FxDailyDto, FxRatesDto, MarketDataProvider } from './types.js';

function toDailyDto(day: EcbDailyRates): FxDailyDto {
  return { date: day.date, rates: Object.fromEntries(day.rates) };
}

/**
 * ECB euro foreign-exchange reference-rate provider (EUR base). Supports only
 * the `fx` capability. Returns today's rates plus the rolling 90-day history so
 * the consuming FX service can apply its own last-available-rate fallback.
 */
export class EcbProvider implements MarketDataProvider {
  readonly name = 'ecb';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['fx']);

  constructor(private readonly client: EcbClient) {}

  async fetchFxRates(): Promise<FxRatesDto> {
    const [daily, history] = await Promise.all([
      this.client.fetchDaily(),
      this.client.fetchHistory90d(),
    ]);
    return {
      base: 'EUR',
      daily: daily ? toDailyDto(daily) : null,
      history: history.map(toDailyDto),
    };
  }
}
