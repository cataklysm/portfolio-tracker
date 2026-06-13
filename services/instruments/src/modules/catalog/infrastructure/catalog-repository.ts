import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { InstrumentsDatabase } from '../../../platform/database/schema.js';
import type {
  CatalogRepository,
  CreateExchangeInput,
  ExchangeView,
  InstrumentWithListings,
  ListingDetail,
  ListingSummary,
  ListingView,
  ProviderListing,
  RegisterListingInput,
  RegisterListingResult,
} from '../application/ports.js';

/** Kysely adapter for the `instruments.*` master-data tables. */
export class KyselyCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Kysely<InstrumentsDatabase>) {}

  async listExchanges(): Promise<ExchangeView[]> {
    return this.db
      .selectFrom('instruments.exchanges')
      .select(['id', 'mic', 'name', 'timezone', 'regular_open_local', 'regular_close_local'])
      .where('active', '=', true)
      .orderBy('mic')
      .execute();
  }

  async findExchangeId(idOrMic: { id?: string; mic?: string }): Promise<string | null> {
    if (idOrMic.id) {
      const row = await this.db
        .selectFrom('instruments.exchanges')
        .select('id')
        .where('id', '=', idOrMic.id)
        .executeTakeFirst();
      if (row) return row.id;
    }
    if (idOrMic.mic) {
      const row = await this.db
        .selectFrom('instruments.exchanges')
        .select('id')
        .where('mic', '=', idOrMic.mic)
        .executeTakeFirst();
      if (row) return row.id;
    }
    return null;
  }

  async createExchange(input: CreateExchangeInput): Promise<{ id: string }> {
    const row = await this.db
      .insertInto('instruments.exchanges')
      .values({
        mic: input.mic,
        name: input.name,
        timezone: input.timezone,
        regular_open_local: input.regularOpenLocal,
        regular_close_local: input.regularCloseLocal,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: row.id };
  }

  async currencyExists(code: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('instruments.currencies')
      .select('code')
      .where('code', '=', code)
      .executeTakeFirst();
    return row !== undefined;
  }

  async searchInstruments(query: string, limit: number): Promise<InstrumentWithListings[]> {
    const like = `%${query}%`;
    const ids = await this.db
      .selectFrom('instruments.instruments as i')
      .leftJoin('instruments.listings as l', 'l.instrument_id', 'i.id')
      .select('i.id as id')
      .distinct()
      .where('i.active', '=', true)
      .where((eb) =>
        eb.or([eb('i.name', 'ilike', like), eb('i.isin', 'ilike', like), eb('l.symbol', 'ilike', like)]),
      )
      .orderBy('i.id')
      .limit(limit)
      .execute();
    return this.loadInstruments(ids.map((row) => row.id));
  }

  async getInstrument(id: string): Promise<InstrumentWithListings | null> {
    const instruments = await this.loadInstruments([id]);
    return instruments[0] ?? null;
  }

  async getListingsByIds(ids: string[]): Promise<ListingSummary[]> {
    const rows = await this.db
      .selectFrom('instruments.listings as l')
      .innerJoin('instruments.instruments as i', 'i.id', 'l.instrument_id')
      .select([
        'l.id as listing_id',
        'l.instrument_id as instrument_id',
        'l.symbol as symbol',
        'l.currency as currency',
        'i.name as name',
        'i.asset_type as asset_type',
      ])
      .where('l.id', 'in', ids)
      .execute();
    return rows.map((row) => ({
      listing_id: row.listing_id,
      instrument_id: row.instrument_id,
      symbol: row.symbol,
      name: row.name,
      asset_type: row.asset_type,
      currency: row.currency,
    }));
  }

  async getProviderListings(ids: string[], provider: string): Promise<ProviderListing[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
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
      .where('l.id', 'in', ids)
      .execute();
    return rows.map((row) => ({
      listing_id: row.listing_id,
      instrument_id: row.instrument_id,
      symbol: row.symbol,
      currency: row.currency,
      provider_identifier: row.provider_identifier ?? null,
    }));
  }

  async updateInstrument(id: string, patch: { name?: string; isin?: string | null }): Promise<void> {
    const values: { name?: string; isin?: string | null; updated_at: Date } = { updated_at: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.isin !== undefined) values.isin = patch.isin;
    await this.db.updateTable('instruments.instruments').set(values).where('id', '=', id).execute();
  }

  async getListing(id: string): Promise<ListingDetail | null> {
    const row = await this.db
      .selectFrom('instruments.listings as l')
      .leftJoin('instruments.exchanges as e', 'e.id', 'l.exchange_id')
      .select([
        'l.id as id',
        'l.instrument_id as instrument_id',
        'l.symbol as symbol',
        'l.currency as currency',
        'l.exchange_id as exchange_id',
        'l.active as active',
        'e.mic as exchange_mic',
      ])
      .where('l.id', '=', id)
      .executeTakeFirst();
    if (!row) return null;

    const identifiers = await this.db
      .selectFrom('instruments.listing_provider_identifiers')
      .select(['provider', 'provider_identifier'])
      .where('listing_id', '=', id)
      .orderBy('provider')
      .execute();
    return { ...row, provider_identifiers: identifiers };
  }

  async symbolTaken(exchangeId: string | null, symbol: string, excludeListingId: string): Promise<boolean> {
    let query = this.db
      .selectFrom('instruments.listings')
      .select('id')
      .where('symbol', '=', symbol)
      .where('id', '!=', excludeListingId);
    query = exchangeId === null ? query.where('exchange_id', 'is', null) : query.where('exchange_id', '=', exchangeId);
    const row = await query.executeTakeFirst();
    return row !== undefined;
  }

  async updateListing(id: string, patch: { symbol?: string; currency?: string }): Promise<void> {
    const values: { symbol?: string; currency?: string; updated_at: Date } = { updated_at: new Date() };
    if (patch.symbol !== undefined) values.symbol = patch.symbol;
    if (patch.currency !== undefined) values.currency = patch.currency;
    await this.db.updateTable('instruments.listings').set(values).where('id', '=', id).execute();
  }

  async upsertProviderIdentifiers(
    listingId: string,
    identifiers: { provider: string; providerIdentifier: string }[],
  ): Promise<void> {
    for (const identifier of identifiers) {
      await this.db
        .insertInto('instruments.listing_provider_identifiers')
        .values({
          listing_id: listingId,
          provider: identifier.provider,
          provider_identifier: identifier.providerIdentifier,
        })
        .onConflict((oc) =>
          oc.columns(['listing_id', 'provider']).doUpdateSet({
            provider_identifier: identifier.providerIdentifier,
            updated_at: new Date(),
          }),
        )
        .execute();
    }
  }

  async registerListing(input: RegisterListingInput): Promise<RegisterListingResult> {
    return this.db.transaction().execute(async (trx) => {
      // Idempotency: an existing listing for (exchange, symbol) wins.
      const existing = await trx
        .selectFrom('instruments.listings')
        .select(['id', 'instrument_id'])
        .where('exchange_id', '=', input.listing.exchangeId)
        .where('symbol', '=', input.listing.symbol)
        .executeTakeFirst();
      if (existing) {
        return { instrumentId: existing.instrument_id, listingId: existing.id, created: false };
      }

      const instrumentId = await this.resolveInstrument(trx, input);

      const insertedListing = await trx
        .insertInto('instruments.listings')
        .values({
          instrument_id: instrumentId,
          exchange_id: input.listing.exchangeId,
          symbol: input.listing.symbol,
          currency: input.listing.currency,
        })
        .onConflict((oc) => oc.columns(['symbol', 'exchange_id']).doNothing())
        .returning('id')
        .executeTakeFirst();

      if (!insertedListing) {
        // Lost a concurrent race: return the now-existing record.
        const winner = await trx
          .selectFrom('instruments.listings')
          .select(['id', 'instrument_id'])
          .where('exchange_id', '=', input.listing.exchangeId)
          .where('symbol', '=', input.listing.symbol)
          .executeTakeFirstOrThrow();
        return { instrumentId: winner.instrument_id, listingId: winner.id, created: false };
      }

      const listingId = insertedListing.id;

      // Set the primary listing if the instrument does not yet have one.
      await trx
        .updateTable('instruments.instruments')
        .set({ primary_listing_id: listingId, updated_at: new Date() })
        .where('id', '=', instrumentId)
        .where('primary_listing_id', 'is', null)
        .execute();

      if (input.providerIdentifier) {
        await trx
          .insertInto('instruments.listing_provider_identifiers')
          .values({
            listing_id: listingId,
            provider: input.providerIdentifier.provider,
            provider_identifier: input.providerIdentifier.providerIdentifier,
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      await trx
        .insertInto('instruments.outbox_events')
        .values({
          event_type: 'instruments.listing.created',
          event_version: 1,
          aggregate_type: 'listing',
          aggregate_id: listingId,
          aggregate_version: 1,
          payload: JSON.stringify({
            event_id: randomUUID(),
            instrument_id: instrumentId,
            listing_id: listingId,
            symbol: input.listing.symbol,
            currency: input.listing.currency,
            exchange_id: input.listing.exchangeId,
          }),
          correlation_id: null,
          causation_id: null,
        })
        .execute();

      return { instrumentId, listingId, created: true };
    });
  }

  /** Reuse an instrument with the same ISIN, otherwise create a new one. */
  private async resolveInstrument(
    trx: Transaction<InstrumentsDatabase>,
    input: RegisterListingInput,
  ): Promise<string> {
    if (input.instrument.isin) {
      const existing = await trx
        .selectFrom('instruments.instruments')
        .select('id')
        .where('isin', '=', input.instrument.isin)
        .executeTakeFirst();
      if (existing) return existing.id;
    }
    const created = await trx
      .insertInto('instruments.instruments')
      .values({
        name: input.instrument.name,
        asset_type: input.instrument.assetType,
        isin: input.instrument.isin,
        underlying_identifier: input.instrument.underlyingIdentifier,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return created.id;
  }

  private async loadInstruments(ids: string[]): Promise<InstrumentWithListings[]> {
    if (ids.length === 0) return [];
    const [instruments, listings] = await Promise.all([
      this.db
        .selectFrom('instruments.instruments')
        .select(['id', 'name', 'asset_type', 'isin', 'primary_listing_id'])
        .where('id', 'in', ids)
        .execute(),
      this.db
        .selectFrom('instruments.listings as l')
        .leftJoin('instruments.exchanges as e', 'e.id', 'l.exchange_id')
        .select([
          'l.id as id',
          'l.instrument_id as instrument_id',
          'l.symbol as symbol',
          'l.currency as currency',
          'l.exchange_id as exchange_id',
          'l.active as active',
          'e.mic as exchange_mic',
        ])
        .where('l.instrument_id', 'in', ids)
        .execute(),
    ]);

    const listingsByInstrument = new Map<string, ListingView[]>();
    for (const listing of listings) {
      const list = listingsByInstrument.get(listing.instrument_id) ?? [];
      list.push(listing);
      listingsByInstrument.set(listing.instrument_id, list);
    }

    const order = new Map(ids.map((id, index) => [id, index]));
    return instruments
      .map((instrument) => ({
        id: instrument.id,
        name: instrument.name,
        asset_type: instrument.asset_type,
        isin: instrument.isin,
        primary_listing_id: instrument.primary_listing_id,
        listings: listingsByInstrument.get(instrument.id) ?? [],
      }))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
}
