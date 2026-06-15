import { AppError } from '@portfolio/platform';
import {
  ASSET_TYPES,
  normalizeIsin,
  normalizeMic,
  normalizeSymbol,
  type AssetType,
} from '../domain/identifiers.js';
import { computeMarketSession, type MarketStatus } from '../domain/session.js';
import type {
  AdminSymbolView,
  BenchmarkCatalogEntry,
  CatalogRepository,
  CreateExchangeInput,
  ExchangeView,
  InstrumentWithListings,
  ListingDetail,
  ListingSummary,
  ProviderListing,
  RegisterListingResult,
  UpdateListingInput,
} from './ports.js';

/** Current market-session state for a listing's exchange. */
export interface ListingSessionView {
  listing_id: string;
  mic: string | null;
  timezone: string | null;
  status: MarketStatus;
  local_date: string | null;
  current_trading_date: string | null;
  previous_trading_date: string | null;
}

export interface CreateInstrumentInput {
  instrument: {
    name: string;
    asset_type: string;
    isin?: string;
    underlying_identifier?: string;
  };
  listing: {
    exchange_id?: string;
    exchange_mic?: string;
    symbol: string;
    currency: string;
  };
  provider_identifier?: { provider: string; provider_identifier: string };
}

const MAX_SEARCH_LIMIT = 50;

/**
 * Use cases for the shared instrument catalog. Search and read are open to any
 * authenticated user; creation atomically upserts so concurrent confirmations
 * of the same search result converge on the same records.
 */
export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  listExchanges(): Promise<ExchangeView[]> {
    return this.repo.listExchanges();
  }

  async createExchange(input: CreateExchangeInput): Promise<{ id: string }> {
    const mic = normalizeMic(input.mic);
    if (mic.length === 0) throw AppError.badRequest('invalid_mic', 'A MIC is required');
    if (input.timezone.trim() === '') throw AppError.badRequest('invalid_timezone', 'A timezone is required');
    const existing = await this.repo.findExchangeId({ mic });
    if (existing) throw AppError.conflict('exchange_exists', `Exchange ${mic} already exists`);
    return this.repo.createExchange({ ...input, mic });
  }

  async searchInstruments(query: string, limit?: number): Promise<InstrumentWithListings[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    const capped = Math.min(Math.max(limit ?? MAX_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
    return this.repo.searchInstruments(trimmed, capped);
  }

  /** The curated benchmark catalog (each entry resolves to a seeded index listing). */
  listBenchmarkCatalog(): Promise<BenchmarkCatalogEntry[]> {
    return this.repo.listBenchmarkCatalog();
  }

  async getInstrument(id: string): Promise<InstrumentWithListings> {
    const instrument = await this.repo.getInstrument(id);
    if (!instrument) throw AppError.notFound('instrument_not_found', 'Instrument not found');
    return instrument;
  }

  async updateInstrument(id: string, input: { name?: string; isin?: string | null }): Promise<InstrumentWithListings> {
    await this.getInstrument(id); // 404 if missing
    const name = input.name !== undefined ? input.name.trim() : undefined;
    if (name !== undefined && name.length === 0) throw AppError.badRequest('invalid_name', 'A name is required');
    const isin = input.isin === undefined ? undefined : input.isin ? normalizeIsin(input.isin) : null;
    if (name !== undefined || isin !== undefined) {
      await this.repo.updateInstrument(id, { name, isin });
    }
    return this.getInstrument(id);
  }

  getListingsByIds(ids: string[]): Promise<ListingSummary[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repo.getListingsByIds(ids);
  }

  /**
   * Current exchange-local market session for each listing: open/closed/holiday/
   * weekend, with the current and previous trading-session dates. Listings with no
   * exchange (e.g. crypto) resolve to `unknown`.
   */
  async getListingSessions(ids: string[]): Promise<ListingSessionView[]> {
    if (ids.length === 0) return [];
    const calendars = await this.repo.getListingSessionCalendars(ids);
    const byListing = new Map(calendars.map((c) => [c.listing_id, c]));
    const now = new Date();
    return ids.map((listingId) => {
      const calendar = byListing.get(listingId);
      const session = computeMarketSession(
        now,
        calendar
          ? {
              timezone: calendar.timezone,
              openLocal: calendar.open_local,
              closeLocal: calendar.close_local,
              holidays: calendar.holidays,
            }
          : null,
      );
      return {
        listing_id: listingId,
        mic: calendar?.mic ?? null,
        timezone: calendar?.timezone ?? null,
        ...session,
      };
    });
  }

  resolveProviderListings(ids: string[], provider: string): Promise<ProviderListing[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repo.getProviderListings(ids, provider);
  }

  async getListing(id: string): Promise<ListingDetail> {
    const listing = await this.repo.getListing(id);
    if (!listing) throw AppError.notFound('listing_not_found', 'Listing not found');
    return listing;
  }

  listAdminSymbols(): Promise<AdminSymbolView[]> {
    return this.repo.listAdminSymbols();
  }

  async deactivateListing(id: string): Promise<void> {
    await this.getListing(id);
    if (await this.repo.listingInUse(id)) {
      throw AppError.conflict('listing_in_use', 'This symbol is still used by a position or watchlist');
    }
    await this.repo.deactivateListing(id);
  }

  /**
   * Corrects a listing's symbol/currency and/or its provider-symbol mappings —
   * e.g. setting the Yahoo ticker (`SAP.DE`, `BTC-EUR`) the market service uses
   * to fetch quotes. The displayed symbol and the Yahoo symbol can differ.
   */
  async updateListing(id: string, input: UpdateListingInput): Promise<ListingDetail> {
    const existing = await this.repo.getListing(id);
    if (!existing) throw AppError.notFound('listing_not_found', 'Listing not found');

    const symbol = input.symbol !== undefined ? normalizeSymbol(input.symbol) : undefined;
    const currency = input.currency !== undefined ? input.currency.trim().toUpperCase() : undefined;

    if (symbol !== undefined && symbol.length === 0) {
      throw AppError.badRequest('invalid_symbol', 'A listing symbol is required');
    }
    if (currency !== undefined && !(await this.repo.currencyExists(currency))) {
      throw AppError.badRequest('unknown_currency', `Unsupported currency "${currency}"`);
    }
    if (symbol !== undefined && symbol !== existing.symbol) {
      if (await this.repo.symbolTaken(existing.exchange_id, symbol, id)) {
        throw AppError.conflict('listing_symbol_taken', 'Another listing already uses that symbol on this exchange');
      }
    }

    if (symbol !== undefined || currency !== undefined) {
      await this.repo.updateListing(id, { symbol, currency });
    }
    if (input.providerIdentifiers && input.providerIdentifiers.length > 0) {
      await this.repo.upsertProviderIdentifiers(
        id,
        input.providerIdentifiers
          .filter((pi) => pi.providerIdentifier.trim().length > 0)
          .map((pi) => ({ provider: pi.provider.trim(), providerIdentifier: pi.providerIdentifier.trim().toUpperCase() })),
      );
    }
    return this.getListing(id);
  }

  async createInstrument(input: CreateInstrumentInput): Promise<RegisterListingResult> {
    const assetType = assertAssetType(input.instrument.asset_type);
    const name = input.instrument.name.trim();
    if (name.length === 0) throw AppError.badRequest('invalid_name', 'An instrument name is required');

    const symbol = normalizeSymbol(input.listing.symbol);
    if (symbol.length === 0) throw AppError.badRequest('invalid_symbol', 'A listing symbol is required');

    const currency = input.listing.currency.trim().toUpperCase();
    if (!(await this.repo.currencyExists(currency))) {
      throw AppError.badRequest('unknown_currency', `Unsupported currency "${currency}"`);
    }

    const exchangeId = await this.repo.findExchangeId({
      id: input.listing.exchange_id,
      mic: input.listing.exchange_mic ? normalizeMic(input.listing.exchange_mic) : undefined,
    });
    if (!exchangeId) throw AppError.badRequest('exchange_not_found', 'The exchange must exist before adding a listing');

    return this.repo.registerListing({
      instrument: {
        name,
        assetType,
        isin: input.instrument.isin ? normalizeIsin(input.instrument.isin) : null,
        underlyingIdentifier: input.instrument.underlying_identifier?.trim() || null,
      },
      listing: { exchangeId, symbol, currency },
      providerIdentifier: input.provider_identifier
        ? {
            provider: input.provider_identifier.provider.trim(),
            providerIdentifier: input.provider_identifier.provider_identifier.trim(),
          }
        : undefined,
    });
  }
}

function assertAssetType(value: string): AssetType {
  if ((ASSET_TYPES as readonly string[]).includes(value)) return value as AssetType;
  throw AppError.badRequest('invalid_asset_type', `asset_type must be one of: ${ASSET_TYPES.join(', ')}`);
}
