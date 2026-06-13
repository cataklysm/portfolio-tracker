import type { Kysely } from 'kysely';
import type { FundamentalsDatabase } from '../../../platform/database/schema.js';
import type { FundamentalsEventStore } from '../application/ports.js';

/**
 * Writes `fundamentals.snapshot.updated` events to `fundamentals.outbox_events`;
 * the platform OutboxPublisher forwards them to the `fundamentals` Redis stream
 * for any downstream consumer (none today — published for future use).
 */
export class KyselyFundamentalsEventStore implements FundamentalsEventStore {
  constructor(private readonly db: Kysely<FundamentalsDatabase>) {}

  async enqueueSnapshotUpdated(input: {
    instrumentId: string;
    currency: string | null;
    effectiveDate: string;
  }): Promise<void> {
    await this.db
      .insertInto('fundamentals.outbox_events')
      .values({
        event_type: 'fundamentals.snapshot.updated',
        event_version: 1,
        aggregate_type: 'instrument',
        aggregate_id: input.instrumentId,
        // Coarse monotonic version so a stale event can be ignored downstream.
        aggregate_version: Date.now(),
        payload: JSON.stringify({
          instrument_id: input.instrumentId,
          currency: input.currency,
          effective_date: input.effectiveDate,
          source: 'yahoo',
          as_of: new Date().toISOString(),
        }),
        correlation_id: null,
        causation_id: null,
      })
      .execute();
  }
}
