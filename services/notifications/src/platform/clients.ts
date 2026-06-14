import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';

/**
 * HTTP clients to other services' internal endpoints. The notifications
 * evaluator is a background worker with no user token, so it reads through the
 * `/internal/*` endpoints (network/gateway restricted). All clients degrade
 * gracefully: a transport error or non-2xx logs and yields the empty result so
 * one upstream outage never aborts an evaluation cycle.
 */

async function getJson<T>(url: URL, logger: Logger, timeoutMs = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'x-api-version': String(CURRENT_API_VERSION) },
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({ url: url.pathname, status: response.status, error_code: 'internal_request_failed' }, 'Internal request failed');
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    logger.warn({ err, url: url.pathname, error_code: 'internal_unavailable' }, 'Internal service unavailable');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface ResolvedListing {
  instrumentId: string;
  currency: string;
  symbol: string;
}

interface ResolveItem {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider_identifier: string | null;
}

/** listing -> instrument mapping. Unlike market's resolver, keeps every listing
 * (we need instrument_id even for listings without a provider symbol). */
export class ListingResolverClient {
  constructor(private readonly baseUrl: string, private readonly logger: Logger) {}

  async resolve(listingIds: string[]): Promise<Map<string, ResolvedListing>> {
    const out = new Map<string, ResolvedListing>();
    if (listingIds.length === 0) return out;
    const url = new URL('/internal/listings/resolve', this.baseUrl);
    url.searchParams.set('provider', 'yahoo');
    url.searchParams.set('ids', listingIds.join(','));
    const items = await getJson<ResolveItem[]>(url, this.logger);
    for (const item of items ?? []) {
      out.set(item.listing_id, {
        instrumentId: item.instrument_id,
        currency: item.currency,
        symbol: item.symbol,
      });
    }
    return out;
  }
}

export interface LatestQuote {
  latest: number | null;
  previous: number | null;
  currency: string | null;
}

interface QuoteView {
  listing_id: string;
  latest: string | null;
  previous: string | null;
  currency: string | null;
}

export class MarketQuotesClient {
  constructor(private readonly baseUrl: string, private readonly logger: Logger) {}

  async fetchQuotes(listingIds: string[]): Promise<Map<string, LatestQuote>> {
    const out = new Map<string, LatestQuote>();
    if (listingIds.length === 0) return out;
    const url = new URL('/internal/quotes', this.baseUrl);
    url.searchParams.set('listing_ids', listingIds.join(','));
    const views = await getJson<QuoteView[]>(url, this.logger);
    for (const v of views ?? []) {
      out.set(v.listing_id, {
        latest: toNum(v.latest),
        previous: toNum(v.previous),
        currency: v.currency,
      });
    }
    return out;
  }
}

export class EventsEarningsClient {
  constructor(private readonly baseUrl: string, private readonly logger: Logger) {}

  async fetchUpcoming(instrumentIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (instrumentIds.length === 0) return out;
    const url = new URL('/internal/earnings', this.baseUrl);
    url.searchParams.set('instrument_ids', instrumentIds.join(','));
    const rows = await getJson<{ instrument_id: string; report_date: string }[]>(url, this.logger);
    for (const r of rows ?? []) out.set(r.instrument_id, r.report_date);
    return out;
  }
}

export interface OwnTarget {
  id: string;
  instrumentId: string;
  zoneLow: number | null;
  zoneHigh: number | null;
  currency: string;
}

interface PriceTargetRow {
  id: string;
  instrument_id: string;
  zone_low: string | null;
  zone_high: string | null;
  currency: string;
}

export class InsightsTargetsClient {
  constructor(private readonly baseUrl: string, private readonly logger: Logger) {}

  /** A user's own target zones for the given instruments, grouped by instrument. */
  async fetchOwnTargets(userId: string, instrumentIds: string[]): Promise<Map<string, OwnTarget[]>> {
    const out = new Map<string, OwnTarget[]>();
    if (instrumentIds.length === 0) return out;
    const url = new URL('/internal/price-targets', this.baseUrl);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('instrument_ids', instrumentIds.join(','));
    const rows = await getJson<PriceTargetRow[]>(url, this.logger);
    for (const r of rows ?? []) {
      const target: OwnTarget = {
        id: r.id,
        instrumentId: r.instrument_id,
        zoneLow: toNum(r.zone_low),
        zoneHigh: toNum(r.zone_high),
        currency: r.currency,
      };
      const list = out.get(r.instrument_id) ?? [];
      list.push(target);
      out.set(r.instrument_id, list);
    }
    return out;
  }
}

interface PositionCostRow {
  listing_id: string;
  avg_cost: string;
}

/** Per-user open-position average cost (native currency) by listing, for the
 * cost-basis alert. Reads portfolio's internal endpoint (no user token). */
export class PortfolioPositionsClient {
  constructor(private readonly baseUrl: string, private readonly logger: Logger) {}

  async fetchCostBases(userId: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const url = new URL('/internal/positions', this.baseUrl);
    url.searchParams.set('user_id', userId);
    const rows = await getJson<PositionCostRow[]>(url, this.logger);
    for (const r of rows ?? []) {
      const cost = toNum(r.avg_cost);
      if (cost !== null && cost > 0) out.set(r.listing_id, cost);
    }
    return out;
  }
}

function toNum(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
