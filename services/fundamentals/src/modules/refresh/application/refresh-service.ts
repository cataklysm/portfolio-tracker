import type { Logger } from '@portfolio/platform';
import type { FundamentalsService } from '../../snapshots/index.js';

/** Source of the listing set to refresh — the active catalog from instruments. */
export interface ListingSource {
  listActiveListingIds(): Promise<string[]>;
}

export interface RefreshServiceDeps {
  /** The active-listing set, fetched from the instruments service each cycle. */
  listings: ListingSource;
  fundamentals: FundamentalsService;
  logger: Logger;
  chunkSize?: number;
}

/**
 * Runs the periodic fundamentals refresh over the whole active catalog. The
 * snapshot service applies its own freshness gate, so a frequent cycle only
 * fetches instruments actually due.
 */
export class RefreshService {
  private readonly chunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.chunkSize = deps.chunkSize ?? 25;
  }

  /** One refresh cycle: refresh fundamentals for every active listing. */
  async runCycle(): Promise<void> {
    const listingIds = await this.deps.listings.listActiveListingIds();
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
