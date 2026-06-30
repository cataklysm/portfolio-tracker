import { deriveFreshness, type FreshnessStatus } from '../domain/freshness.js';
import { selectPointsToStore } from '../domain/downsample.js';
import type {
  DailyClose,
  PlanListing,
  PriceRanges,
  ProviderQuote,
  QuoteProvider,
  QuoteRepository,
  QuoteEventStore,
  RefreshPlanResolver,
} from './ports.js';

/** Per-provider cadence for the scheduled quote sweep, from capability-refresh config. */
export interface QuoteRefreshOptions {
  /** Skip a listing whose newest stored quote is younger than this. */
  refreshIntervalMs?: number;
  /** Downsample the intraday series to one stored point per this span (quotes only). */
  saveResolutionMs?: number | null;
  /**
   * Cap on listings refreshed this call (per-provider per-cycle budget). The
   * stalest are chosen first, so successive cycles rotate fairly through all
   * listings without starving any — for rate-constrained providers.
   */
  maxPerCycle?: number | null;
}

export interface QuoteView {
  listing_id: string;
  latest: string | null;
  previous: string | null;
  currency: string | null;
  latest_at: string | null;
  retrieved_at: string | null;
  freshness_status: FreshnessStatus;
  /** The provider that supplied the latest tick (attribution); null if no quote. */
  provider: string | null;
  /** The provider's own timestamp for the latest tick (ISO), when supplied. */
  provider_timestamp: string | null;
}

export interface QuoteServiceDeps {
  repo: QuoteRepository;
  provider: QuoteProvider;
  events?: QuoteEventStore;
  /** Resolves which provider + provider symbol serves the `quotes` capability per listing. */
  planResolver: RefreshPlanResolver;
  staleAfterMs: number;
}

/**
 * Serves normalized quotes from stored data (never calling a provider during a
 * read) and refreshes a listing's quote from the provider on demand or on a
 * schedule. The provider that serves each listing is resolved per instrument
 * (the refresh plan), so a stored quote is always tagged with the provider it
 * actually came from. Every read carries a freshness status.
 */
export class QuoteService {
  constructor(private readonly deps: QuoteServiceDeps) {}

  async getLatestQuotes(listingIds: string[]): Promise<QuoteView[]> {
    if (listingIds.length === 0) return [];
    const pairs = await this.deps.repo.getLatestPairs(listingIds);
    const now = new Date();
    return listingIds.map((listingId) => {
      const pair = pairs.get(listingId);
      return {
        listing_id: listingId,
        latest: pair?.latest ?? null,
        previous: pair?.previous ?? null,
        currency: pair?.currency ?? null,
        latest_at: pair?.latestAt ? pair.latestAt.toISOString() : null,
        retrieved_at: pair?.retrievedAt ? pair.retrievedAt.toISOString() : null,
        freshness_status: deriveFreshness(pair?.latestAt ?? null, now, this.deps.staleAfterMs),
        provider: pair?.provider ?? null,
        provider_timestamp: pair?.providerTimestamp ? pair.providerTimestamp.toISOString() : null,
      };
    });
  }

  getSeries(listingId: string, limit: number): Promise<{ time: Date; price: string; volume: string | null }[]> {
    return this.deps.repo.getSeries(listingId, limit);
  }

  /** Daily closing prices over `[from, to]` for historical reporting. */
  getDailyHistory(listingId: string, from: string, to: string): Promise<DailyClose[]> {
    return this.deps.repo.getDailyCloseSeries(listingId, from, to);
  }

  /**
   * Daily/weekly/monthly/yearly price extremes (high/low) for a listing, from
   * stored quotes. `yearly` is the 52-week range. Serves stored data only.
   */
  getPriceRanges(listingId: string): Promise<PriceRanges> {
    return this.deps.repo.getPriceRanges(listingId);
  }

  /**
   * Refreshes specific listings from their selected providers, fetching a daily
   * series per listing (one provider request each). Used for on-demand refresh
   * and series backfill. `from` starts the daily history at that date (e.g. a
   * position's first transaction). Listings with no selected provider or no
   * provider symbol are skipped. Returns the count actually stored.
   */
  async refreshListings(listingIds: string[], from?: Date): Promise<number> {
    if (listingIds.length === 0) return 0;
    const plan = await this.deps.planResolver.resolve('quotes', listingIds);
    let stored = 0;
    const updatedByProvider = new Map<string, string[]>();
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
      const quote = await this.deps.provider.fetchQuote(entry.provider, entry.providerSymbol, from);
      if (!quote) continue;
      const wrote = await this.store(entry.listingId, entry.currency, entry.provider, quote);
      stored += 1;
      if (wrote) {
        const ids = updatedByProvider.get(entry.provider) ?? [];
        ids.push(entry.listingId);
        updatedByProvider.set(entry.provider, ids);
      }
    }
    await this.publishQuoteUpdates(updatedByProvider);
    return stored;
  }

  /**
   * Refreshes the latest tick for a group of listings that all use the same
   * provider, in batched provider requests of at most `batchSize` (a single-symbol
   * provider passes batchSize 1, so each symbol is its own request). Used by the
   * scheduler. With `opts.refreshIntervalMs`, listings whose newest stored quote is
   * still younger than the interval are skipped (a per-listing freshness gate that
   * absorbs poll jitter). With `opts.saveResolutionMs`, a provider's intraday series
   * is downsampled to one stored point per that span, continuing from the last
   * saved point. Returns the count actually fetched + stored.
   */
  async refreshLatestBatched(
    provider: string,
    entries: PlanListing[],
    batchSize: number,
    opts: QuoteRefreshOptions = {},
  ): Promise<number> {
    const fetchable = entries.filter((e) => e.providerSymbol);
    if (fetchable.length === 0) return 0;

    // The newest stored time per listing serves two purposes: the freshness gate
    // (is it due?) and the downsample baseline (spacing continues from it).
    const needPairs = (opts.refreshIntervalMs ?? 0) > 0 || (opts.saveResolutionMs ?? 0) > 0;
    const lastSavedByListing = new Map<string, number | null>();
    let due = fetchable;
    if (needPairs) {
      const pairs = await this.deps.repo.getLatestPairs(fetchable.map((e) => e.listingId));
      const now = Date.now();
      const interval = opts.refreshIntervalMs ?? 0;
      due = [];
      for (const entry of fetchable) {
        const at = pairs.get(entry.listingId)?.latestAt ?? null;
        lastSavedByListing.set(entry.listingId, at ? at.getTime() : null);
        if (interval <= 0 || at === null || now - at.getTime() >= interval) due.push(entry);
      }
    }

    // Per-cycle budget: refresh the stalest first and cap the count, so a
    // rate-constrained provider rotates fairly across cycles without starving the
    // tail. Never-fetched (null) listings sort oldest.
    const maxPerCycle = opts.maxPerCycle ?? null;
    if (maxPerCycle && maxPerCycle > 0 && due.length > maxPerCycle) {
      due = [...due]
        .sort((a, b) => (lastSavedByListing.get(a.listingId) ?? -Infinity) - (lastSavedByListing.get(b.listingId) ?? -Infinity))
        .slice(0, maxPerCycle);
    }
    if (due.length === 0) return 0;

    const size = batchSize > 0 ? batchSize : 1;
    let stored = 0;
    const updatedByProvider = new Map<string, string[]>();
    for (const chunk of chunked(due, size)) {
      const symbols = [...new Set(chunk.map((e) => e.providerSymbol as string))];
      const quotes = await this.deps.provider.fetchQuotes(provider, symbols);
      for (const entry of chunk) {
        const quote = quotes.get(entry.providerSymbol as string);
        if (!quote) continue;
        const wrote = await this.store(entry.listingId, entry.currency, provider, quote, {
          saveResolutionMs: opts.saveResolutionMs ?? null,
          lastSavedMs: lastSavedByListing.get(entry.listingId) ?? null,
        });
        stored += 1;
        if (wrote) {
          const ids = updatedByProvider.get(provider) ?? [];
          ids.push(entry.listingId);
          updatedByProvider.set(provider, ids);
        }
      }
    }
    await this.publishQuoteUpdates(updatedByProvider);
    return stored;
  }

  /**
   * Purges the stored price history for the given listings and rebuilds it from
   * each listing's currently-selected provider over `[from, today]`. Used when an
   * admin switches the quotes/chart provider, so the series never mixes prices
   * from two sources. `from` should be the instrument's first-acquisition date.
   *
   * The daily rebuild only restores one close per day (the provider's `chart`
   * series). With `includeIntraday`, the current session's full minute series is
   * additionally pulled and stored, so today's intraday resolution is restored in
   * one shot instead of waiting for the live sweep to re-accumulate it.
   */
  async purgeAndRebuild(
    listingIds: string[],
    from?: Date,
    opts?: { includeIntraday?: boolean },
  ): Promise<{ purged: number; rebuilt: number; intraday: number }> {
    if (listingIds.length === 0) return { purged: 0, rebuilt: 0, intraday: 0 };
    const purged = await this.deps.repo.purgeListings(listingIds);
    const rebuilt = await this.refreshListings(listingIds, from);
    const intraday = opts?.includeIntraday ? await this.rebuildIntraday(listingIds) : 0;
    return { purged, rebuilt, intraday };
  }

  /**
   * Re-fetches and stores the current intraday session at full resolution for the
   * given listings, from each listing's selected `quotes` provider. Only providers
   * with an intraday feed return a series (e.g. lstc); latest-only providers
   * (Yahoo's batch endpoint) return none and are skipped. Unlike the scheduled
   * sweep this does not downsample — a rebuild wants the whole session. The feed
   * only covers the current session, so it cannot restore past days' intraday.
   * Returns the count of listings stored.
   */
  async rebuildIntraday(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    let stored = 0;
    const updated = await this.forEachIntradayQuote(listingIds, async (entry, provider, quote) => {
      await this.store(entry.listingId, entry.currency, provider, quote);
      stored += 1;
    });
    await this.publishQuoteUpdates(updated);
    return stored;
  }

  /**
   * Replaces just the current intraday session: for each listing, deletes stored
   * quotes from the freshly fetched session's first (already-normalized) timestamp
   * onward, then stores the fresh series. The boundary is derived from the data
   * itself, so it is timezone-free and leaves all prior days' history intact. The
   * targeted alternative to a full purgeAndRebuild when only today's intraday data
   * is wrong. Returns purged-row and stored-listing counts.
   */
  async purgeAndRebuildIntraday(listingIds: string[]): Promise<{ purged: number; intraday: number }> {
    if (listingIds.length === 0) return { purged: 0, intraday: 0 };
    let purged = 0;
    let stored = 0;
    const updated = await this.forEachIntradayQuote(listingIds, async (entry, provider, quote) => {
      const since = new Date(quote.series.reduce((min, p) => Math.min(min, p.timeMs), Infinity));
      purged += await this.deps.repo.purgeListingsSince([entry.listingId], since);
      await this.store(entry.listingId, entry.currency, provider, quote);
      stored += 1;
    });
    await this.publishQuoteUpdates(updated);
    return { purged, intraday: stored };
  }

  /**
   * Resolves the `quotes` plan for the listings, fetches each provider's intraday
   * quotes in one call, and invokes `handle` for every listing whose provider
   * returned a non-empty intraday series. Returns the listings touched, grouped by
   * provider, for event publication.
   */
  private async forEachIntradayQuote(
    listingIds: string[],
    handle: (entry: PlanListing, provider: string, quote: ProviderQuote) => Promise<void>,
  ): Promise<Map<string, string[]>> {
    const plan = await this.deps.planResolver.resolve('quotes', listingIds);
    const byProvider = new Map<string, PlanListing[]>();
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
      const list = byProvider.get(entry.provider) ?? [];
      list.push(entry);
      byProvider.set(entry.provider, list);
    }

    const updatedByProvider = new Map<string, string[]>();
    for (const [provider, entries] of byProvider) {
      const symbols = [...new Set(entries.map((e) => e.providerSymbol as string))];
      const quotes = await this.deps.provider.fetchQuotes(provider, symbols);
      for (const entry of entries) {
        const quote = quotes.get(entry.providerSymbol as string);
        // Only listings whose provider actually returned an intraday series.
        if (!quote || quote.series.length === 0) continue;
        await handle(entry, provider, quote);
        const ids = updatedByProvider.get(provider) ?? [];
        ids.push(entry.listingId);
        updatedByProvider.set(provider, ids);
      }
    }
    return updatedByProvider;
  }

  /** Deletes the stored price history for the given listings without refetching. */
  purgeListings(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return Promise.resolve(0);
    return this.deps.repo.purgeListings(listingIds);
  }

  /**
   * Persists a fetched quote. `sampling` is set only on the scheduled sweep: when
   * the provider returned an intraday series it is downsampled to the configured
   * resolution (continuing from the last saved point) and the separate latest-tick
   * write is skipped — the series already carries the freshest point, and writing
   * the raw latest on top would reintroduce a sub-resolution tick. On-demand
   * refresh / backfill (no `sampling`) keeps the old behavior: store every series
   * point plus the latest tick.
   */
  private async store(
    listingId: string,
    listingCurrency: string,
    provider: string,
    quote: ProviderQuote,
    sampling?: { saveResolutionMs: number | null; lastSavedMs: number | null },
  ): Promise<boolean> {
    const currency = quote.currency ?? listingCurrency;
    const providerTimestamp = quote.timestampMs ? new Date(quote.timestampMs) : null;
    const now = new Date();
    const hasSeries = quote.series.length > 0;
    let wrote = false;

    // Store the historical series points (idempotent on listing_id+time+provider).
    const points =
      sampling && hasSeries
        ? selectPointsToStore(quote.series, sampling.lastSavedMs, sampling.saveResolutionMs)
        : quote.series;
    for (const point of points) {
      await this.deps.repo.upsertQuote({
        listingId,
        time: new Date(point.timeMs),
        provider,
        price: point.close,
        volume: point.volume,
        currency,
        providerTimestamp,
      });
      wrote = true;
    }
    // Store the latest tick at the provider timestamp (or now) — except on the
    // scheduled sweep when a downsampled series already provided the tail point.
    if (!(sampling && hasSeries)) {
      await this.deps.repo.upsertQuote({
        listingId,
        time: providerTimestamp ?? now,
        provider,
        price: quote.price,
        // The latest tick is the regular-market price; its volume is not part of
        // the bar series, so it is stored without a volume.
        volume: null,
        currency,
        providerTimestamp,
      });
      wrote = true;
    }
    return wrote;
  }

  private async publishQuoteUpdates(updatedByProvider: Map<string, string[]>): Promise<void> {
    if (!this.deps.events) return;
    const asOf = new Date().toISOString();
    for (const [provider, listingIds] of updatedByProvider) {
      const uniqueListingIds = [...new Set(listingIds)];
      if (uniqueListingIds.length === 0) continue;
      await this.deps.events.enqueueQuotesUpdated({ provider, listingIds: uniqueListingIds, asOf });
    }
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
