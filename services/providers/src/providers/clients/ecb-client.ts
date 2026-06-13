import type { Logger } from '@portfolio/platform';

/**
 * Low-level client for the European Central Bank euro foreign-exchange
 * reference rates (EUR base). The ECB publishes a daily XML and a rolling
 * 90-day history. This client only fetches and parses; the
 * last-available-rate fallback for non-publication dates lives in the FX
 * service that consumes this provider.
 */
export interface EcbDailyRates {
  /** Publication date (YYYY-MM-DD). */
  date: string;
  /** Quote currency (ISO 4217) -> rate (units of that currency per 1 EUR). */
  rates: Map<string, string>;
}

export class EcbClient {
  constructor(
    private readonly dailyUrl: string,
    private readonly histUrl: string,
    private readonly logger: Logger,
    private readonly timeoutMs = 5000,
  ) {}

  async fetchDaily(): Promise<EcbDailyRates | null> {
    const xml = await this.getText(this.dailyUrl);
    if (!xml) return null;
    const days = parseCubeDays(xml);
    return days[0] ?? null;
  }

  /** Most recent first. Used to backfill the last-available rate. */
  async fetchHistory90d(): Promise<EcbDailyRates[]> {
    const xml = await this.getText(this.histUrl);
    if (!xml) return [];
    return parseCubeDays(xml);
  }

  private async getText(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/xml' } });
      if (!response.ok) {
        this.logger.warn({ url, status: response.status, error_code: 'ecb_http_error' }, 'ECB request failed');
        return null;
      }
      return await response.text();
    } catch (err) {
      this.logger.warn({ err, error_code: 'ecb_unavailable' }, 'ECB request error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Parses the ECB eurofxref Cube XML into per-day rate maps. Each day is a
 * `<Cube time="YYYY-MM-DD">` containing `<Cube currency="USD" rate="1.08"/>`
 * children. Avoids an XML dependency with a tolerant regex scan. ECB is
 * inconsistent across its files — the daily feed uses single-quoted attributes
 * (`time='…'`) while the 90-day history uses double quotes — so the patterns
 * accept either quote style.
 */
function parseCubeDays(xml: string): EcbDailyRates[] {
  const days: EcbDailyRates[] = [];
  const dayRegex = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const rateRegex = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g;
  let dayMatch: RegExpExecArray | null;
  while ((dayMatch = dayRegex.exec(xml)) !== null) {
    const date = dayMatch[1] as string;
    const body = dayMatch[2] as string;
    const rates = new Map<string, string>();
    let rateMatch: RegExpExecArray | null;
    while ((rateMatch = rateRegex.exec(body)) !== null) {
      rates.set(rateMatch[1] as string, rateMatch[2] as string);
    }
    days.push({ date, rates });
  }
  return days;
}
