import type { Logger } from '@portfolio/platform';
import { toCorporateActionRows, toEarningsRows, toNewsRows } from '../domain/mapping.js';
import type {
  CorporateActionsRepository,
  EarningsRepository,
  EventsEventStore,
  EventsProvider,
  ListingResolver,
  NewsRepository,
  RefreshStateRepository,
  StoredCorporateAction,
  StoredEarnings,
  StoredNews,
  UpcomingEarnings,
} from './ports.js';

export interface EventsServiceDeps {
  earnings: EarningsRepository;
  corporateActions: CorporateActionsRepository;
  news: NewsRepository;
  refreshState: RefreshStateRepository;
  provider: EventsProvider;
  resolver: ListingResolver;
  events: EventsEventStore;
  logger: Logger;
  /** Instruments refreshed within this window are skipped by a non-forced cycle. */
  minAgeMs: number;
  newsReadLimit: number;
}

/**
 * Serves stored event data (earnings, corporate actions, news) and refreshes it
 * from the providers service. Events are per-instrument; refresh resolves the
 * interested listings to instruments, dedupes, skips instruments refreshed
 * within `minAgeMs`, fetches all three feeds, and stores them.
 */
export class EventsService {
  constructor(private readonly deps: EventsServiceDeps) {}

  getEarnings(instrumentId: string): Promise<StoredEarnings[]> {
    return this.deps.earnings.listByInstrument(instrumentId);
  }

  getCorporateActions(instrumentId: string): Promise<StoredCorporateAction[]> {
    return this.deps.corporateActions.listByInstrument(instrumentId);
  }

  getNews(instrumentId: string, limit?: number): Promise<StoredNews[]> {
    return this.deps.news.listByInstrument(instrumentId, limit ?? this.deps.newsReadLimit);
  }

  /** Next upcoming earnings date per instrument (for the notifications worker). */
  getUpcomingEarnings(instrumentIds: string[]): Promise<UpcomingEarnings[]> {
    return this.deps.earnings.listUpcomingForInstruments(instrumentIds);
  }

  /**
   * Refreshes events for a set of listings. Returns the count of instruments
   * processed. Provider/instruments failures are swallowed (logged); stored data
   * stays usable.
   */
  async refreshListings(listingIds: string[], force = false): Promise<number> {
    if (listingIds.length === 0) return 0;
    const resolved = await this.deps.resolver.resolve(listingIds, this.deps.provider.name);

    const byInstrument = new Map<string, { providerSymbol: string; currency: string }>();
    for (const listing of resolved.values()) {
      if (!byInstrument.has(listing.instrumentId)) {
        byInstrument.set(listing.instrumentId, {
          providerSymbol: listing.providerSymbol,
          currency: listing.currency,
        });
      }
    }
    if (byInstrument.size === 0) return 0;

    let instrumentIds = [...byInstrument.keys()];
    if (!force) {
      const before = new Date(Date.now() - this.deps.minAgeMs);
      instrumentIds = await this.deps.refreshState.selectStaleInstruments(instrumentIds, before);
    }

    const processed: string[] = [];
    for (const instrumentId of instrumentIds) {
      const target = byInstrument.get(instrumentId);
      if (!target) continue;
      try {
        await this.refreshInstrument(instrumentId, target.providerSymbol, target.currency);
        processed.push(instrumentId);
      } catch (err) {
        this.deps.logger.warn(
          { err, symbol: target.providerSymbol, error_code: 'events_refresh_failed' },
          'Events refresh failed',
        );
      }
    }

    await this.deps.refreshState.markRefreshed(processed);
    return processed.length;
  }

  private async refreshInstrument(instrumentId: string, providerSymbol: string, currency: string): Promise<void> {
    const provider = this.deps.provider.name;
    const [earnings, actions, news] = await Promise.all([
      this.deps.provider.fetchEarnings(providerSymbol),
      this.deps.provider.fetchCorporateActions(providerSymbol),
      this.deps.provider.fetchNews(providerSymbol),
    ]);

    if (earnings) await this.deps.earnings.upsert(toEarningsRows(instrumentId, provider, earnings));
    if (actions.length > 0) {
      await this.deps.corporateActions.upsert(toCorporateActionRows(instrumentId, provider, currency, actions));
    }
    if (news.length > 0) await this.deps.news.upsert(toNewsRows(instrumentId, provider, news));

    await this.deps.events.enqueueEventsUpdated({ instrumentId });
  }
}
