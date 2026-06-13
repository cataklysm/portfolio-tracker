import type { Kysely } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type { EventsEventStore } from '../application/ports.js';

/**
 * Writes `events.instrument_events.updated` events to `events.outbox_events`;
 * the platform OutboxPublisher forwards them to the `events` Redis stream for
 * any downstream consumer (none today — published for future use).
 */
export class KyselyEventsEventStore implements EventsEventStore {
  constructor(private readonly db: Kysely<EventsDatabase>) {}

  async enqueueEventsUpdated(input: { instrumentId: string }): Promise<void> {
    await this.db
      .insertInto('events.outbox_events')
      .values({
        event_type: 'events.instrument_events.updated',
        event_version: 1,
        aggregate_type: 'instrument',
        aggregate_id: input.instrumentId,
        aggregate_version: Date.now(),
        payload: JSON.stringify({
          instrument_id: input.instrumentId,
          source: 'yahoo',
          as_of: new Date().toISOString(),
        }),
        correlation_id: null,
        causation_id: null,
      })
      .execute();
  }
}
