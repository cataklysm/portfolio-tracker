import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type {
  CorporateActionInput,
  EarningsSnapshot,
  EventsProvider,
  NewsItem,
} from '../application/ports.js';

/**
 * Events provider backed by the providers service. The providers DTOs are
 * already normalized, so this is a thin pass-through. `name` is the upstream
 * symbol namespace ('yahoo'), used by the instruments resolver.
 */
export class ProvidersEventsProvider implements EventsProvider {
  readonly name = 'yahoo';

  constructor(private readonly client: ProvidersClient) {}

  fetchEarnings(symbol: string): Promise<EarningsSnapshot | null> {
    return this.client.fetchEarnings(symbol);
  }

  fetchCorporateActions(symbol: string): Promise<CorporateActionInput[]> {
    return this.client.fetchCorporateActions(symbol);
  }

  fetchNews(symbol: string): Promise<NewsItem[]> {
    return this.client.fetchNews(symbol);
  }
}
