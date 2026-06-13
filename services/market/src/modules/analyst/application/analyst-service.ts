import type { Logger } from '@portfolio/platform';
import type { ListingResolver } from '../../quotes/application/ports.js';
import type { AnalystEventStore, AnalystProvider } from './ports.js';

export interface AnalystServiceDeps {
  resolver: ListingResolver;
  provider: AnalystProvider;
  events: AnalystEventStore;
  logger: Logger;
}

/**
 * Fetches analyst consensus from the provider for a set of listings and emits an
 * `market.analyst_assessment.updated` event per instrument (the insights service
 * consumes it and stores the global analyst records). Deduplicates per
 * instrument so several listings of the same company cause one event.
 */
export class AnalystService {
  constructor(private readonly deps: AnalystServiceDeps) {}

  async refreshForListings(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    const resolved = await this.deps.resolver.resolve(listingIds, this.deps.provider.name);

    const seen = new Set<string>();
    let published = 0;
    for (const listing of resolved.values()) {
      if (seen.has(listing.instrumentId)) continue;
      seen.add(listing.instrumentId);
      try {
        const assessment = await this.deps.provider.fetchAssessment(listing.providerSymbol);
        if (!assessment) continue;
        await this.deps.events.enqueueAnalystAssessment({
          instrumentId: listing.instrumentId,
          currency: listing.currency,
          ...assessment,
        });
        published += 1;
      } catch (err) {
        this.deps.logger.warn(
          { err, symbol: listing.providerSymbol, error_code: 'analyst_refresh_failed' },
          'Analyst assessment refresh failed',
        );
      }
    }
    return published;
  }
}
