import { deriveFreshness, type FreshnessStatus } from '../domain/freshness.js';
import type {
  ListingResolver,
  ProviderQuote,
  QuoteProvider,
  QuoteRepository,
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
  resolver: ListingResolver;
  staleAfterMs: number;
}

/**
 * Serves normalized quotes from stored data (never calling a provider during a
 * read) and refreshes a listing's quote from the provider on demand or on a
 * schedule. Every read carries a freshness status so the frontend can mark
 * stale or unavailable data.
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

  /**
   * Refreshes one or more listings from the provider and stores the normalized
   * results, including each listing's daily series (one provider request per
   * listing). Used for on-demand refresh and series backfill. `from` starts the
   * daily history at that date (e.g. a position's first transaction) so the full
   * range of daily closes is stored; otherwise a short default window is used.
   * Returns the count actually stored. Provider/instruments failures are
   * swallowed (logged by adapters); stored data stays usable.
   */
  async refreshListings(listingIds: string[], from?: Date): Promise<number> {
    if (listingIds.length === 0) return 0;
    const resolved = await this.deps.resolver.resolve(listingIds, this.deps.provider.name);
    let stored = 0;
    for (const listingId of listingIds) {
      const listing = resolved.get(listingId);
      if (!listing) continue;
      const quote = await this.deps.provider.fetchQuote(listing.providerSymbol, from);
      if (!quote) continue;
      await this.store(listingId, listing.currency, quote);
      stored += 1;
    }
    return stored;
  }

  /**
   * Refreshes the latest tick for many listings in a single batched provider
   * request (no series). Used by the scheduler so a cycle is one call per
   * chunk instead of one per listing. Returns the count actually stored.
   */
  async refreshLatest(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;
    const resolved = await this.deps.resolver.resolve(listingIds, this.deps.provider.name);
    const symbols = [...new Set([...resolved.values()].map((l) => l.providerSymbol))];
    if (symbols.length === 0) return 0;

    const quotes = await this.deps.provider.fetchQuotes(symbols);
    let stored = 0;
    for (const listingId of listingIds) {
      const listing = resolved.get(listingId);
      if (!listing) continue;
      const quote = quotes.get(listing.providerSymbol);
      if (!quote) continue;
      await this.store(listingId, listing.currency, quote);
      stored += 1;
    }
    return stored;
  }

  private async store(listingId: string, listingCurrency: string, quote: ProviderQuote): Promise<void> {
    const currency = quote.currency ?? listingCurrency;
    const providerTimestamp = quote.timestampMs ? new Date(quote.timestampMs) : null;
    const now = new Date();

    // Store the historical series points (idempotent on listing_id+time+provider).
    for (const point of quote.series) {
      await this.deps.repo.upsertQuote({
        listingId,
        time: new Date(point.timeMs),
        provider: this.deps.provider.name,
        price: point.close,
        currency,
        providerTimestamp,
      });
    }
    // Store the latest tick at the provider timestamp (or now).
    await this.deps.repo.upsertQuote({
      listingId,
      time: providerTimestamp ?? now,
      provider: this.deps.provider.name,
      price: quote.price,
      currency,
      providerTimestamp,
    });
  }
}
