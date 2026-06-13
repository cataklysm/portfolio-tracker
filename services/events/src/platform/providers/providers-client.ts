import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';

/**
 * HTTP client to the providers service for the events capabilities (earnings,
 * corporate actions, news). Internal-only; degrades gracefully — any transport
 * error or non-2xx logs and returns the empty/neutral result so a provider
 * outage never throws into the refresh cycle.
 */
export interface ProvidersEarningsPeriodDto {
  periodEndMs: number | null;
  reportDateMs: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprisePct: number | null;
  currency: string | null;
}

export interface ProvidersEarningsDto {
  history: ProvidersEarningsPeriodDto[];
  upcoming: ProvidersEarningsPeriodDto | null;
}

export interface ProvidersCorporateActionDto {
  kind: 'dividend' | 'split';
  dateMs: number;
  amount: number | null;
  numerator: number | null;
  denominator: number | null;
}

export interface ProvidersNewsItemDto {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  publishedAtMs: number | null;
}

export class ProvidersClient {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 8000,
  ) {}

  async fetchEarnings(symbol: string): Promise<ProvidersEarningsDto | null> {
    const body = await this.get<{ earnings: ProvidersEarningsDto | null }>('/internal/earnings', symbol);
    return body?.earnings ?? null;
  }

  async fetchCorporateActions(symbol: string): Promise<ProvidersCorporateActionDto[]> {
    const body = await this.get<{ actions: ProvidersCorporateActionDto[] }>('/internal/corporate-actions', symbol);
    return body?.actions ?? [];
  }

  async fetchNews(symbol: string): Promise<ProvidersNewsItemDto[]> {
    const body = await this.get<{ news: ProvidersNewsItemDto[] }>('/internal/news', symbol);
    return body?.news ?? [];
  }

  private async get<T>(path: string, symbol: string): Promise<T | null> {
    const url = new URL(path, this.baseUrl);
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
          { path, symbol, status: response.status, error_code: 'providers_request_failed' },
          'Providers request failed',
        );
        return null;
      }
      return (await response.json()) as T;
    } catch (err) {
      this.logger.warn({ err, path, symbol, error_code: 'providers_unavailable' }, 'Providers service unavailable');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
