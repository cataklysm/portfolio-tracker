import type { Kysely } from 'kysely';
import type { MarketDatabase } from '../../../platform/database/schema.js';
import type { AnalystAssessmentEvent, AnalystEventStore } from '../application/ports.js';

/**
 * Writes analyst-assessment events to `market.outbox_events`; the platform
 * OutboxPublisher forwards them to the `market` Redis stream for insights.
 */
export class KyselyAnalystEventStore implements AnalystEventStore {
  constructor(private readonly db: Kysely<MarketDatabase>) {}

  async enqueueAnalystAssessment(input: AnalystAssessmentEvent): Promise<void> {
    await this.db
      .insertInto('market.outbox_events')
      .values({
        event_type: 'market.analyst_assessment.updated',
        event_version: 1,
        aggregate_type: 'instrument',
        aggregate_id: input.instrumentId,
        // Coarse monotonic version so a stale event can be ignored downstream.
        aggregate_version: Date.now(),
        payload: JSON.stringify({
          instrument_id: input.instrumentId,
          currency: input.currency,
          target_low: input.targetLow,
          target_high: input.targetHigh,
          target_mean: input.targetMean,
          target_median: input.targetMedian,
          recommendation_key: input.recommendationKey,
          recommendation_mean: input.recommendationMean,
          number_of_analysts: input.numberOfAnalysts,
          source: 'yahoo',
          as_of: new Date().toISOString(),
        }),
        correlation_id: null,
        causation_id: null,
      })
      .execute();
  }
}
