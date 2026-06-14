import type { Logger, WatchSet } from '@portfolio/platform';
import type { QuoteService } from '../../quotes/index.js';
import type { FxService } from '../../fx/index.js';
import type { AnalystService } from '../../analyst/index.js';
import type { RefreshStateRepository } from './ports.js';

export interface RefreshServiceDeps {
  /** The deduped watched-listing set, owned by the instruments service. */
  watchSet: WatchSet;
  refreshState: RefreshStateRepository;
  quotes: QuoteService;
  fx: FxService;
  analyst?: AnalystService;
  logger: Logger;
  intervalMs: number;
  chunkSize?: number;
}

/**
 * Runs the consolidated refresh cycle over the shared watch set. Consolidating
 * per listing means multiple interested users never cause duplicate provider
 * requests; the watch set itself is owned and deduped by the instruments service.
 */
export class RefreshService {
  private readonly chunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.chunkSize = deps.chunkSize ?? 25;
  }

  /** One refresh cycle: refresh all watched listings, plus FX. */
  async runCycle(): Promise<void> {
    try {
      await this.deps.fx.refreshDaily();
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'fx_refresh_failed' }, 'FX refresh failed');
    }

    const listingIds = this.deps.watchSet.listActiveListingIds();
    const nextDue = new Date(Date.now() + this.deps.intervalMs);
    for (const chunk of chunked(listingIds, this.chunkSize)) {
      try {
        await this.deps.quotes.refreshLatest(chunk);
        await this.deps.refreshState.recordRefresh(chunk, 'yahoo', nextDue);
      } catch (err) {
        this.deps.logger.warn({ err, error_code: 'quote_refresh_failed' }, 'Quote refresh chunk failed');
      }
      if (this.deps.analyst) {
        try {
          await this.deps.analyst.refreshForListings(chunk);
        } catch (err) {
          this.deps.logger.warn({ err, error_code: 'analyst_refresh_failed' }, 'Analyst refresh chunk failed');
        }
      }
    }
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
