import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { InstrumentsDatabase } from '../../../platform/database/schema.js';
import type { InterestUpsert, WatchEntry, WatchRepository } from '../application/ports.js';

/**
 * Kysely adapter for `instruments.watch_interests` — the canonical watch-set
 * projection. Owns both the projection upsert and the outbox delta so they
 * commit atomically.
 */
export class KyselyWatchRepository implements WatchRepository {
  constructor(private readonly db: Kysely<InstrumentsDatabase>) {}

  async applyInterest(input: InterestUpsert, provider: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('instruments.watch_interests')
        .values({
          interest_id: input.interestId,
          listing_id: input.listingId,
          interest_type: input.interestType,
          active: input.active,
          aggregate_version: input.aggregateVersion,
        })
        .onConflict((oc) =>
          oc
            .column('interest_id')
            .doUpdateSet({
              active: input.active,
              aggregate_version: input.aggregateVersion,
              updated_at: new Date(),
            })
            // Ignore stale / out-of-order updates.
            .where('instruments.watch_interests.aggregate_version', '<', input.aggregateVersion),
        )
        .execute();

      // Listing-level aggregate: watched iff ≥1 active interest remains.
      const activeRow = await trx
        .selectFrom('instruments.watch_interests')
        .select('listing_id')
        .where('listing_id', '=', input.listingId)
        .where('active', '=', true)
        .limit(1)
        .executeTakeFirst();
      const listingActive = activeRow !== undefined;

      const resolved = await trx
        .selectFrom('instruments.listings as l')
        .leftJoin('instruments.listing_provider_identifiers as p', (join) =>
          join.onRef('p.listing_id', '=', 'l.id').on('p.provider', '=', provider),
        )
        .select([
          'l.id as listing_id',
          'l.instrument_id as instrument_id',
          'l.symbol as symbol',
          'l.currency as currency',
          'p.provider_identifier as provider_identifier',
        ])
        .where('l.id', '=', input.listingId)
        .executeTakeFirst();
      if (!resolved) return; // unknown listing — nothing to broadcast

      await trx
        .insertInto('instruments.outbox_events')
        .values({
          event_type: listingActive ? 'instruments.watch.activated' : 'instruments.watch.deactivated',
          event_version: 1,
          aggregate_type: 'watch_listing',
          aggregate_id: input.listingId,
          aggregate_version: input.aggregateVersion,
          payload: JSON.stringify({
            event_id: randomUUID(),
            listing_id: resolved.listing_id,
            instrument_id: resolved.instrument_id,
            symbol: resolved.symbol,
            currency: resolved.currency,
            provider,
            provider_identifier: resolved.provider_identifier ?? null,
            active: listingActive,
          }),
          correlation_id: null,
          causation_id: null,
        })
        .execute();
    });
  }

  async listWatchSet(provider: string): Promise<WatchEntry[]> {
    const rows = await this.db
      .selectFrom('instruments.watch_interests as w')
      .innerJoin('instruments.listings as l', 'l.id', 'w.listing_id')
      .leftJoin('instruments.listing_provider_identifiers as p', (join) =>
        join.onRef('p.listing_id', '=', 'l.id').on('p.provider', '=', provider),
      )
      .select([
        'l.id as listing_id',
        'l.instrument_id as instrument_id',
        'l.symbol as symbol',
        'l.currency as currency',
        'p.provider_identifier as provider_identifier',
      ])
      .distinct()
      .where('w.active', '=', true)
      .execute();
    return rows.map((r) => ({
      listing_id: r.listing_id,
      instrument_id: r.instrument_id,
      symbol: r.symbol,
      currency: r.currency,
      provider,
      provider_identifier: r.provider_identifier ?? null,
    }));
  }
}
