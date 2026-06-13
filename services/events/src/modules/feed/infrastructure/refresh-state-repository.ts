import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type { RefreshStateRepository } from '../application/ports.js';

/** Kysely adapter for `events.refresh_state` — the per-instrument freshness gate. */
export class KyselyRefreshStateRepository implements RefreshStateRepository {
  constructor(private readonly db: Kysely<EventsDatabase>) {}

  async selectStaleInstruments(instrumentIds: string[], before: Date): Promise<string[]> {
    if (instrumentIds.length === 0) return [];
    const fresh = await this.db
      .selectFrom('events.refresh_state')
      .select('instrument_id')
      .where('instrument_id', 'in', instrumentIds)
      .where('last_refreshed_at', '>=', before)
      .execute();
    const freshSet = new Set(fresh.map((r) => r.instrument_id));
    return instrumentIds.filter((id) => !freshSet.has(id));
  }

  async markRefreshed(instrumentIds: string[]): Promise<void> {
    if (instrumentIds.length === 0) return;
    await this.db
      .insertInto('events.refresh_state')
      .values(instrumentIds.map((instrument_id) => ({ instrument_id, last_refreshed_at: new Date() })))
      .onConflict((oc) => oc.column('instrument_id').doUpdateSet({ last_refreshed_at: sql`now()` }))
      .execute();
  }
}
