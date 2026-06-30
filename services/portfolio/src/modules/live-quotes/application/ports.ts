/** One active holding: a user holds an open position in this listing. */
export interface ActiveHolding {
  userId: string;
  listingId: string;
}

/** Resolves which users currently hold open positions in a set of listings. */
export interface HoldingsRepository {
  /**
   * Distinct (user, listing) pairs for users who have an OPEN position in any of
   * `listingIds`, across their non-archived portfolios, restricted to `userIds`
   * (the users with a live connection — the only ones worth resolving). Either
   * input being empty yields an empty result.
   */
  findOpenHolders(listingIds: string[], userIds: string[]): Promise<ActiveHolding[]>;
}
