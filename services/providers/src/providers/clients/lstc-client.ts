import type { Logger } from '@portfolio/platform';

/**
 * Low-level client for Lang & Schwarz TradeCenter's public chart JSON API
 * (`www.ls-tc.de/_rpc/json/...`). Unlike most vendor integrations this needs no
 * credential — the endpoints are the ones the public ls-tc.de charts call — but
 * it is an undocumented site API, so availability and shapes may change and are
 * fully isolated here. Verify L&S's terms before using beyond local use.
 *
 * L&S TradeCenter is a single German retail venue (MIC LSSI, `marketId=1`)
 * quoting in EUR. An instrument is identified by a numeric `instrumentId`
 * resolvable from an ISIN/WKN/name via the search endpoint; that id is the whole
 * provider symbol. Chart/quote series come back as plain `[epochMs, price]`
 * pairs — no delta/compression encoding.
 *
 * Sends a browser User-Agent + Referer; the site rejects some default agents.
 * URLs carry no secret, but logging stays endpoint + status only for consistency.
 */
export interface LstcClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** L&S quote type. `mid` (bid/ask midpoint) is the configured default. */
  quoteType: 'mid' | 'max';
}

export interface LstcSearchItem {
  instrumentId: number;
  name: string;
  isin: string | null;
  wkn: string | null;
  category: string | null;
}

/** A point on a chart series. */
export interface LstcPoint {
  timeMs: number;
  price: number;
}

/** A decoded chart response: the series plus the previous-day close. */
export interface LstcSeries {
  points: LstcPoint[];
  /** Previous-day close from the chart's `info.plotlines` (`previousDay`), or null. */
  previousClose: number | null;
}

const REQUEST_HEADERS = {
  accept: 'application/json',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  referer: 'https://www.ls-tc.de/',
};

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

export class LstcClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly quoteType: 'mid' | 'max';

  constructor(
    opts: LstcClientOptions,
    private readonly logger: Logger,
  ) {
    this.baseUrl = opts.baseUrl;
    this.timeoutMs = opts.timeoutMs;
    this.quoteType = opts.quoteType;
  }

  /**
   * Resolves an ISIN, WKN, or free-text name to L&S instruments. Returns [] on
   * any failure. The numeric `instrumentId` is the provider symbol.
   */
  async search(query: string, limit: number): Promise<LstcSearchItem[]> {
    const body = await this.getJson<RawSearchItem[]>('/_rpc/json/.lstc/instrument/search/main', {
      q: query,
      localeId: '1',
    });
    if (!Array.isArray(body)) return [];
    const out: LstcSearchItem[] = [];
    for (const raw of body) {
      const instrumentId = numOrNull(raw.instrumentId ?? raw.id);
      if (instrumentId === null) continue;
      out.push({
        instrumentId,
        name: strOrNull(raw.displayname) ?? String(instrumentId),
        isin: strOrNull(raw.isin),
        wkn: strOrNull(raw.wkn),
        category: strOrNull(raw.categoryName),
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Daily close history for an instrument (`[epochMs, close]` pairs from 2002 to
   * today), plus the previous-day close. The last point is the most recent
   * (intraday-updated) price. Returns null on failure.
   */
  getHistory(instrumentId: number): Promise<LstcSeries | null> {
    return this.getChart(instrumentId, 'history');
  }

  /**
   * Intraday per-minute series for the current session (`[epochMs, price]`), plus
   * the previous-day close. Empty/null outside trading hours. Returns null on
   * failure. Timestamps are returned exactly as received — their UTC fields are
   * actually Europe/Berlin wall-clock; the provider normalizes them to real UTC.
   */
  getIntraday(instrumentId: number): Promise<LstcSeries | null> {
    return this.getChart(instrumentId, 'intraday');
  }

  private async getChart(instrumentId: number, series: 'history' | 'intraday'): Promise<LstcSeries | null> {
    const body = await this.getJson<RawChart>('/_rpc/json/instrument/chart/dataForInstrument', {
      instrumentId: String(instrumentId),
      marketId: '1',
      quotetype: this.quoteType,
      series,
      localeId: '1',
    });
    if (!body) return null;
    const data = body.series?.[series]?.data;
    if (!Array.isArray(data)) return null;
    const points: LstcPoint[] = [];
    for (const pair of data) {
      const timeMs = numOrNull(pair?.[0]);
      const price = numOrNull(pair?.[1]);
      if (timeMs !== null && price !== null) points.push({ timeMs, price });
    }
    return { points, previousClose: extractPreviousClose(body) };
  }

  /**
   * Issues a GET and returns parsed JSON, or null on transport error / non-2xx.
   * Never throws into the caller.
   */
  private async getJson<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: REQUEST_HEADERS });
      if (!response.ok) {
        this.logger.warn({ path, status: response.status, error_code: 'lstc_http_error' }, 'L&S request failed');
        return null;
      }
      return (await response.json()) as T;
    } catch (err) {
      this.logger.warn({ err, path, error_code: 'lstc_unavailable' }, 'L&S request error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Reads the `previousDay` plotline value from a chart response, if present. */
function extractPreviousClose(body: RawChart): number | null {
  const lines = body.info?.plotlines;
  if (!Array.isArray(lines)) return null;
  const prev = lines.find((l) => l?.id === 'previousDay') ?? lines[0];
  return numOrNull(prev?.value);
}

// --- raw response shapes (never leave this module) --------------------------

interface RawSearchItem {
  id?: number;
  instrumentId?: number;
  displayname?: string;
  isin?: string;
  wkn?: number | string;
  categoryName?: string;
}

interface RawChart {
  info?: { plotlines?: Array<{ id?: string; value?: number }> };
  series?: Partial<Record<'history' | 'intraday', { data?: Array<[number, number]> }>>;
}
