import type { YahooClient } from './clients/yahoo-client.js';
import type {
  AnalystDto,
  Capability,
  ChartDto,
  CorporateActionDto,
  EarningsDto,
  FundamentalsDto,
  MarketDataProvider,
  NewsItemDto,
  QuoteDto,
  SearchResultDto,
} from './types.js';

/**
 * Yahoo Finance provider. Translates the low-level client's results into the
 * normalized DTOs; no Yahoo-specific shape escapes this adapter. Supports
 * everything except FX (Yahoo FX is unreliable; ECB owns that capability).
 */
export class YahooProvider implements MarketDataProvider {
  readonly name = 'yahoo';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    'quotes',
    'chart',
    'search',
    'analyst',
    'fundamentals',
    'earnings',
    'corporate_actions',
    'news',
  ]);

  constructor(private readonly client: YahooClient) {}

  async fetchQuotes(symbols: string[]): Promise<Map<string, QuoteDto>> {
    const quotes = await this.client.getQuotes(symbols);
    const out = new Map<string, QuoteDto>();
    for (const [symbol, q] of quotes) {
      out.set(symbol, {
        symbol,
        price: String(q.price),
        previousClose: q.previousClose === null ? null : String(q.previousClose),
        currency: q.currency,
        timestampMs: q.timestampMs,
      });
    }
    return out;
  }

  async fetchChart(symbol: string, from?: Date): Promise<ChartDto | null> {
    const chart = await this.client.getChart(symbol, { from });
    if (!chart) return null;
    return {
      price: String(chart.price),
      previousClose: chart.previousClose === null ? null : String(chart.previousClose),
      currency: chart.currency,
      timestampMs: chart.timestampMs,
      series: chart.series.map((point) => ({ timeMs: point.timeMs, close: String(point.close) })),
    };
  }

  search(query: string, limit: number): Promise<SearchResultDto[]> {
    return this.client.search(query, limit);
  }

  fetchAnalyst(symbol: string): Promise<AnalystDto | null> {
    return this.client.getAnalystAssessment(symbol);
  }

  fetchFundamentals(symbol: string): Promise<FundamentalsDto | null> {
    return this.client.getFundamentals(symbol);
  }

  fetchEarnings(symbol: string): Promise<EarningsDto | null> {
    return this.client.getEarnings(symbol);
  }

  fetchCorporateActions(symbol: string): Promise<CorporateActionDto[]> {
    return this.client.getCorporateActions(symbol);
  }

  fetchNews(symbol: string): Promise<NewsItemDto[]> {
    return this.client.getNews(symbol);
  }
}
