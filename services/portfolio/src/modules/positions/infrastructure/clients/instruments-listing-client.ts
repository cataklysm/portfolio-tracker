import { AppError, CURRENT_API_VERSION } from '@portfolio/platform';
import type { ListingReader, ListingSummary } from '../../application/ports.js';

interface ListingResponseItem {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  name: string;
  asset_type: 'equity' | 'crypto';
  currency: string;
}

/**
 * Resolves listing summaries from the instruments service over HTTP. This is
 * the proper cross-service read: portfolio owns no instrument data and reaches
 * it only through this versioned contract. The caller's access token is
 * propagated so the instruments service enforces the `instruments:read` scope.
 */
export class InstrumentsListingClient implements ListingReader {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 3000,
  ) {}

  async getListings(listingIds: string[], bearerToken: string): Promise<Map<string, ListingSummary>> {
    const map = new Map<string, ListingSummary>();
    if (listingIds.length === 0) return map;

    const url = new URL('/listings', this.baseUrl);
    url.searchParams.set('ids', listingIds.join(','));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'x-api-version': String(CURRENT_API_VERSION),
          accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err) {
      throw new AppError({
        status: 502,
        code: 'instruments_unavailable',
        title: 'Bad Gateway',
        detail: 'The instruments service is unavailable',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AppError({
        status: 502,
        code: 'instruments_error',
        title: 'Bad Gateway',
        detail: `Instruments service returned status ${response.status}`,
      });
    }

    const items = (await response.json()) as ListingResponseItem[];
    for (const item of items) {
      map.set(item.listing_id, {
        listing_id: item.listing_id,
        instrument_id: item.instrument_id,
        symbol: item.symbol,
        name: item.name,
        asset_type: item.asset_type,
        currency: item.currency,
      });
    }
    return map;
  }
}
