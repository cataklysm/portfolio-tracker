import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';

/**
 * HTTP client to the providers service — the platform's single egress to
 * external market-data sources (Yahoo, ECB, …). Market no longer talks to any
 * provider SDK directly; every external fetch goes through here. The endpoints
 * are internal-only and must be network/gateway restricted in deployment.
 *
 * Like the other internal clients, this one degrades gracefully: on any
 * transport error or non-2xx it logs and returns the empty/neutral result, so a
 * provider outage never throws into the refresh cycle.
 */

/** Latest tick for one symbol, optionally with the provider's intraday series. */
export interface ProvidersQuoteDto {
  symbol: string;
  price: string;
  previousClose: string | null;
  currency: string | null;
  timestampMs: number | null;
  /** Intraday points (oldest first) for providers with a real intraday feed. */
  series?: ProvidersSeriesPointDto[];
}

/** One provider series point; `volume` present when the provider supplies it. */
export interface ProvidersSeriesPointDto {
  timeMs: number;
  close: string;
  volume?: string | null;
}

/** One (provider × capability) refresh-cadence row, as served by /internal/capability-refresh. */
export interface ProvidersCapabilityRefreshDto {
  provider: string;
  capability: string;
  refreshIntervalMs: number;
  saveResolutionMs: number | null;
  enabled: boolean;
}

/** Latest price plus a daily-close series. */
export interface ProvidersChartDto {
  price: string;
  previousClose: string | null;
  currency: string | null;
  timestampMs: number | null;
  series: ProvidersSeriesPointDto[];
}

export interface ProvidersSearchResultDto {
  symbol: string;
  name: string;
  exchange: string | null;
  quoteType: string | null;
}

export interface ProvidersAnalystDto {
  targetLow: number | null;
  targetHigh: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
}

export interface ProvidersFxDailyDto {
  date: string;
  rates: Record<string, string>;
}

export interface ProvidersFxRatesDto {
  base: 'EUR';
  daily: ProvidersFxDailyDto | null;
  history: ProvidersFxDailyDto[];
}

/** A provider's admin-editable settings, as served by /internal/providers. */
export interface ProvidersProviderSettingsDto {
  provider: string;
  enabled: boolean;
  providerClass: 'symbol' | 'reference';
  dataQuality: 'high' | 'medium' | 'low' | 'unknown';
  maxBatchSize: number | null;
  rateLimitPerMin: number | null;
  maxConcurrency: number;
  maxPerCycle: number | null;
}

export class ProvidersClient {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 8000,
  ) {}

  async fetchQuotes(symbols: string[], provider?: string): Promise<ProvidersQuoteDto[]> {
    if (symbols.length === 0) return [];
    const body = await this.request<{ quotes: ProvidersQuoteDto[] }>('/internal/quotes', {
      method: 'POST',
      body: JSON.stringify(provider ? { symbols, provider } : { symbols }),
    });
    return body?.quotes ?? [];
  }

  async fetchChart(symbol: string, from?: Date, provider?: string): Promise<ProvidersChartDto | null> {
    const params = new URLSearchParams({ symbol });
    if (from) params.set('from', toIsoDate(from));
    if (provider) params.set('provider', provider);
    const body = await this.request<{ chart: ProvidersChartDto | null }>(`/internal/chart?${params}`);
    return body?.chart ?? null;
  }

  /** The enabled providers' settings (pacing/quality) — used to pace the refresh sweep. */
  async fetchProviderSettings(): Promise<ProvidersProviderSettingsDto[]> {
    const body = await this.request<{ providers: ProvidersProviderSettingsDto[] }>('/internal/providers');
    return body?.providers ?? [];
  }

  /** Per-(provider × capability) refresh cadence — drives due-ness and quote save resolution. */
  async fetchCapabilityRefresh(): Promise<ProvidersCapabilityRefreshDto[]> {
    const body = await this.request<{ settings: ProvidersCapabilityRefreshDto[] }>('/internal/capability-refresh');
    return body?.settings ?? [];
  }

  async search(query: string, limit: number): Promise<ProvidersSearchResultDto[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const body = await this.request<{ results: ProvidersSearchResultDto[] }>(`/internal/search?${params}`);
    return body?.results ?? [];
  }

  async fetchAnalyst(symbol: string, provider?: string): Promise<ProvidersAnalystDto | null> {
    const params = new URLSearchParams({ symbol });
    if (provider) params.set('provider', provider);
    const body = await this.request<{ assessment: ProvidersAnalystDto | null }>(`/internal/analyst?${params}`);
    return body?.assessment ?? null;
  }

  async fetchFxRates(): Promise<ProvidersFxRatesDto> {
    const body = await this.request<{ rates: ProvidersFxRatesDto }>('/internal/fx/rates');
    return body?.rates ?? { base: 'EUR', daily: null, history: [] };
  }

  private async request<T>(path: string, init?: { method?: string; body?: string }): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method: init?.method ?? 'GET',
        headers: {
          accept: 'application/json',
          'x-api-version': String(CURRENT_API_VERSION),
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
        },
        body: init?.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          { path, status: response.status, error_code: 'providers_request_failed' },
          'Providers request failed',
        );
        return null;
      }
      return (await response.json()) as T;
    } catch (err) {
      this.logger.warn({ err, path, error_code: 'providers_unavailable' }, 'Providers service unavailable');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** UTC YYYY-MM-DD for the chart `from` query param. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
