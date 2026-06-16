import type { MarketStatus } from '../../catalog/domain/session.js';

/**
 * Per-instrument data-retrieval capabilities that can be assigned a provider.
 * `fx` is global (ECB, not instrument-scoped) and `symbol_search` is a discovery
 * operation used before an instrument exists — both are intentionally excluded.
 */
export const SELECTABLE_CAPABILITIES = [
  'quotes',
  'chart',
  'analyst',
  'fundamentals',
  'earnings',
  'corporate_actions',
  'news',
] as const;
export type SelectableCapability = (typeof SELECTABLE_CAPABILITIES)[number];

export interface ProviderSelectionView {
  capability: SelectableCapability;
  provider: string;
}

/**
 * One listing in the refresh plan for a capability: the catalog listing joined to
 * the provider selected for that capability (via its instrument) and that
 * provider's own symbol (via the per-listing identifier). `provider` is null when
 * the instrument has no selection for the capability; `provider_identifier` is
 * null when the selected provider has no symbol mapped for the listing — in both
 * cases the consumer (the market scheduler) cannot fetch and skips the listing.
 */
export interface RefreshPlanEntry {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider: string | null;
  provider_identifier: string | null;
  /**
   * Current exchange-local market status of the listing's exchange
   * (open/closed/holiday/weekend), or `unknown` for exchange-less listings (e.g.
   * crypto) and exchanges with no configured hours. The scheduled sweep skips
   * definitively-closed listings; on-demand refresh ignores this.
   */
  market_status: MarketStatus;
}

/** An active listing in the catalog — the base set for a full-catalog refresh sweep. */
export interface ActiveListing {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  exchange_mic: string | null;
}

/** Where a provider is currently selected — for the "disable will break these" warning. */
export interface ProviderUsageView {
  instrument_id: string;
  instrument_name: string;
  capability: SelectableCapability;
}

export interface SelectionRepository {
  instrumentExists(instrumentId: string): Promise<boolean>;
  listForInstrument(instrumentId: string): Promise<ProviderSelectionView[]>;
  /** Upsert the given (capability → provider) rows for one instrument. */
  upsert(instrumentId: string, rows: { capability: SelectableCapability; provider: string }[]): Promise<void>;
  /**
   * Active listings resolved to their provider + provider symbol for a capability.
   * Restricted to `listingIds` when given, otherwise the whole active catalog.
   */
  refreshPlan(capability: SelectableCapability, listingIds?: string[]): Promise<RefreshPlanEntry[]>;
  listActiveListings(): Promise<ActiveListing[]>;
  /** Instruments + capabilities currently pointing at a given provider. */
  usageForProvider(provider: string): Promise<ProviderUsageView[]>;
}
