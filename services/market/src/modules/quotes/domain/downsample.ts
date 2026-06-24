/** One intraday point from a provider's series (epoch ms + decimal-string price). */
export interface SeriesPoint {
  timeMs: number;
  close: string;
  /** Traded volume for the bar, when the provider supplies it. */
  volume: string | null;
}

/**
 * Picks which intraday points to persist so stored ticks are spaced at least
 * `resolutionMs` apart, continuing from the last point already saved.
 *
 * The provider may return the whole intraday series on every poll (and polls
 * arrive on a jittery cadence — 5, 6, 9 minutes apart under load). Rather than
 * storing every point or only the latest, we keep one point per `resolutionMs`
 * window measured from `lastSavedMs`, so the saved series is evenly spaced
 * regardless of when the poll actually ran. `resolutionMs` is a floor: if the
 * feed is coarser than the requested resolution every point is kept.
 *
 * Points must be ascending by time; points at or before `lastSavedMs` are
 * dropped (already covered). A non-positive/absent `resolutionMs` keeps every
 * point newer than `lastSavedMs` (no downsampling).
 */
export function selectPointsToStore(
  points: readonly SeriesPoint[],
  lastSavedMs: number | null,
  resolutionMs: number | null | undefined,
): SeriesPoint[] {
  const floor = lastSavedMs ?? Number.NEGATIVE_INFINITY;
  const kept: SeriesPoint[] = [];
  // `lastKept` tracks the time of the most recent point we decided to store,
  // seeded with the last-saved time so spacing is continuous across polls.
  let lastKept = floor;
  const minGap = resolutionMs && resolutionMs > 0 ? resolutionMs : 0;
  for (const point of points) {
    if (point.timeMs <= floor) continue; // already stored in a previous poll
    if (point.timeMs - lastKept < minGap) continue; // too close to the last kept point
    kept.push(point);
    lastKept = point.timeMs;
  }
  return kept;
}
