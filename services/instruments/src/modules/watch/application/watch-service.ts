import type { EventEnvelope, Logger } from '@portfolio/platform';
import type { WatchEntry, WatchRepository } from './ports.js';

interface InterestPayload {
  listing_id?: string;
}

const MAPPING: Record<string, { type: 'position' | 'watchlist'; active: boolean } | undefined> = {
  'portfolio.position.opened': { type: 'position', active: true },
  'portfolio.position.closed': { type: 'position', active: false },
  'portfolio.watchlist.added': { type: 'watchlist', active: true },
  'portfolio.watchlist.removed': { type: 'watchlist', active: false },
};

export interface WatchServiceDeps {
  repo: WatchRepository;
  /** Provider namespace whose symbol is carried in the watch set (e.g. 'yahoo'). */
  provider: string;
  logger: Logger;
}

/**
 * Owns the canonical watch set. Consumes portfolio interest events into the
 * `instruments.watch_interests` projection (emitting resolved deltas to the
 * outbox) and serves the deduped snapshot for consumers to hydrate from.
 */
export class WatchService {
  constructor(private readonly deps: WatchServiceDeps) {}

  /** Idempotent handler for portfolio interest events from the stream. */
  async applyInterestEvent(envelope: EventEnvelope): Promise<void> {
    const change = MAPPING[envelope.event_type];
    if (!change) return; // not an interest-bearing event

    const listingId = (envelope.payload as InterestPayload).listing_id;
    if (!listingId) {
      this.deps.logger.debug({ event: envelope.event_type, error_code: 'watch_missing_listing' }, 'Interest event missing listing_id');
      return;
    }

    await this.deps.repo.applyInterest(
      {
        interestId: envelope.aggregate.id,
        listingId,
        interestType: change.type,
        active: change.active,
        aggregateVersion: envelope.aggregate.version,
      },
      this.deps.provider,
    );
  }

  /** The deduped, resolved watch set (snapshot for consumer hydration). */
  listWatchSet(): Promise<WatchEntry[]> {
    return this.deps.repo.listWatchSet(this.deps.provider);
  }
}
