import type { Kysely } from 'kysely';
import type { InstrumentsDatabase } from '../../../platform/database/schema.js';
import { computeMarketSession } from '../../catalog/domain/session.js';
import type {
  ActiveListing,
  ProviderSelectionView,
  ProviderUsageView,
  RefreshPlanEntry,
  SelectableCapability,
  SelectionRepository,
} from '../application/ports.js';

/**
 * Kysely adapter for `instruments.provider_selection`, plus the joined reads the
 * refresh plan needs (selection × listing × per-listing provider symbol).
 */
export class KyselySelectionRepository implements SelectionRepository {
  constructor(private readonly db: Kysely<InstrumentsDatabase>) {}

  async instrumentExists(instrumentId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('instruments.instruments')
      .select('id')
      .where('id', '=', instrumentId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async listForInstrument(instrumentId: string): Promise<ProviderSelectionView[]> {
    const rows = await this.db
      .selectFrom('instruments.provider_selection')
      .select(['capability', 'provider'])
      .where('instrument_id', '=', instrumentId)
      .orderBy('capability')
      .execute();
    return rows.map((r) => ({ capability: r.capability as SelectableCapability, provider: r.provider }));
  }

  async upsert(
    instrumentId: string,
    rows: { capability: SelectableCapability; provider: string }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.db.transaction().execute(async (trx) => {
      for (const row of rows) {
        await trx
          .insertInto('instruments.provider_selection')
          .values({ instrument_id: instrumentId, capability: row.capability, provider: row.provider })
          .onConflict((oc) =>
            oc
              .columns(['instrument_id', 'capability'])
              .doUpdateSet({ provider: row.provider, updated_at: new Date() }),
          )
          .execute();
      }
    });
  }

  async refreshPlan(capability: SelectableCapability, listingIds?: string[]): Promise<RefreshPlanEntry[]> {
    if (listingIds && listingIds.length === 0) return [];
    let query = this.db
      .selectFrom('instruments.listings as l')
      .innerJoin('instruments.instruments as i', (join) =>
        join.onRef('i.id', '=', 'l.instrument_id').on('i.active', '=', true),
      )
      .leftJoin('instruments.provider_selection as ps', (join) =>
        join.onRef('ps.instrument_id', '=', 'l.instrument_id').on('ps.capability', '=', capability),
      )
      .leftJoin('instruments.listing_provider_identifiers as p', (join) =>
        join.onRef('p.listing_id', '=', 'l.id').onRef('p.provider', '=', 'ps.provider'),
      )
      .leftJoin('instruments.exchanges as e', 'e.id', 'l.exchange_id')
      .select([
        'l.id as listing_id',
        'l.instrument_id as instrument_id',
        'l.symbol as symbol',
        'l.currency as currency',
        'ps.provider as provider',
        'p.provider_identifier as provider_identifier',
        'e.timezone as timezone',
        'e.regular_open_local as open_local',
        'e.regular_close_local as close_local',
        'e.holiday_calendar as holiday_calendar',
      ])
      .where('l.active', '=', true);
    if (listingIds) query = query.where('l.id', 'in', listingIds);
    const rows = await query.execute();
    const now = new Date();
    return rows.map((r) => {
      const session = computeMarketSession(
        now,
        r.timezone
          ? {
              timezone: r.timezone,
              openLocal: r.open_local,
              closeLocal: r.close_local,
              holidays: Array.isArray(r.holiday_calendar)
                ? r.holiday_calendar.filter((h): h is string => typeof h === 'string')
                : [],
            }
          : null,
      );
      return {
        listing_id: r.listing_id,
        instrument_id: r.instrument_id,
        symbol: r.symbol,
        currency: r.currency,
        provider: r.provider ?? null,
        provider_identifier: r.provider_identifier ?? null,
        market_status: session.status,
        minutes_since_close: session.minutes_since_close,
      };
    });
  }

  async usageForProvider(provider: string): Promise<ProviderUsageView[]> {
    const rows = await this.db
      .selectFrom('instruments.provider_selection as ps')
      .innerJoin('instruments.instruments as i', 'i.id', 'ps.instrument_id')
      .select(['ps.instrument_id as instrument_id', 'i.name as instrument_name', 'ps.capability as capability'])
      .where('ps.provider', '=', provider)
      .orderBy('i.name')
      .orderBy('ps.capability')
      .execute();
    return rows.map((r) => ({
      instrument_id: r.instrument_id,
      instrument_name: r.instrument_name,
      capability: r.capability as SelectableCapability,
    }));
  }

  async listActiveListings(): Promise<ActiveListing[]> {
    const rows = await this.db
      .selectFrom('instruments.listings as l')
      .innerJoin('instruments.instruments as i', (join) =>
        join.onRef('i.id', '=', 'l.instrument_id').on('i.active', '=', true),
      )
      .leftJoin('instruments.exchanges as e', 'e.id', 'l.exchange_id')
      .select([
        'l.id as listing_id',
        'l.instrument_id as instrument_id',
        'l.symbol as symbol',
        'l.currency as currency',
        'e.mic as exchange_mic',
      ])
      .where('l.active', '=', true)
      .execute();
    return rows.map((r) => ({
      listing_id: r.listing_id,
      instrument_id: r.instrument_id,
      symbol: r.symbol,
      currency: r.currency,
      exchange_mic: r.exchange_mic ?? null,
    }));
  }
}
