import type { EventEnvelope, Logger } from '@portfolio/platform';
import type { EventsService } from '../../feed/index.js';
import type { RefreshInterestRepository } from './ports.js';

interface InterestPayload {
  listing_id?: string;
}

export interface RefreshServiceDeps {
  interests: RefreshInterestRepository;
  events: EventsService;
  logger: Logger;
  chunkSize?: number;
}

/**
 * Maintains the events refresh-interest projection from portfolio events and
 * runs the periodic refresh cycle. The events service applies its own freshness
 * gate, so a frequent cycle only fetches instruments actually due.
 */
export class RefreshService {
  private readonly chunkSize: number;

  constructor(private readonly deps: RefreshServiceDeps) {
    this.chunkSize = deps.chunkSize ?? 20;
  }

  /** Idempotent handler for portfolio interest events from the stream. */
  async applyInterestEvent(envelope: EventEnvelope): Promise<void> {
    const payload = envelope.payload as InterestPayload;
    const listingId = payload.listing_id;
    if (!listingId) return;

    const mapping: Record<string, { type: 'position' | 'watchlist'; active: boolean } | undefined> = {
      'portfolio.position.opened': { type: 'position', active: true },
      'portfolio.position.closed': { type: 'position', active: false },
      'portfolio.watchlist.added': { type: 'watchlist', active: true },
      'portfolio.watchlist.removed': { type: 'watchlist', active: false },
    };
    const change = mapping[envelope.event_type];
    if (!change) return;

    await this.deps.interests.upsertInterest({
      interestId: envelope.aggregate.id,
      listingId,
      interestType: change.type,
      active: change.active,
      aggregateVersion: envelope.aggregate.version,
    });
  }

  /** One refresh cycle: refresh events for all listings with active interest. */
  async runCycle(): Promise<void> {
    const listingIds = await this.deps.interests.listActiveListingIds();
    for (const chunk of chunked(listingIds, this.chunkSize)) {
      try {
        await this.deps.events.refreshListings(chunk);
      } catch (err) {
        this.deps.logger.warn({ err, error_code: 'events_refresh_chunk_failed' }, 'Events refresh chunk failed');
      }
    }
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
