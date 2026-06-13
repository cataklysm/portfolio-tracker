export interface InterestUpsert {
  interestId: string;
  listingId: string;
  interestType: 'position' | 'watchlist';
  active: boolean;
  aggregateVersion: string | number;
}

export interface RefreshInterestRepository {
  /**
   * Idempotently applies an interest change. Stale or out-of-order updates
   * (lower aggregate version than stored) are ignored.
   */
  upsertInterest(input: InterestUpsert): Promise<void>;
  /** Distinct listing IDs with at least one active interest. */
  listActiveListingIds(): Promise<string[]>;
}
