import { CURRENT_API_VERSION, type Logger } from '@portfolio/platform';
import type { FxReader } from '../../application/ports.js';

/**
 * Reads the latest EUR-based FX rates from the market service over HTTP. On a
 * market outage it degrades to an empty map; the converter then reports
 * reporting-currency values as unavailable rather than using a wrong rate.
 */
export class MarketFxClient implements FxReader {
  constructor(
    private readonly baseUrl: string,
    private readonly logger?: Logger,
    private readonly timeoutMs = 3000,
  ) {}

  async getEurRates(currencies: string[], bearerToken: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (currencies.length === 0) return map;
    const url = new URL('/fx/rates', this.baseUrl);
    url.searchParams.set('quote_currencies', currencies.join(','));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'x-api-version': String(CURRENT_API_VERSION),
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger?.warn(
          { url: url.toString(), status: response.status, error_code: 'market_fx_read_failed' },
          'Market FX read returned non-OK; reporting-currency values may be unavailable',
        );
        return map;
      }
      const rates = (await response.json()) as Record<string, string>;
      for (const [currency, rate] of Object.entries(rates)) map.set(currency, rate);
    } catch (err) {
      this.logger?.warn(
        { err, url: url.toString(), error_code: 'market_fx_unreachable' },
        'Market FX read failed; reporting-currency values may be unavailable',
      );
      return map;
    } finally {
      clearTimeout(timer);
    }
    return map;
  }
}
