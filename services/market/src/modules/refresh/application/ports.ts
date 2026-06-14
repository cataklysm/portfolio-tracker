/**
 * Records per-listing refresh scheduling state in `market.data_refresh_state`.
 * The watched-listing set itself now comes from the shared in-memory WatchSet
 * (hydrated from the instruments watch-set snapshot + deltas), not a local
 * projection table.
 */
export interface RefreshStateRepository {
  recordRefresh(listingIds: string[], provider: string, nextDueAt: Date): Promise<void>;
}
