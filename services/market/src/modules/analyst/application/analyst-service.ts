import type { Logger } from '@portfolio/platform';
import type { RefreshPlanResolver } from '../../quotes/application/ports.js';
import type { AnalystEventStore, AnalystProvider } from './ports.js';

export interface AnalystServiceDeps {
  /** Resolves the `analyst` plan: each listing → its selected provider + symbol. */
  planResolver: RefreshPlanResolver;
  provider: AnalystProvider;
  events: AnalystEventStore;
  logger: Logger;
}

/**
 * Fetches analyst consensus from each instrument's selected provider and emits a
 * `market.analyst_assessment.updated` event per instrument (the insights service
 * consumes it and stores the global analyst records). Deduplicates per instrument
 * so several listings of the same company cause one event.
 */
export class AnalystService {
  constructor(private readonly deps: AnalystServiceDeps) {}

  async refreshForListings(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    const plan = await this.deps.planResolver.resolve('analyst', listingIds);

    const seen = new Set<string>();
    let published = 0;
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
      if (seen.has(entry.instrumentId)) continue;
      seen.add(entry.instrumentId);
      try {
        const assessment = await this.deps.provider.fetchAssessment(entry.provider, entry.providerSymbol);
        if (!assessment) continue;
        await this.deps.events.enqueueAnalystAssessment({
          instrumentId: entry.instrumentId,
          currency: entry.currency,
          ...assessment,
        });
        published += 1;
      } catch (err) {
        this.deps.logger.warn(
          { err, symbol: entry.providerSymbol, error_code: 'analyst_refresh_failed' },
          'Analyst assessment refresh failed',
        );
      }
    }
    return published;
  }
}
