export interface InterestUpsert {
  interestId: string;
  listingId: string;
  interestType: 'position' | 'watchlist';
  active: boolean;
  aggregateVersion: string | number;
}

/**
 * A resolved, deduped entry in the watch set — one per watched listing, carrying
 * the listing→instrument resolution and the provider symbol so consumers never
 * have to re-resolve. `provider_identifier` is null when the listing has no
 * mapping for the configured provider (it can't be refreshed, but is still
 * reported so consumers see the full set).
 */
export interface WatchEntry {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider: string;
  provider_identifier: string | null;
}

export interface WatchRepository {
  /**
   * Idempotently applies an interest change and, in the same transaction, writes
   * the resulting listing-level watch delta (instruments.watch.activated /
   * .deactivated) to the outbox. Stale (lower-version) interest updates are
   * ignored by the projection; the emitted delta always reflects the listing's
   * current aggregate active state, so consumers can apply it idempotently.
   */
  applyInterest(input: InterestUpsert, provider: string): Promise<void>;
  /** The full active, resolved watch set for a provider (snapshot for hydration). */
  listWatchSet(provider: string): Promise<WatchEntry[]>;
}
