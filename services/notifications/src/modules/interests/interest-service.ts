import type { EventEnvelope, Logger } from '@portfolio/platform';
import type { UserInterestRepository } from './ports.js';

interface InterestPayload {
  listing_id?: string;
}

const MAPPING: Record<string, { type: 'position' | 'watchlist'; active: boolean } | undefined> = {
  'portfolio.position.opened': { type: 'position', active: true },
  'portfolio.position.closed': { type: 'position', active: false },
  'portfolio.watchlist.added': { type: 'watchlist', active: true },
  'portfolio.watchlist.removed': { type: 'watchlist', active: false },
};

/**
 * Maintains the per-user interest projection from portfolio events. Unlike the
 * market/fundamentals refresh projections (per listing), this one keeps the
 * `user_id` (carried on the envelope) so alerts can be targeted at the right
 * person.
 */
export class InterestService {
  constructor(
    private readonly repo: UserInterestRepository,
    private readonly logger: Logger,
  ) {}

  async applyInterestEvent(envelope: EventEnvelope): Promise<void> {
    const change = MAPPING[envelope.event_type];
    if (!change) return;

    const userId = envelope.user_id;
    const listingId = (envelope.payload as InterestPayload).listing_id;
    if (!userId || !listingId) {
      this.logger.debug({ event: envelope.event_type, error_code: 'interest_missing_fields' }, 'Interest event missing user/listing');
      return;
    }

    await this.repo.upsertInterest({
      interestId: envelope.aggregate.id,
      userId,
      listingId,
      interestType: change.type,
      active: change.active,
      aggregateVersion: envelope.aggregate.version,
    });
  }
}
