import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { QuoteEventStore, QuoteUpdatedEvent } from '../application/ports.js';

/**
 * Writes quote update events to `market.outbox_events`; the platform
 * OutboxPublisher forwards them to the `market` Redis stream.
 */
export class KyselyQuoteEventStore implements QuoteEventStore {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

  async enqueueQuotesUpdated(input: QuoteUpdatedEvent): Promise<void> {
    await this.db
      .insertInto('market.outbox_events')
      .values({
        event_type: 'market.quotes.updated',
        event_version: 1,
        aggregate_type: 'quote_batch',
        // A provider quote batch has no single entity UUID; the column is uuid, so
        // use a fresh id per batch. The provider stays in the payload below.
        aggregate_id: randomUUID(),
        aggregate_version: Date.now(),
        payload: JSON.stringify({
          provider: input.provider,
          listing_ids: input.listingIds,
          as_of: input.asOf,
        }),
        correlation_id: null,
        causation_id: null,
      })
      .execute();
  }
}
