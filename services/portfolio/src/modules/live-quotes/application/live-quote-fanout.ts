import type { LiveQuoteHub } from './live-quote-hub.js';
import type { HoldingsRepository } from './ports.js';

export interface LiveQuoteFanoutDeps {
  hub: LiveQuoteHub;
  holdings: HoldingsRepository;
}

/**
 * Turns a market `quotes.updated` batch into per-user SSE pushes. Quotes refresh
 * a few listings at a time, so for each batch this resolves which *connected*
 * users hold any of the updated listings and pushes each user only the subset
 * they hold — a tab then refetches just those quotes instead of reloading. Free
 * of Redis/HTTP, so it is unit-testable in isolation.
 */
export class LiveQuoteFanout {
  constructor(private readonly deps: LiveQuoteFanoutDeps) {}

  async fanOut(listingIds: string[], asOf: string | null): Promise<void> {
    const listings = [...new Set(listingIds.filter((id) => typeof id === 'string' && id.length > 0))];
    if (listings.length === 0) return;

    // Nobody is watching: skip the holder lookup entirely. The query is also
    // scoped to connected users, so this is the cheap short-circuit for the
    // common idle case where the stream ticks but no tab is open.
    const userIds = this.deps.hub.connectedUserIds();
    if (userIds.length === 0) return;

    const holders = await this.deps.holdings.findOpenHolders(listings, userIds);
    if (holders.length === 0) return;

    // Group each user's affected listings, then push once per user.
    const byUser = new Map<string, string[]>();
    for (const { userId, listingId } of holders) {
      const list = byUser.get(userId) ?? [];
      list.push(listingId);
      byUser.set(userId, list);
    }
    for (const [userId, affected] of byUser) {
      this.deps.hub.publish(userId, { listingIds: affected, asOf });
    }
  }
}
