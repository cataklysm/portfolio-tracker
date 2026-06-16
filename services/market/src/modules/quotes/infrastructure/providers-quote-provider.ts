import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { ProviderQuote, QuoteProvider } from '../application/ports.js';

/**
 * Quote provider backed by the providers service. The providers service already
 * returns decimal-safe strings in the normalized shape, so this adapter is a
 * straight pass-through; no provider-specific structure reaches market. The
 * `provider` argument names the upstream source (e.g. 'yahoo') and is forwarded
 * to the providers service for routing.
 */
export class ProvidersQuoteProvider implements QuoteProvider {
  constructor(private readonly client: ProvidersClient) {}

  async fetchQuote(provider: string, providerSymbol: string, from?: Date): Promise<ProviderQuote | null> {
    const chart = await this.client.fetchChart(providerSymbol, from, provider);
    if (!chart) return null;
    return {
      price: chart.price,
      previousClose: chart.previousClose,
      currency: chart.currency,
      timestampMs: chart.timestampMs,
      series: chart.series,
    };
  }

  async fetchQuotes(provider: string, providerSymbols: string[]): Promise<Map<string, ProviderQuote>> {
    const quotes = await this.client.fetchQuotes(providerSymbols, provider);
    const out = new Map<string, ProviderQuote>();
    for (const q of quotes) {
      out.set(q.symbol, {
        price: q.price,
        previousClose: q.previousClose,
        currency: q.currency,
        timestampMs: q.timestampMs,
        // Providers with an intraday feed (lstc) attach it; latest-only providers
        // (yahoo's batch endpoint) omit it, so the series is empty for them.
        series: q.series ?? [],
      });
    }
    return out;
  }
}
