import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type {
  CorporateActionInput,
  EarningsSnapshot,
  EventsProvider,
  NewsItem,
} from '../application/ports.js';

/**
 * Events provider backed by the providers service. The providers DTOs are
 * already normalized, so this is a thin pass-through. The `provider` argument
 * names the upstream source selected for the instrument's events feed.
 */
export class ProvidersEventsProvider implements EventsProvider {
  constructor(private readonly client: ProvidersClient) {}

  fetchEarnings(provider: string, symbol: string): Promise<EarningsSnapshot | null> {
    return this.client.fetchEarnings(symbol, provider);
  }

  fetchCorporateActions(provider: string, symbol: string): Promise<CorporateActionInput[]> {
    return this.client.fetchCorporateActions(symbol, provider);
  }

  fetchNews(provider: string, symbol: string): Promise<NewsItem[]> {
    return this.client.fetchNews(symbol, provider);
  }
}
