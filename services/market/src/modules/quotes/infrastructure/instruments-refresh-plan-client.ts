import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';
import type { MarketStatus, PlanListing, RefreshPlanResolver } from '../application/ports.js';

interface PlanResponseEntry {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider: string | null;
  provider_identifier: string | null;
  market_status?: MarketStatus;
  minutes_since_close?: number | null;
}

/**
 * Fetches a capability's refresh plan from the instruments service — every active
 * listing resolved to its selected provider (per its instrument) and that
 * provider's symbol. Replaces the watch-set as the source of "what to refresh":
 * the sweep now covers the whole catalog, not just held/watched listings.
 *
 * Internal-only endpoint (network/gateway restricted). Degrades to an empty plan
 * on any transport error so a provider/instruments outage never throws into the
 * refresh cycle.
 */
export class InstrumentsRefreshPlanClient implements RefreshPlanResolver {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 5000,
  ) {}

  async resolve(capability: string, listingIds?: string[]): Promise<PlanListing[]> {
    const url = new URL('/internal/refresh-plan', this.baseUrl);
    url.searchParams.set('capability', capability);
    if (listingIds && listingIds.length > 0) url.searchParams.set('ids', listingIds.join(','));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'x-api-version': String(CURRENT_API_VERSION) },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, capability, error_code: 'instruments_plan_failed' },
          'Refresh-plan fetch failed',
        );
        return [];
      }
      const body = (await response.json()) as { entries: PlanResponseEntry[] };
      return (body.entries ?? []).map((e) => ({
        listingId: e.listing_id,
        instrumentId: e.instrument_id,
        symbol: e.symbol,
        currency: e.currency,
        provider: e.provider ?? null,
        providerSymbol: e.provider_identifier ?? null,
        marketStatus: e.market_status,
        minutesSinceClose: e.minutes_since_close ?? null,
      }));
    } catch (err) {
      this.logger.warn({ err, capability, error_code: 'instruments_unavailable' }, 'Refresh-plan error');
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
