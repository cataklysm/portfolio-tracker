import type { Logger, WatchSet } from '@portfolio/platform';
import type { FundamentalsService } from '../../snapshots/index.js';

export interface RefreshServiceDeps {
  /** The deduped watched-listing set, owned by the instruments service. */
  watchSet: WatchSet;
  fundamentals: FundamentalsService;
  logger: Logger;
  chunkSize?: number;
}

/**
 * Runs the periodic fundamentals refresh over the shared watch set. The snapshot
 * service applies its own freshness gate, so a frequent cycle only fetches
 * instruments actually due.
 */
export class RefreshService {
  private readonly chunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.chunkSize = deps.chunkSize ?? 25;
  }

  /** One refresh cycle: refresh fundamentals for all watched listings. */
  async runCycle(): Promise<void> {
    const listingIds = this.deps.watchSet.listActiveListingIds();
    for (const chunk of chunked(listingIds, this.chunkSize)) {
      try {
        await this.deps.fundamentals.refreshListings(chunk);
      } catch (err) {
        this.deps.logger.warn(
          { err, error_code: 'fundamentals_refresh_chunk_failed' },
          'Fundamentals refresh chunk failed',
        );
      }
    }
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
