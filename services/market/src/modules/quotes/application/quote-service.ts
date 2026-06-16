import { deriveFreshness, type FreshnessStatus } from '../domain/freshness.js';
import type {
  DailyClose,
  PlanListing,
  ProviderQuote,
  QuoteProvider,
  QuoteRepository,
  RefreshPlanResolver,
} from './ports.js';

export interface QuoteView {
  listing_id: string;
  latest: string | null;
  previous: string | null;
  currency: string | null;
  latest_at: string | null;
  freshness_status: FreshnessStatus;
}

export interface QuoteServiceDeps {
  repo: QuoteRepository;
  provider: QuoteProvider;
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
        freshness_status: deriveFreshness(pair?.latestAt ?? null, now, this.deps.staleAfterMs),
      };
    });
  }

  getSeries(listingId: string, limit: number): Promise<{ time: Date; price: string }[]> {
    return this.deps.repo.getSeries(listingId, limit);
  }

  /** Daily closing prices over `[from, to]` for historical reporting. */
  getDailyHistory(listingId: string, from: string, to: string): Promise<DailyClose[]> {
    return this.deps.repo.getDailyCloseSeries(listingId, from, to);
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
    for (const entry of plan) {
      if (!entry.provider || !entry.providerSymbol) continue;
      const quote = await this.deps.provider.fetchQuote(entry.provider, entry.providerSymbol, from);
      if (!quote) continue;
      await this.store(entry.listingId, entry.currency, entry.provider, quote);
      stored += 1;
    }
    return stored;
  }

  /**
   * Refreshes the latest tick (no series) for a group of listings that all use
   * the same provider, in batched provider requests of at most `batchSize`
   * (a single-symbol provider passes batchSize 1, so each symbol is its own
   * request). Used by the scheduler. Returns the count actually stored.
   */
  async refreshLatestBatched(provider: string, entries: PlanListing[], batchSize: number): Promise<number> {
    const fetchable = entries.filter((e) => e.providerSymbol);
    if (fetchable.length === 0) return 0;
    const size = batchSize > 0 ? batchSize : 1;
    let stored = 0;
    for (const chunk of chunked(fetchable, size)) {
      const symbols = [...new Set(chunk.map((e) => e.providerSymbol as string))];
      const quotes = await this.deps.provider.fetchQuotes(provider, symbols);
      for (const entry of chunk) {
        const quote = quotes.get(entry.providerSymbol as string);
        if (!quote) continue;
        await this.store(entry.listingId, entry.currency, provider, quote);
        stored += 1;
      }
    }
    return stored;
  }

  /**
   * Purges the stored price history for the given listings and rebuilds it from
   * each listing's currently-selected provider over `[from, today]`. Used when an
   * admin switches the quotes/chart provider, so the series never mixes prices
   * from two sources. `from` should be the instrument's first-acquisition date.
   */
  async purgeAndRebuild(listingIds: string[], from?: Date): Promise<{ purged: number; rebuilt: number }> {
    if (listingIds.length === 0) return { purged: 0, rebuilt: 0 };
    const purged = await this.deps.repo.purgeListings(listingIds);
    const rebuilt = await this.refreshListings(listingIds, from);
    return { purged, rebuilt };
  }

  private async store(
    listingId: string,
    listingCurrency: string,
    provider: string,
    quote: ProviderQuote,
  ): Promise<void> {
    const currency = quote.currency ?? listingCurrency;
    const providerTimestamp = quote.timestampMs ? new Date(quote.timestampMs) : null;
    const now = new Date();

    // Store the historical series points (idempotent on listing_id+time+provider).
    for (const point of quote.series) {
      await this.deps.repo.upsertQuote({
        listingId,
        time: new Date(point.timeMs),
        provider,
        price: point.close,
        currency,
        providerTimestamp,
      });
    }
    // Store the latest tick at the provider timestamp (or now).
    await this.deps.repo.upsertQuote({
      listingId,
      time: providerTimestamp ?? now,
      provider,
      price: quote.price,
      currency,
      providerTimestamp,
    });
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
