import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';
import type { ListingSource } from '../application/refresh-service.js';

interface ListingsResponse {
  listings: { listing_id: string }[];
}

/**
 * Fetches the active-listing set from the instruments service's
 * `/internal/listings/all`. Replaces the former watch-set hydration: the
 * fundamentals refresh now sweeps the whole catalog, not just held/watched
 * instruments (the snapshot service's freshness gate still bounds actual fetches).
 *
 * Internal-only endpoint (network/gateway restricted). Degrades to an empty list
 * on any transport error so an instruments outage never throws into the cycle.
 */
export class InstrumentsListingsClient implements ListingSource {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 5000,
  ) {}

  async listActiveListingIds(): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL('/internal/listings/all', this.baseUrl), {
        headers: { accept: 'application/json', 'x-api-version': String(CURRENT_API_VERSION) },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, error_code: 'instruments_listings_failed' },
          'All-listings fetch failed',
        );
        return [];
      }
      const body = (await response.json()) as ListingsResponse;
      return (body.listings ?? []).map((l) => l.listing_id);
    } catch (err) {
      this.logger.warn({ err, error_code: 'instruments_unavailable' }, 'All-listings error');
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
