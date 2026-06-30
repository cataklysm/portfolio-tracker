/**
 * DST-correct timezone helpers built on `Intl.DateTimeFormat`, with no
 * dependencies. Shared so the exchange-session calendar and venue feeds (e.g.
 * Lang & Schwarz intraday) compute offsets the same way instead of each
 * carrying their own copy of the two-pass settle.
 */

/** Local calendar date (`YYYY-MM-DD`) + minutes-past-midnight for an instant in a timezone, or null on an invalid timezone. */
export function zonedParts(instant: Date, timezone: string): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(minutes)) return null;
    return { date, minutes };
  } catch {
    return null;
  }
}

/**
 * Timezone offset in ms at a given instant (timezone ahead of UTC is positive).
 * Rounded to whole minutes so sub-minute noise on `instant` can't leak in — real
 * zone offsets are always whole minutes.
 */
export function tzOffsetMs(instant: Date, timezone: string): number {
  const parts = zonedParts(instant, timezone);
  if (!parts) return 0;
  const localAsUtc = Date.parse(`${parts.date}T00:00:00Z`) + parts.minutes * 60_000;
  return Math.round((localAsUtc - instant.getTime()) / 60_000) * 60_000;
}

/**
 * The real UTC epoch for an instant whose own UTC fields are actually the
 * `timezone` wall-clock (e.g. a feed that stamps local time as if it were UTC).
 * Two passes settle the offset correctly across DST boundaries.
 */
export function wallClockEpochToUtc(epochMs: number, timezone: string): number {
  let utc = epochMs - tzOffsetMs(new Date(epochMs), timezone);
  utc = epochMs - tzOffsetMs(new Date(utc), timezone);
  return utc;
}

/**
 * The UTC instant for a wall-clock time (`minutes` past midnight) on a local
 * calendar date (`YYYY-MM-DD`) in `timezone`. Returns null on an invalid date.
 */
export function wallClockToUtc(date: string, minutes: number, timezone: string): Date | null {
  const wallAsUtc = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(wallAsUtc)) return null;
  return new Date(wallClockEpochToUtc(wallAsUtc + minutes * 60_000, timezone));
}
