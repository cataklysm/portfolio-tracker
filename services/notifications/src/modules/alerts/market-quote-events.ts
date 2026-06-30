import type { EventEnvelope, Logger } from '@portfolio/platform';
import type { AlertEvaluator } from './application/alert-evaluator.js';

interface QuoteUpdatedPayload {
  listing_ids?: unknown;
}

/**
 * Reacts to market quote updates by evaluating only the affected listings.
 * The periodic evaluator remains as a fallback for missed stream events.
 */
export class MarketQuoteEventService {
  constructor(
    private readonly evaluator: AlertEvaluator,
    private readonly logger: Logger,
  ) {}

  async applyMarketEvent(envelope: EventEnvelope): Promise<void> {
    if (envelope.event_type !== 'market.quotes.updated') return;
    const payload = envelope.payload as QuoteUpdatedPayload;
    const listingIds = Array.isArray(payload.listing_ids)
      ? payload.listing_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (listingIds.length === 0) {
      this.logger.debug({ event_id: envelope.event_id, error_code: 'quote_event_missing_listings' }, 'Quote update event missing listings');
      return;
    }
    await this.evaluator.runForListings(listingIds);
  }
}
