export interface InterestUpsert {
  interestId: string;
  userId: string;
  listingId: string;
  interestType: 'position' | 'watchlist';
  active: boolean;
  aggregateVersion: string | number;
}

/** One active (user, listing) pair the evaluator should consider. */
export interface ActiveInterest {
  userId: string;
  listingId: string;
}

export interface UserInterestRepository {
  /** Idempotent upsert; stale/out-of-order updates (lower version) are ignored. */
  upsertInterest(input: InterestUpsert): Promise<void>;
  /** Distinct active (user, listing) pairs across all users. */
  listActiveInterests(): Promise<ActiveInterest[]>;
}
