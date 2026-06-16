/**
 * Records per-listing refresh scheduling state in `market.data_refresh_state`.
 * The listing set comes from the instruments refresh plan (the whole active
 * catalog), resolved per cycle — not a local projection or watch set.
 */
export interface RefreshStateRepository {
  recordRefresh(listingIds: string[], provider: string, nextDueAt: Date): Promise<void>;
}
