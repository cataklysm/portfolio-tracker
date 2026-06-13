/**
 * Normalized provider-discovery suggestion. The instruments service calls this
 * during search and presents the result for user confirmation before any
 * instrument/listing is created. Provider-specific structures never leak.
 */
export interface DiscoverySuggestion {
  symbol: string;
  name: string;
  exchange: string | null;
  quote_type: string | null;
  provider: string;
}

export interface DiscoveryProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<Omit<DiscoverySuggestion, 'provider'>[]>;
}

export class DiscoveryService {
  constructor(private readonly provider: DiscoveryProvider) {}

  async search(query: string, limit = 10): Promise<DiscoverySuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    const results = await this.provider.search(trimmed, limit);
    return results.map((result) => ({ ...result, provider: this.provider.name }));
  }
}
