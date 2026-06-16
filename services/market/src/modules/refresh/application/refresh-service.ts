import type { Logger } from '@portfolio/platform';
import type { PlanListing, QuoteService, RefreshPlanResolver } from '../../quotes/index.js';
import type { FxService } from '../../fx/index.js';
import type { AnalystService } from '../../analyst/index.js';
import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { RefreshStateRepository } from './ports.js';

export interface RefreshServiceDeps {
  /** Resolves a capability's refresh plan: every active listing → selected provider + symbol. */
  planResolver: RefreshPlanResolver;
  /** Provider pacing (batch size) + per-(provider × capability) refresh cadence; read each cycle. */
  providers: Pick<ProvidersClient, 'fetchProviderSettings' | 'fetchCapabilityRefresh'>;
  refreshState: RefreshStateRepository;
  quotes: Pick<QuoteService, 'refreshLatestBatched'>;
  fx: Pick<FxService, 'refreshDaily'>;
  analyst?: Pick<AnalystService, 'refreshForListings'>;
  logger: Logger;
  /** Fallback cadence for a provider/capability with no configured interval. */
  defaultIntervalMs: number;
  /** Batch size used when a provider has no configured `max_batch_size`. */
  defaultBatchSize?: number;
  /** Listings per analyst refresh chunk. */
  analystChunkSize?: number;
}

/** One (provider × capability) cadence, resolved from the providers service. */
interface Cadence {
  refreshIntervalMs: number;
  saveResolutionMs: number | null;
  enabled: boolean;
}

const FX_KEY = 'fx';

/**
 * Drives the consolidated refresh of the **whole active catalog** on a short
 * heartbeat. Cadence is per (provider × capability), read live from the providers
 * service each tick so edits apply without a restart:
 *
 *  - **quotes** use a per-*listing* freshness gate (a listing is fetched only once
 *    its newest stored quote is older than its provider's interval) — this absorbs
 *    poll jitter and lets providers be polled at different rates. The provider's
 *    `save_resolution` then downsamples its intraday series on store.
 *  - **analyst** / **fx** use a per-*provider* time gate (in-memory last-run),
 *    since they are coarse feeds without a per-listing freshness signal.
 *
 * Quotes are grouped by each listing's selected provider and fetched in batches
 * sized to that provider's `max_batch_size`. Listings on a closed exchange are
 * skipped. Each stored quote is tagged with the provider it came from.
 */
export class RefreshService {
  private readonly defaultBatchSize: number;
  private readonly analystChunkSize: number;
  /** Last-run epoch ms per gate key (`fx`, `analyst:<provider>`) for coarse feeds. */
  private readonly lastRun = new Map<string, number>();

  constructor(private readonly deps: RefreshServiceDeps) {
    this.defaultBatchSize = deps.defaultBatchSize ?? 25;
    this.analystChunkSize = deps.analystChunkSize ?? 25;
  }

  /** One heartbeat: refresh whatever is due — FX, quotes (per provider), analyst (per provider). */
  async runCycle(): Promise<void> {
    const cadence = await this.loadCadence();
    const now = Date.now();

    await this.runFx(cadence, now);
    await this.runQuotes(cadence, now);
    await this.runAnalyst(cadence, now);
  }

  private async runFx(cadence: Map<string, Cadence>, now: number): Promise<void> {
    const fx = this.cadenceFor(cadence, FX_KEY);
    if (!fx.enabled || !this.due(FX_KEY, fx.refreshIntervalMs, now)) return;
    try {
      await this.deps.fx.refreshDaily();
      this.lastRun.set(FX_KEY, now);
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'fx_refresh_failed' }, 'FX refresh failed');
    }
  }

  private async runQuotes(cadence: Map<string, Cadence>, now: number): Promise<void> {
    const plan = await this.deps.planResolver.resolve('quotes');
    const batchSizes = await this.loadBatchSizes();

    // Group fetchable listings by their selected provider, skipping any whose
    // exchange is currently closed — no point re-fetching an unchanging price on a
    // weekend/holiday/overnight. `open` and `unknown` (crypto / exchange-less / no
    // configured hours) are always considered. The per-listing freshness gate
    // (inside refreshLatestBatched) then decides which are actually due.
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
      const c = this.cadenceFor(cadence, provider, 'quotes');
      if (!c.enabled) continue;
      const batchSize = batchSizes.get(provider) ?? this.defaultBatchSize;
      try {
        const stored = await this.deps.quotes.refreshLatestBatched(provider, entries, batchSize, {
          refreshIntervalMs: c.refreshIntervalMs,
          saveResolutionMs: c.saveResolutionMs,
        });
        if (stored > 0) {
          await this.deps.refreshState.recordRefresh(
            entries.map((e) => e.listingId),
            provider,
            new Date(now + c.refreshIntervalMs),
          );
        }
      } catch (err) {
        this.deps.logger.warn(
          { err, provider, error_code: 'quote_refresh_failed' },
          'Quote refresh failed for provider',
        );
      }
    }
  }

  private async runAnalyst(cadence: Map<string, Cadence>, now: number): Promise<void> {
    if (!this.deps.analyst) return;
    const plan = await this.deps.planResolver.resolve('analyst');

    // Group by the provider selected for analyst, then gate each provider by its
    // own interval (in-memory last-run). Listings with no analyst provider are
    // still refreshed under a default-keyed group so coverage is unchanged.
    const byProvider = new Map<string, string[]>();
    for (const entry of plan) {
      const key = entry.provider ?? '';
      const list = byProvider.get(key) ?? [];
      list.push(entry.listingId);
      byProvider.set(key, list);
    }

    for (const [provider, listingIds] of byProvider) {
      const c = this.cadenceFor(cadence, provider || undefined, 'analyst');
      const gateKey = `analyst:${provider}`;
      if (!c.enabled || !this.due(gateKey, c.refreshIntervalMs, now)) continue;
      let refreshed = false;
      for (const chunk of chunked(listingIds, this.analystChunkSize)) {
        try {
          await this.deps.analyst.refreshForListings(chunk);
          refreshed = true;
        } catch (err) {
          this.deps.logger.warn({ err, error_code: 'analyst_refresh_failed' }, 'Analyst refresh chunk failed');
        }
      }
      if (refreshed) this.lastRun.set(gateKey, now);
    }
  }

  /** Whether a coarse-feed gate has elapsed its interval since its last run. */
  private due(key: string, intervalMs: number, now: number): boolean {
    const last = this.lastRun.get(key);
    return last === undefined || now - last >= intervalMs;
  }

  /** Cadence for a (provider, capability); falls back to the default interval. */
  private cadenceFor(
    cadence: Map<string, Cadence>,
    provider: string | undefined,
    capability?: string,
  ): Cadence {
    const key = capability ? `${provider}:${capability}` : (provider ?? '');
    return (
      cadence.get(key) ?? { refreshIntervalMs: this.deps.defaultIntervalMs, saveResolutionMs: null, enabled: true }
    );
  }

  /** Loads per-(provider × capability) cadence, keyed `<provider>:<capability>` (fx keyed `fx`). */
  private async loadCadence(): Promise<Map<string, Cadence>> {
    const map = new Map<string, Cadence>();
    try {
      for (const row of await this.deps.providers.fetchCapabilityRefresh()) {
        const value: Cadence = {
          refreshIntervalMs: row.refreshIntervalMs,
          saveResolutionMs: row.saveResolutionMs,
          enabled: row.enabled,
        };
        map.set(`${row.provider}:${row.capability}`, value);
        // FX has a single feed; expose the fastest configured fx cadence under `fx`.
        if (row.capability === 'fx') {
          const existing = map.get(FX_KEY);
          if (!existing || row.refreshIntervalMs < existing.refreshIntervalMs) map.set(FX_KEY, value);
        }
      }
    } catch (err) {
      this.deps.logger.warn({ err, error_code: 'capability_refresh_failed' }, 'Capability-refresh fetch failed');
    }
    return map;
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
