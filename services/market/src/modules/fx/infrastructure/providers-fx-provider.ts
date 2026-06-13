import type { ProvidersClient, ProvidersFxDailyDto } from '../../../platform/providers/providers-client.js';
import type { FxProvider, ProviderDailyRates } from '../application/ports.js';

function toDailyRates(day: ProvidersFxDailyDto): ProviderDailyRates {
  return { date: day.date, rates: new Map(Object.entries(day.rates)) };
}

/**
 * EUR-based FX provider backed by the providers service (ECB upstream). The
 * providers endpoint returns the latest day and the rolling history together;
 * `fetchDaily`/`fetchHistory` each pick the slice the FX service asked for.
 */
export class ProvidersFxProvider implements FxProvider {
  readonly name = 'ecb';

  constructor(private readonly client: ProvidersClient) {}

  async fetchDaily(): Promise<ProviderDailyRates | null> {
    const { daily } = await this.client.fetchFxRates();
    return daily ? toDailyRates(daily) : null;
  }

  async fetchHistory(): Promise<ProviderDailyRates[]> {
    const { history } = await this.client.fetchFxRates();
    return history.map(toDailyRates);
  }
}
