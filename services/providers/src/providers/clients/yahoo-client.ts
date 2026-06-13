import YahooFinance from 'yahoo-finance2';
import type { Logger } from '@portfolio/platform';

/**
 * Low-level client for Yahoo Finance, built on the `yahoo-finance2` library so
 * the crumb/cookie handshake, batch `quote` endpoint, and schema typing are
 * handled for us. Yahoo is an unofficial integration whose availability and
 * response shapes may change, so it is fully isolated here: Yahoo-specific
 * structures never leave this client. Verify suitability and terms at
 * deployment time.
 *
 * This client lives in the providers service — the single egress to Yahoo for
 * the whole platform — so the `yahoo-finance2` instance below is one shared
 * crumb/cookie session for every consuming service.
 */
export interface YahooChartResult {
  price: number;
  previousClose: number | null;
  currency: string | null;
  timestampMs: number | null;
  series: { timeMs: number; close: number }[];
}

/** A single latest-tick quote (no historical series), as returned by `quote`. */
export interface YahooQuoteResult {
  symbol: string;
  price: number;
  previousClose: number | null;
  currency: string | null;
  timestampMs: number | null;
}

export interface YahooSearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  quoteType: string | null;
}

/** Analyst consensus from Yahoo's `financialData` module (prices in quote currency). */
export interface YahooAnalystAssessment {
  targetLow: number | null;
  targetHigh: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
}

/**
 * Fundamentals snapshot drawn from Yahoo's `price`, `summaryDetail`,
 * `defaultKeyStatistics`, and `financialData` quoteSummary modules. Ratios are
 * decimals (0.23 == 23%); monetary fields are in the instrument's quote
 * currency. Every field is nullable — Yahoo's coverage varies by instrument.
 */
export interface YahooFundamentals {
  currency: string | null;
  asOfMs: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  sharesOutstanding: number | null;
  // Valuation
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  pegRatio: number | null;
  // Per share
  epsTrailing: number | null;
  epsForward: number | null;
  bookValue: number | null;
  beta: number | null;
  // Dividends
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  // Profitability (decimals)
  profitMargins: number | null;
  operatingMargins: number | null;
  grossMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  // Financials
  totalRevenue: number | null;
  ebitda: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashflow: number | null;
  // Growth (decimals)
  earningsGrowth: number | null;
  revenueGrowth: number | null;
}

/** One reported (or upcoming) earnings period. EPS in the instrument currency. */
export interface YahooEarningsPeriod {
  /** Period-end date (ms) from earnings history; null for upcoming. */
  periodEndMs: number | null;
  /** Report date (ms); set for the upcoming report, null for history. */
  reportDateMs: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprisePct: number | null;
  currency: string | null;
}

export interface YahooEarnings {
  history: YahooEarningsPeriod[];
  upcoming: YahooEarningsPeriod | null;
}

/** A dividend or split as published on Yahoo's chart event feed. */
export interface YahooCorporateAction {
  kind: 'dividend' | 'split';
  dateMs: number;
  /** Dividend cash amount (in the instrument currency). */
  amount: number | null;
  /** Split ratio components (e.g. 4 / 1 for a 4:1 split). */
  numerator: number | null;
  denominator: number | null;
}

export interface YahooNewsItem {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedAtMs: number | null;
}

// One shared client. `versionCheck` is off so the server never makes the npm
// version-check call on errors; the survey notice is suppressed.
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'], versionCheck: false });

// Skip the library's runtime schema validation: it throws when Yahoo's payload
// drifts from the expected shape. With validation off, epoch fields come back as
// raw seconds (the chart module still builds its `quotes[].date` as Dates), so
// `epochMs` below normalizes both.
const MODULE_OPTIONS = { validateResult: false } as const;

function epochMs(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  return value instanceof Date ? value.getTime() : value * 1000;
}

/** True for Yahoo's benign "this symbol has no fundamentals" response. */
function isNoCoverageError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('No fundamentals data found');
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Days of history to request for a range token like `5d` or `3mo`. */
function rangeToDays(range: string): number {
  const match = /^(\d+)(d|mo|y)$/.exec(range);
  if (!match) return 8;
  const n = Number(match[1]);
  const unit = match[2];
  if (unit === 'mo') return n * 31;
  if (unit === 'y') return n * 366;
  return n + 3; // a few extra calendar days to span n trading days
}

interface RawChart {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    currency?: string;
    regularMarketTime?: Date | number;
  };
  quotes?: Array<{ date?: Date | number; close?: number | null }>;
}

interface RawQuote {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
  regularMarketTime?: Date | number;
}

interface RawSearch {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchDisp?: string;
    exchange?: string;
    quoteType?: string;
  }>;
}

export class YahooClient {
  constructor(private readonly logger: Logger) {}

  /**
   * Fetches the latest price plus a daily series. `from` sets the start of the
   * series (used to backfill a position's full history); otherwise it defaults
   * to the short `range` window. `interval: '1d'` means each series point is a
   * day's close. End is always "now".
   */
  async getChart(symbol: string, opts: { from?: Date; range?: string } = {}): Promise<YahooChartResult | null> {
    try {
      const period1 =
        opts.from ?? new Date(Date.now() - rangeToDays(opts.range ?? '5d') * 24 * 60 * 60 * 1000);
      const result = (await yf.chart(symbol, { period1, interval: '1d' }, MODULE_OPTIONS)) as RawChart;
      const meta = result?.meta;
      const price = meta?.regularMarketPrice;
      if (typeof price !== 'number') return null;

      const series: { timeMs: number; close: number }[] = [];
      for (const bar of result?.quotes ?? []) {
        const timeMs = epochMs(bar.date);
        if (timeMs !== null && typeof bar.close === 'number') {
          series.push({ timeMs, close: bar.close });
        }
      }

      return {
        price,
        previousClose: meta?.chartPreviousClose ?? meta?.previousClose ?? null,
        currency: meta?.currency ?? null,
        timestampMs: epochMs(meta?.regularMarketTime),
        series,
      };
    } catch (err) {
      this.logger.warn({ err, symbol, error_code: 'yahoo_chart_failed' }, 'Yahoo chart request failed');
      return null;
    }
  }

  /**
   * Fetches latest ticks for many symbols in a single request. The whole point
   * of the batch endpoint: one HTTP call instead of one per symbol. Returns a
   * map keyed by the symbol Yahoo echoes back.
   */
  async getQuotes(symbols: string[]): Promise<Map<string, YahooQuoteResult>> {
    const out = new Map<string, YahooQuoteResult>();
    if (symbols.length === 0) return out;
    try {
      const result = (await yf.quote(symbols, undefined, MODULE_OPTIONS)) as RawQuote | RawQuote[];
      const list = Array.isArray(result) ? result : [result];
      for (const q of list) {
        const price = q?.regularMarketPrice;
        if (!q?.symbol || typeof price !== 'number') continue;
        out.set(q.symbol, {
          symbol: q.symbol,
          price,
          previousClose: q.regularMarketPreviousClose ?? null,
          currency: q.currency ?? null,
          timestampMs: epochMs(q.regularMarketTime),
        });
      }
    } catch (err) {
      this.logger.warn(
        { err, count: symbols.length, error_code: 'yahoo_quote_failed' },
        'Yahoo batch quote request failed',
      );
    }
    return out;
  }

  /**
   * Analyst consensus targets + recommendation for a symbol. Returns null when
   * the symbol has no analyst coverage. Prices are in the symbol's quote
   * currency (caller supplies the currency from the listing).
   */
  async getAnalystAssessment(symbol: string): Promise<YahooAnalystAssessment | null> {
    try {
      const result = (await yf.quoteSummary(
        symbol,
        { modules: ['financialData'] },
        MODULE_OPTIONS,
      )) as { financialData?: Record<string, unknown> };
      const fd = result?.financialData;
      if (!fd) return null;

      const targetLow = numOrNull(fd.targetLowPrice);
      const targetHigh = numOrNull(fd.targetHighPrice);
      const targetMean = numOrNull(fd.targetMeanPrice);
      // No usable targets → treat as no coverage.
      if (targetLow === null && targetHigh === null && targetMean === null) return null;

      return {
        targetLow,
        targetHigh,
        targetMean,
        targetMedian: numOrNull(fd.targetMedianPrice),
        recommendationKey: strOrNull(fd.recommendationKey),
        recommendationMean: numOrNull(fd.recommendationMean),
        numberOfAnalysts: numOrNull(fd.numberOfAnalystOpinions),
      };
    } catch (err) {
      // Yahoo throws "No fundamentals data found for symbol: X" for instruments
      // it doesn't cover with a financialData module (crypto, FX, many ETFs).
      // That is an expected "no coverage" outcome, not a failure — log it softly
      // without a stack so it doesn't read as an error.
      if (isNoCoverageError(err)) {
        this.logger.debug({ symbol }, 'No analyst coverage for symbol');
        return null;
      }
      this.logger.warn({ err, symbol, error_code: 'yahoo_analyst_failed' }, 'Yahoo analyst request failed');
      return null;
    }
  }

  /**
   * Fundamentals snapshot for a symbol from four quoteSummary modules in one
   * request. Returns null when Yahoo carries no fundamentals for the symbol
   * (crypto, FX, many ETFs) — a benign no-coverage outcome.
   */
  async getFundamentals(symbol: string): Promise<YahooFundamentals | null> {
    try {
      const result = (await yf.quoteSummary(
        symbol,
        { modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData'] },
        MODULE_OPTIONS,
      )) as {
        price?: Record<string, unknown>;
        summaryDetail?: Record<string, unknown>;
        defaultKeyStatistics?: Record<string, unknown>;
        financialData?: Record<string, unknown>;
      };
      const price = result?.price ?? {};
      const sd = result?.summaryDetail ?? {};
      const ks = result?.defaultKeyStatistics ?? {};
      const fd = result?.financialData ?? {};

      const fundamentals: YahooFundamentals = {
        currency: strOrNull(price.currency),
        asOfMs: epochMs(price.regularMarketTime as Date | number | undefined),
        marketCap: numOrNull(price.marketCap) ?? numOrNull(sd.marketCap),
        enterpriseValue: numOrNull(ks.enterpriseValue),
        sharesOutstanding: numOrNull(ks.sharesOutstanding),
        trailingPE: numOrNull(sd.trailingPE),
        forwardPE: numOrNull(sd.forwardPE) ?? numOrNull(ks.forwardPE),
        priceToBook: numOrNull(ks.priceToBook),
        pegRatio: numOrNull(ks.pegRatio),
        epsTrailing: numOrNull(ks.trailingEps),
        epsForward: numOrNull(ks.forwardEps),
        bookValue: numOrNull(ks.bookValue),
        beta: numOrNull(sd.beta) ?? numOrNull(ks.beta),
        dividendYield: numOrNull(sd.dividendYield),
        dividendRate: numOrNull(sd.dividendRate),
        payoutRatio: numOrNull(sd.payoutRatio),
        profitMargins: numOrNull(fd.profitMargins) ?? numOrNull(ks.profitMargins),
        operatingMargins: numOrNull(fd.operatingMargins),
        grossMargins: numOrNull(fd.grossMargins),
        returnOnEquity: numOrNull(fd.returnOnEquity),
        returnOnAssets: numOrNull(fd.returnOnAssets),
        totalRevenue: numOrNull(fd.totalRevenue),
        ebitda: numOrNull(fd.ebitda),
        totalCash: numOrNull(fd.totalCash),
        totalDebt: numOrNull(fd.totalDebt),
        freeCashflow: numOrNull(fd.freeCashflow),
        earningsGrowth: numOrNull(fd.earningsGrowth),
        revenueGrowth: numOrNull(fd.revenueGrowth),
      };

      // If every field is empty, treat as no coverage rather than an empty shell.
      const hasAny = Object.entries(fundamentals).some(
        ([key, value]) => key !== 'currency' && key !== 'asOfMs' && value !== null,
      );
      return hasAny ? fundamentals : null;
    } catch (err) {
      if (isNoCoverageError(err)) {
        this.logger.debug({ symbol }, 'No fundamentals coverage for symbol');
        return null;
      }
      this.logger.warn(
        { err, symbol, error_code: 'yahoo_fundamentals_failed' },
        'Yahoo fundamentals request failed',
      );
      return null;
    }
  }

  async search(query: string, limit = 10): Promise<YahooSearchResult[]> {
    try {
      const result = (await yf.search(
        query,
        { quotesCount: limit, newsCount: 0 },
        MODULE_OPTIONS,
      )) as RawSearch;
      const out: YahooSearchResult[] = [];
      for (const quote of result?.quotes ?? []) {
        if (typeof quote.symbol !== 'string') continue;
        out.push({
          symbol: quote.symbol,
          name: quote.longname ?? quote.shortname ?? quote.symbol,
          exchange: quote.exchDisp ?? quote.exchange ?? null,
          quoteType: quote.quoteType ?? null,
        });
      }
      return out;
    } catch (err) {
      this.logger.warn({ err, query, error_code: 'yahoo_search_failed' }, 'Yahoo search request failed');
      return [];
    }
  }

  /**
   * Earnings history (reported quarters with EPS actual/estimate + surprise) and
   * the next upcoming report (estimates only) from the `earningsHistory` and
   * `calendarEvents` modules. Returns null when the symbol has no coverage.
   */
  async getEarnings(symbol: string): Promise<YahooEarnings | null> {
    try {
      const result = (await yf.quoteSummary(
        symbol,
        { modules: ['earningsHistory', 'calendarEvents'] },
        MODULE_OPTIONS,
      )) as {
        earningsHistory?: { history?: Array<Record<string, unknown>> };
        calendarEvents?: { earnings?: Record<string, unknown> };
      };

      const history: YahooEarningsPeriod[] = [];
      for (const row of result?.earningsHistory?.history ?? []) {
        const epsActual = numOrNull(row.epsActual);
        const epsEstimate = numOrNull(row.epsEstimate);
        if (epsActual === null && epsEstimate === null) continue;
        history.push({
          periodEndMs: epochMs(row.quarter as Date | number | undefined),
          reportDateMs: null,
          epsEstimate,
          epsActual,
          revenueEstimate: null,
          revenueActual: null,
          surprisePct: numOrNull(row.surprisePercent),
          currency: strOrNull(row.currency),
        });
      }

      const cal = result?.calendarEvents?.earnings;
      let upcoming: YahooEarningsPeriod | null = null;
      const dates = (cal?.earningsDate as Array<Date | number> | undefined) ?? [];
      const reportDateMs = dates.length > 0 ? epochMs(dates[0]) : null;
      if (cal && reportDateMs !== null) {
        upcoming = {
          periodEndMs: null,
          reportDateMs,
          epsEstimate: numOrNull(cal.earningsAverage),
          epsActual: null,
          revenueEstimate: numOrNull(cal.revenueAverage),
          revenueActual: null,
          surprisePct: null,
          currency: null,
        };
      }

      if (history.length === 0 && !upcoming) return null;
      return { history, upcoming };
    } catch (err) {
      if (isNoCoverageError(err)) {
        this.logger.debug({ symbol }, 'No earnings coverage for symbol');
        return null;
      }
      this.logger.warn({ err, symbol, error_code: 'yahoo_earnings_failed' }, 'Yahoo earnings request failed');
      return null;
    }
  }

  /**
   * Dividends and splits over a long lookback from the chart event feed
   * (`events: 'div|split'`). Objective market facts, independent of holdings.
   */
  async getCorporateActions(symbol: string, opts: { from?: Date } = {}): Promise<YahooCorporateAction[]> {
    try {
      const period1 = opts.from ?? new Date(Date.now() - 10 * 366 * 24 * 60 * 60 * 1000);
      const result = (await yf.chart(
        symbol,
        { period1, interval: '1d', events: 'div|split' },
        MODULE_OPTIONS,
      )) as {
        events?: {
          dividends?: Record<string, { amount?: number; date?: Date | number }>;
          splits?: Record<string, { date?: Date | number; numerator?: number; denominator?: number }>;
        };
      };
      const out: YahooCorporateAction[] = [];
      for (const div of Object.values(result?.events?.dividends ?? {})) {
        const dateMs = epochMs(div.date);
        if (dateMs === null) continue;
        out.push({ kind: 'dividend', dateMs, amount: numOrNull(div.amount), numerator: null, denominator: null });
      }
      for (const split of Object.values(result?.events?.splits ?? {})) {
        const dateMs = epochMs(split.date);
        if (dateMs === null) continue;
        out.push({
          kind: 'split',
          dateMs,
          amount: null,
          numerator: numOrNull(split.numerator),
          denominator: numOrNull(split.denominator),
        });
      }
      return out;
    } catch (err) {
      this.logger.warn({ err, symbol, error_code: 'yahoo_corpactions_failed' }, 'Yahoo corporate-actions request failed');
      return [];
    }
  }

  /** Recent news headlines for a symbol from the search news feed. */
  async getNews(symbol: string, limit = 15): Promise<YahooNewsItem[]> {
    try {
      const result = (await yf.search(
        symbol,
        { quotesCount: 0, newsCount: limit },
        MODULE_OPTIONS,
      )) as { news?: Array<Record<string, unknown>> };
      const out: YahooNewsItem[] = [];
      for (const item of result?.news ?? []) {
        if (typeof item.title !== 'string' || typeof item.uuid !== 'string') continue;
        out.push({
          id: item.uuid,
          title: item.title,
          publisher: strOrNull(item.publisher),
          url: strOrNull(item.link),
          publishedAtMs: epochMs(item.providerPublishTime as Date | number | undefined),
        });
      }
      return out;
    } catch (err) {
      this.logger.warn({ err, symbol, error_code: 'yahoo_news_failed' }, 'Yahoo news request failed');
      return [];
    }
  }
}
