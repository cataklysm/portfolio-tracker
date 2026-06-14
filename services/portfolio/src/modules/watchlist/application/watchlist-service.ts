import { AppError } from '@portfolio/platform';
import type { ListingReader, QuoteReader } from '../../positions/application/ports.js';
import type { KyselyWatchlistRepository } from '../infrastructure/watchlist-repository.js';

/** A watchlist item enriched with its listing and latest quote for display. */
export interface WatchlistItemView {
  id: string;
  listing_id: string;
  note: string | null;
  created_at: string;
  listing: {
    instrument_id: string;
    symbol: string;
    name: string;
    asset_type: 'equity' | 'crypto' | 'fund';
    currency: string;
  } | null;
  current_price: string | null;
  daily_change_pct: string | null;
  quote_as_of: string | null;
  freshness_status: string | null;
}

export interface WatchlistServiceDeps {
  repo: KyselyWatchlistRepository;
  listings: ListingReader;
  quotes: QuoteReader;
}

/**
 * Watchlist of not-yet-held listings for entry evaluation. Owned by the
 * portfolio service as user-level interest (not portfolio membership). Reads are
 * enriched with the instrument listing and the latest market quote, mirroring
 * how positions are assembled, so the frontend gets everything in one call.
 */
export class WatchlistService {
  constructor(private readonly deps: WatchlistServiceDeps) {}

  async list(userId: string, bearerToken: string): Promise<WatchlistItemView[]> {
    const items = await this.deps.repo.list(userId);
    if (items.length === 0) return [];

    const listingIds = [...new Set(items.map((i) => i.listing_id))];
    const [listings, quotes] = await Promise.all([
      this.deps.listings.getListings(listingIds, bearerToken),
      this.deps.quotes.getLatestPair(listingIds, bearerToken),
    ]);

    return items.map((item) => {
      const listing = listings.get(item.listing_id);
      const quote = quotes.get(item.listing_id);
      return {
        id: item.id,
        listing_id: item.listing_id,
        note: item.note,
        created_at: item.created_at,
        listing: listing
          ? {
              instrument_id: listing.instrument_id,
              symbol: listing.symbol,
              name: listing.name,
              asset_type: listing.asset_type,
              currency: listing.currency,
            }
          : null,
        current_price: quote?.latest ?? null,
        daily_change_pct: dailyChangePct(quote?.latest ?? null, quote?.previous ?? null),
        quote_as_of: quote?.latestAt ? quote.latestAt.toISOString() : null,
        freshness_status: quote?.freshness ?? null,
      };
    });
  }

  add(userId: string, listingId: string, note: string | null): Promise<{ id: string }> {
    return this.deps.repo.add(userId, listingId, note);
  }

  async remove(userId: string, listingId: string): Promise<void> {
    if (!(await this.deps.repo.remove(userId, listingId))) {
      throw AppError.notFound('watchlist_item_not_found', 'Watchlist item not found');
    }
  }
}

/** Percentage move from the previous close to the latest tick, to 2 decimals. */
function dailyChangePct(latest: string | null, previous: string | null): string | null {
  if (latest === null || previous === null) return null;
  const l = Number(latest);
  const p = Number(previous);
  if (!Number.isFinite(l) || !Number.isFinite(p) || p === 0) return null;
  return (((l - p) / p) * 100).toFixed(2);
}
