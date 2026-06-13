import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { DiscoveryProvider, DiscoverySuggestion } from '../application/discovery-service.js';

/** Symbol-search discovery provider backed by the providers service. */
export class ProvidersDiscoveryProvider implements DiscoveryProvider {
  // Suggestions are tagged with the upstream provider namespace, not the
  // transport — keep 'yahoo' so discovered symbols map to Yahoo identifiers.
  readonly name = 'yahoo';

  constructor(private readonly client: ProvidersClient) {}

  async search(query: string, limit: number): Promise<Omit<DiscoverySuggestion, 'provider'>[]> {
    const results = await this.client.search(query, limit);
    return results.map((result) => ({
      symbol: result.symbol,
      name: result.name,
      exchange: result.exchange,
      quote_type: result.quoteType,
    }));
  }
}
