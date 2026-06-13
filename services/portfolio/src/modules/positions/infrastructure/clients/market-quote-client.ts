import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';
import type { QuotePair, QuoteReader } from '../../application/ports.js';

interface QuoteResponseItem {
  listing_id: string;
  latest: string | null;
  previous: string | null;
  latest_at: string | null;
  freshness_status: string | null;
}

interface SeriesResponseItem {
  time: string;
  price: string;
}

/**
 * Reads normalized quotes from the market service over HTTP. Market serves
 * stored data only, so this never blocks on an external provider. On a market
 * outage the methods degrade to empty results and the frontend shows quotes as
 * unavailable rather than failing the whole position read.
 */
export class MarketQuoteClient implements QuoteReader {
  constructor(
    private readonly baseUrl: string,
    private readonly logger?: Logger,
    private readonly timeoutMs = 3000,
  ) {}

  async getLatestPair(listingIds: string[], bearerToken: string): Promise<Map<string, QuotePair>> {
    const map = new Map<string, QuotePair>();
    if (listingIds.length === 0) return map;
    const url = new URL('/quotes', this.baseUrl);
    url.searchParams.set('listing_ids', listingIds.join(','));
    const items = await this.getJson<QuoteResponseItem[]>(url, bearerToken);
    if (!items) return map;
    for (const item of items) {
      map.set(item.listing_id, {
        latest: item.latest,
        previous: item.previous,
        latestAt: item.latest_at ? new Date(item.latest_at) : null,
        freshness: item.freshness_status,
      });
    }
    return map;
  }

  async getSeries(listingId: string, limit: number, bearerToken: string): Promise<{ time: Date; price: string }[]> {
    const url = new URL(`/quotes/${listingId}/series`, this.baseUrl);
    url.searchParams.set('limit', String(limit));
    const items = await this.getJson<SeriesResponseItem[]>(url, bearerToken);
    if (!items) return [];
    return items.map((item) => ({ time: new Date(item.time), price: item.price }));
  }

  private async getJson<T>(url: URL, bearerToken: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'x-api-version': String(CURRENT_API_VERSION),
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger?.warn(
          { url: url.toString(), status: response.status, error_code: 'market_quote_read_failed' },
          'Market quote read returned non-OK; quotes will be unavailable',
        );
        return null;
      }
      return (await response.json()) as T;
    } catch (err) {
      this.logger?.warn(
        { err, url: url.toString(), error_code: 'market_quote_unreachable' },
        'Market quote read failed; quotes will be unavailable',
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
