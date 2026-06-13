import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';
import type { ListingResolver, ResolvedListing } from '../application/ports.js';

interface ResolveResponseItem {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider_identifier: string | null;
}

/**
 * Resolves listing -> instrument + provider symbol via the instruments service's
 * internal resolve endpoint. Used by the background refresh cycle (no user
 * token); the endpoint is internal-only and must be network/gateway restricted.
 * Listings without an explicit provider symbol are skipped — fundamentals are
 * fetched only once a correct provider symbol exists, never guessed.
 */
export class InstrumentsListingResolver implements ListingResolver {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 3000,
  ) {}

  async resolve(listingIds: string[], provider: string): Promise<Map<string, ResolvedListing>> {
    const map = new Map<string, ResolvedListing>();
    if (listingIds.length === 0) return map;

    const url = new URL('/internal/listings/resolve', this.baseUrl);
    url.searchParams.set('provider', provider);
    url.searchParams.set('ids', listingIds.join(','));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'x-api-version': String(CURRENT_API_VERSION) },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, error_code: 'instruments_resolve_failed' },
          'Listing resolve failed',
        );
        return map;
      }
      const items = (await response.json()) as ResolveResponseItem[];
      for (const item of items) {
        if (!item.provider_identifier) continue; // no provider symbol → skip
        map.set(item.listing_id, {
          listingId: item.listing_id,
          instrumentId: item.instrument_id,
          symbol: item.symbol,
          currency: item.currency,
          providerSymbol: item.provider_identifier,
        });
      }
    } catch (err) {
      this.logger.warn({ err, error_code: 'instruments_unavailable' }, 'Instruments resolve error');
    } finally {
      clearTimeout(timer);
    }
    return map;
  }
}
