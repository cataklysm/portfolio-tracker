import type { Logger } from '@portfolio/platform';
import type { PlanListing, QuoteService, RefreshPlanResolver } from '../../quotes/index.js';
import type { FxService } from '../../fx/index.js';
import type { AnalystService } from '../../analyst/index.js';
import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { RefreshStateRepository } from './ports.js';

export interface RefreshServiceDeps {
  /** Resolves the `quotes` refresh plan: every active listing → selected provider + symbol. */
  planResolver: RefreshPlanResolver;
  /** Source of per-provider pacing (batch size); read each cycle. */
  providers: Pick<ProvidersClient, 'fetchProviderSettings'>;
  refreshState: RefreshStateRepository;
  quotes: Pick<QuoteService, 'refreshLatestBatched'>;
  fx: Pick<FxService, 'refreshDaily'>;
  analyst?: Pick<AnalystService, 'refreshForListings'>;
  logger: Logger;
  intervalMs: number;
  /** Batch size used when a provider has no configured `max_batch_size`. */
  defaultBatchSize?: number;
  /** Listings per analyst refresh chunk. */
  analystChunkSize?: number;
}

/**
 * Runs the consolidated refresh cycle over the **whole active catalog** (every
 * listing, not just held/watched ones). Quotes are grouped by each listing's
 * selected provider and fetched in batches sized to that provider's
 * `max_batch_size` (a single-symbol provider gets batch size 1, so each symbol is
 * its own request — naturally throttled as chunks run sequentially). Each stored
 * quote is tagged with the provider it came from.
 */
export class RefreshService {
  private readonly defaultBatchSize: number;
  private readonly analystChunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.defaultBatchSize = deps.defaultBatchSize ?? 25;
    this.analystChunkSize = deps.analystChunkSize ?? 25;
  }

  /** One refresh cycle: FX, then quotes for the whole catalog (per provider), then analyst. */
  async runCycle(): Promise<void> {
    try {
      await this.deps.fx.refreshDaily();
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'fx_refresh_failed' }, 'FX refresh failed');
    }

    const plan = await this.deps.planResolver.resolve('quotes');
    const batchSizes = await this.loadBatchSizes();
    const nextDue = new Date(Date.now() + this.deps.intervalMs);

    // Group fetchable listings by their selected provider, skipping any whose
    // exchange is currently closed — no point re-fetching an unchanging price on a
    // weekend/holiday/overnight. `open` and `unknown` (crypto / exchange-less /
    // no configured hours) are always refreshed. On-demand refresh is unaffected;
    // it goes through QuoteService.refreshListings, which ignores market status.
    const byProvider = new Map<string, PlanListing[]>();
    let skippedClosed = 0;
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
      if (!isMarketRefreshable(entry.marketStatus)) {
        skippedClosed += 1;
        continue;
      }
      const list = byProvider.get(entry.provider) ?? [];
      list.push(entry);
      byProvider.set(entry.provider, list);
    }
    if (skippedClosed > 0) {
      this.deps.logger.debug({ skipped_closed: skippedClosed }, 'Skipped listings on closed exchanges');
    }

    for (const [provider, entries] of byProvider) {
      const batchSize = batchSizes.get(provider) ?? this.defaultBatchSize;
      try {
        await this.deps.quotes.refreshLatestBatched(provider, entries, batchSize);
        await this.deps.refreshState.recordRefresh(
          entries.map((e) => e.listingId),
          provider,
          nextDue,
        );
      } catch (err) {
        this.deps.logger.warn(
          { err, provider, error_code: 'quote_refresh_failed' },
          'Quote refresh failed for provider',
        );
      }
    }

    if (this.deps.analyst) {
      const listingIds = plan.map((e) => e.listingId);
      for (const chunk of chunked(listingIds, this.analystChunkSize)) {
        try {
          await this.deps.analyst.refreshForListings(chunk);
        } catch (err) {
          this.deps.logger.warn({ err, error_code: 'analyst_refresh_failed' }, 'Analyst refresh chunk failed');
        }
      }
    }
  }

  /** Per-provider effective batch size: configured `max_batch_size`, else 1 (single-symbol). */
  private async loadBatchSizes(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      for (const s of await this.deps.providers.fetchProviderSettings()) {
        map.set(s.provider, s.maxBatchSize ?? 1);
      }
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'provider_settings_failed' }, 'Provider settings fetch failed');
    }
    return map;
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/**
 * Whether a listing should be refreshed in the scheduled sweep given its market
 * status. Refresh when the market is `open`, or when status is `unknown`/absent
 * (crypto, exchange-less listings, or exchanges with no configured hours — we
 * can't prove they're closed, so we don't skip). Skip definitively-closed states
 * (`closed`/`weekend`/`holiday`).
 */
function isMarketRefreshable(status: PlanListing['marketStatus']): boolean {
  return status === undefined || status === 'open' || status === 'unknown';
}
