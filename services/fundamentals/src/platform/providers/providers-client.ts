import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';

/**
 * HTTP client to the providers service for the `fundamentals` capability. The
 * endpoint is internal-only and must be network/gateway restricted. Degrades
 * gracefully: any transport error or non-2xx logs and returns null so a
 * provider outage never throws into the refresh cycle.
 */
export interface ProvidersFundamentalsDto {
  currency: string | null;
  asOfMs: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  sharesOutstanding: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  pegRatio: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  bookValue: number | null;
  beta: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  grossMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  totalRevenue: number | null;
  ebitda: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashflow: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
}

export class ProvidersClient {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 8000,
  ) {}

  async fetchFundamentals(symbol: string): Promise<ProvidersFundamentalsDto | null> {
    const url = new URL('/internal/fundamentals', this.baseUrl);
    url.searchParams.set('symbol', symbol);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'x-api-version': String(CURRENT_API_VERSION) },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          { symbol, status: response.status, error_code: 'providers_request_failed' },
          'Providers fundamentals request failed',
        );
        return null;
      }
      const body = (await response.json()) as { fundamentals: ProvidersFundamentalsDto | null };
      return body.fundamentals ?? null;
    } catch (err) {
      this.logger.warn({ err, symbol, error_code: 'providers_unavailable' }, 'Providers service unavailable');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
