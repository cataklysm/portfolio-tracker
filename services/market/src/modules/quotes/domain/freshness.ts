export type FreshnessStatus = 'fresh' | 'stale' | 'unavailable';

/**
 * Derives the freshness a read API reports to consumers. Stored quotes remain
 * usable even when stale; the status simply tells the frontend to mark the
 * value. A missing quote is `unavailable`; anything older than the threshold is
 * `stale`; otherwise `fresh`.
 */
export function deriveFreshness(latestAt: Date | null, now: Date, maxAgeMs: number): FreshnessStatus {
  if (!latestAt) return 'unavailable';
  return now.getTime() - latestAt.getTime() <= maxAgeMs ? 'fresh' : 'stale';
}
