export type MarketStatus = 'open' | 'closed' | 'holiday' | 'weekend' | 'unknown';

/** Exchange trading calendar inputs (local times + full-closure holiday dates). */
export interface ExchangeCalendar {
  timezone: string;
  /** Regular session open/close as local "HH:MM" or "HH:MM:SS"; null if unknown. */
  openLocal: string | null;
  closeLocal: string | null;
  /** Full-closure dates in the exchange's local calendar (YYYY-MM-DD). */
  holidays: string[];
}

export interface MarketSession {
  status: MarketStatus;
  /** Exchange-local calendar date of `now` (YYYY-MM-DD), or null if tz invalid. */
  local_date: string | null;
  /** Trading date `now` belongs to: today if a trading day, else the prior one. */
  current_trading_date: string | null;
  /** The trading date before `current_trading_date` (the prior session close). */
  previous_trading_date: string | null;
  /**
   * Minutes elapsed since *today's* regular close, when the market has closed on a
   * trading day (now is at/after the close). null otherwise — including pre-open
   * ("closed" but before the open), weekends, holidays, and 24h/unknown venues.
   * Lets a scheduler do one post-close "catch the close" fetch so the daily close
   * is captured even though the venue is now closed.
   */
  minutes_since_close: number | null;
  /**
   * UTC instant (ISO) of the most recent regular session close, or null when the
   * venue has no known open/close times (crypto / unknown). Used by consumers to
   * judge whether a "stale" quote is actually a valid last official close.
   */
  last_session_close: string | null;
  /**
   * UTC instant (ISO) of the next regular session open, or null when unknown.
   * Lets the UI say e.g. "valid until XETR opens tomorrow".
   */
  next_session_open: string | null;
}

const UNKNOWN: MarketSession = {
  status: 'unknown',
  local_date: null,
  current_trading_date: null,
  previous_trading_date: null,
  minutes_since_close: null,
  last_session_close: null,
  next_session_open: null,
};

/**
 * Determines an exchange's market status and the relevant trading-session dates
 * at a given instant, in the exchange's local timezone — replacing the prior
 * naive UTC-calendar-day boundary. Weekends and listed holidays are non-trading;
 * `previous_trading_date` skips both, so it is the correct "prior close" session
 * even across long weekends and holidays. Crypto / exchange-less listings (no
 * timezone) resolve to `unknown`.
 */
export function computeMarketSession(now: Date, calendar: ExchangeCalendar | null): MarketSession {
  if (!calendar || !calendar.timezone) return UNKNOWN;
  const parts = localParts(now, calendar.timezone);
  if (!parts) return UNKNOWN;

  const { date, minutes } = parts;
  const holidays = new Set(calendar.holidays);
  const trading = isTradingDay(date, holidays);

  const open = toMinutes(calendar.openLocal);
  const close = toMinutes(calendar.closeLocal);
  let status: MarketStatus;
  if (isWeekend(date)) status = 'weekend';
  else if (holidays.has(date)) status = 'holiday';
  else {
    status = open === null || close === null ? 'unknown' : minutes >= open && minutes < close ? 'open' : 'closed';
  }

  // Minutes since today's close — only on a trading day, at/after the close.
  const minutesSinceClose = trading && close !== null && minutes >= close ? minutes - close : null;

  const currentTrading = trading ? date : previousTradingDate(date, holidays);
  const previousTrading = previousTradingDate(currentTrading, holidays);

  // Most recent regular close (UTC): today's close once we're past it on a trading
  // day; otherwise the prior session's close.
  const afterTodaysClose = trading && close !== null && minutes >= close;
  const lastCloseDate = afterTodaysClose ? currentTrading : trading ? previousTrading : currentTrading;
  const lastSessionClose = close === null ? null : wallClockToUtc(lastCloseDate, close, calendar.timezone);

  // Next regular open (UTC): today's open if still ahead on a trading day; else the
  // next trading day's open.
  const nextOpenDate = trading && open !== null && minutes < open ? date : nextTradingDate(date, holidays);
  const nextSessionOpen = open === null ? null : wallClockToUtc(nextOpenDate, open, calendar.timezone);

  return {
    status,
    local_date: date,
    current_trading_date: currentTrading,
    previous_trading_date: previousTrading,
    minutes_since_close: minutesSinceClose,
    last_session_close: lastSessionClose ? lastSessionClose.toISOString() : null,
    next_session_open: nextSessionOpen ? nextSessionOpen.toISOString() : null,
  };
}

/** Local calendar date + minutes-of-day for an instant in a timezone, or null. */
function localParts(now: Date, timezone: string): { date: string; minutes: number } | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = dtf.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(minutes)) return null;
    return { date, minutes };
  } catch {
    return null;
  }
}

function toMinutes(local: string | null): number | null {
  if (!local) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(local);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWeekend(date: string): boolean {
  const day = weekdayOf(date);
  return day === 0 || day === 6;
}

function isTradingDay(date: string, holidays: Set<string>): boolean {
  return !isWeekend(date) && !holidays.has(date);
}

/** Day-of-week (0=Sun..6=Sat) of a calendar date (timezone-independent). */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The most recent trading date strictly before `date` (skips weekends/holidays). */
function previousTradingDate(date: string, holidays: Set<string>): string {
  let cursor = addDays(date, -1);
  for (let i = 0; i < 14; i += 1) {
    if (isTradingDay(cursor, holidays)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return cursor; // fall back after a full fortnight of closures (degenerate calendar)
}

/** The next trading date strictly after `date` (skips weekends/holidays). */
function nextTradingDate(date: string, holidays: Set<string>): string {
  let cursor = addDays(date, 1);
  for (let i = 0; i < 14; i += 1) {
    if (isTradingDay(cursor, holidays)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor; // degenerate calendar fallback
}

/**
 * The UTC instant for a wall-clock time (`minutes` past midnight) on a local
 * calendar date in `timezone`. Two passes settle the timezone offset correctly
 * across DST boundaries. Returns null on an invalid date/timezone.
 */
function wallClockToUtc(date: string, minutes: number, timezone: string): Date | null {
  const wallAsUtc = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(wallAsUtc)) return null;
  const target = wallAsUtc + minutes * 60_000;
  let utc = target - tzOffsetMs(new Date(target), timezone);
  utc = target - tzOffsetMs(new Date(utc), timezone);
  return Number.isNaN(utc) ? null : new Date(utc);
}

/** Timezone offset in ms (tz ahead of UTC is positive) at a given instant. */
function tzOffsetMs(instant: Date, timezone: string): number {
  const parts = localParts(instant, timezone);
  if (!parts) return 0;
  const asUtc = Date.parse(`${parts.date}T00:00:00Z`) + parts.minutes * 60_000;
  return asUtc - instant.getTime();
}
