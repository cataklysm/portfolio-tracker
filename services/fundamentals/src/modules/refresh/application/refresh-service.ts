import type { Logger } from '@portfolio/platform';
import type { FundamentalsService, RefreshGate } from '../../snapshots/index.js';
import type { ProvidersClient } from '../../../platform/providers/providers-client.js';

/** Source of the listing set to refresh — the active catalog from instruments. */
export interface ListingSource {
  listActiveListingIds(): Promise<string[]>;
}

export interface RefreshServiceDeps {
  /** The active-listing set, fetched from the instruments service each cycle. */
  listings: ListingSource;
  fundamentals: FundamentalsService;
  /** Source of the per-(provider × capability) refresh cadence; read each cycle. */
  providers: Pick<ProvidersClient, 'fetchCapabilityRefresh'>;
  logger: Logger;
  chunkSize?: number;
}

/**
 * Runs the periodic fundamentals refresh over the whole active catalog on a short
 * heartbeat. The snapshot service applies a per-provider freshness gate (from the
 * admin-configured `fundamentals` cadence, read live each cycle), so a frequent
 * heartbeat only fetches instruments actually due.
 */
export class RefreshService {
  private readonly chunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.chunkSize = deps.chunkSize ?? 25;
  }

  /** One heartbeat: refresh fundamentals for every active listing that's due. */
  async runCycle(): Promise<void> {
    const gate = await this.loadGate();
    const listingIds = await this.deps.listings.listActiveListingIds();
    for (const chunk of chunked(listingIds, this.chunkSize)) {
      try {
        await this.deps.fundamentals.refreshListings(chunk, false, gate);
      } catch (err) {
        this.deps.logger.warn(
          { err, error_code: 'fundamentals_refresh_chunk_failed' },
          'Fundamentals refresh chunk failed',
        );
      }
    }
  }

  /** Per-provider cadence for the `fundamentals` capability (interval + disabled set). */
  private async loadGate(): Promise<RefreshGate> {
    const intervalByProvider = new Map<string, number>();
    const disabledProviders = new Set<string>();
    try {
      for (const row of await this.deps.providers.fetchCapabilityRefresh()) {
        if (row.capability !== 'fundamentals') continue;
        if (row.enabled) intervalByProvider.set(row.provider, row.refreshIntervalMs);
        else disabledProviders.add(row.provider);
      }
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'capability_refresh_failed' }, 'Capability-refresh fetch failed');
    }
    return { intervalByProvider, disabledProviders };
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
