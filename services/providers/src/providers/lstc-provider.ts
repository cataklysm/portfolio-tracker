import { wallClockEpochToUtc } from '@portfolio/platform';
import type { LstcClient, LstcPoint } from './clients/lstc-client.js';
import type {
  Capability,
  ChartDto,
  MarketDataProvider,
  QuoteDto,
  SearchResultDto,
} from './types.js';

/** L&S TradeCenter quotes in EUR on a single venue (MIC LSSI). */
const LSTC_CURRENCY = 'EUR';
const LSTC_EXCHANGE = 'Lang & Schwarz TradeCenter';
const LSTC_MIC = 'LSSI';
/** Venue timezone. L&S intraday timestamps are this wall-clock stamped as if UTC. */
const LSTC_TIMEZONE = 'Europe/Berlin';

/**
 * Lang & Schwarz TradeCenter provider. Translates the L&S chart API into the
 * normalized DTOs; no L&S-specific shape escapes this adapter.
 *
 * Coverage: `quotes` (latest tick), `chart` (full daily history — the clean
 * historical series stock3 could not provide), and `symbol_search` (ISIN/WKN/
 * name → numeric instrumentId). Fundamentals/earnings/news/analyst are not
 * exposed by these endpoints, so they are left to Yahoo.
 *
 * The provider symbol is the bare L&S `instrumentId` (e.g. "41939"); single
 * venue, EUR, so no exchange/quote-source qualifier is needed.
 */
export class LstcProvider implements MarketDataProvider {
  readonly name = 'lstc';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    'quotes',
    'chart',
    'symbol_search',
  ]);

  constructor(private readonly client: LstcClient) {}

  async searchSymbols(query: string, limit: number): Promise<SearchResultDto[]> {
    const items = await this.client.search(query, limit);
    return items.map((item) => ({
      symbol: String(item.instrumentId),
      name: item.name,
      exchange: LSTC_EXCHANGE,
      mic: LSTC_MIC,
      currency: LSTC_CURRENCY,
      quoteType: item.category,
    }));
  }

  /**
   * Latest tick per symbol, with the full intraday series attached so the caller
   * can downsample and store finer-grained history than the poll cadence. Uses
   * the intraday series (freshest), falling back to the daily history's last
   * point when intraday is empty (outside trading hours). One request per
   * symbol — L&S has no batch endpoint.
   */
  async fetchQuotes(symbols: string[]): Promise<Map<string, QuoteDto>> {
    const out = new Map<string, QuoteDto>();
    for (const symbol of symbols) {
      const instrumentId = parseId(symbol);
      if (instrumentId === null) continue;
      let series = await this.client.getIntraday(instrumentId);
      let intraday = true;
      if (!series || series.points.length === 0) {
        series = await this.client.getHistory(instrumentId);
        intraday = false;
      }
      // Intraday points are venue wall-clock stamped as UTC — normalize to real
      // UTC. Daily history points are date-anchored at UTC midnight, leave as-is.
      const points = intraday ? series!.points.map(normalizeIntradayPoint) : series!.points;
      const last = points.at(-1);
      if (!last) continue;
      out.set(symbol, {
        symbol,
        price: String(last.price),
        previousClose: series!.previousClose === null ? null : String(series!.previousClose),
        currency: LSTC_CURRENCY,
        timestampMs: last.timeMs,
        // Only the intraday feed is fine-grained enough to downsample; the daily
        // history fallback is a single recent close, so don't pass it as a series.
        series: intraday ? points.map((p) => ({ timeMs: p.timeMs, close: String(p.price) })) : undefined,
      });
    }
    return out;
  }

  /**
   * Latest price plus the daily-close series. `from` trims the series to that
   * start date (history backfill); the last point is the latest price.
   */
  async fetchChart(symbol: string, from?: Date): Promise<ChartDto | null> {
    const instrumentId = parseId(symbol);
    if (instrumentId === null) return null;
    const series = await this.client.getHistory(instrumentId);
    if (!series || series.points.length === 0) return null;

    const fromMs = from?.getTime() ?? null;
    const points = fromMs === null ? series.points : series.points.filter((p) => p.timeMs >= fromMs);
    const last = series.points.at(-1)!;
    return {
      price: String(last.price),
      previousClose: series.previousClose === null ? null : String(series.previousClose),
      currency: LSTC_CURRENCY,
      timestampMs: last.timeMs,
      series: points.map((p) => ({ timeMs: p.timeMs, close: String(p.price) })),
    };
  }
}

/** Shifts an intraday point's venue wall-clock timestamp to the real UTC instant. */
function normalizeIntradayPoint(point: LstcPoint): LstcPoint {
  return { timeMs: wallClockEpochToUtc(point.timeMs, LSTC_TIMEZONE), price: point.price };
}

/** Parses the provider symbol (a numeric L&S instrument id); null if malformed. */
function parseId(symbol: string): number | null {
  const id = Number(symbol);
  return Number.isInteger(id) && id > 0 ? id : null;
}
