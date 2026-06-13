import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { ProviderQuote, QuoteProvider } from '../application/ports.js';

/**
 * Quote provider backed by the providers service. The providers service already
 * returns decimal-safe strings in the normalized shape, so this adapter is a
 * straight pass-through; no provider-specific structure reaches market.
 */
export class ProvidersQuoteProvider implements QuoteProvider {
  // The transport is the providers service, but `name` is the upstream symbol
  // namespace — it keys the instruments resolver (Yahoo `provider_identifier`)
  // and tags stored quotes (`price_quotes.provider`), so it stays 'yahoo'.
  readonly name = 'yahoo';

  constructor(private readonly client: ProvidersClient) {}

  async fetchQuote(providerSymbol: string, from?: Date): Promise<ProviderQuote | null> {
    const chart = await this.client.fetchChart(providerSymbol, from);
    if (!chart) return null;
    return {
      price: chart.price,
      previousClose: chart.previousClose,
      currency: chart.currency,
      timestampMs: chart.timestampMs,
      series: chart.series,
    };
  }

  async fetchQuotes(providerSymbols: string[]): Promise<Map<string, ProviderQuote>> {
    const quotes = await this.client.fetchQuotes(providerSymbols);
    const out = new Map<string, ProviderQuote>();
    for (const q of quotes) {
      out.set(q.symbol, {
        price: q.price,
        previousClose: q.previousClose,
        currency: q.currency,
        timestampMs: q.timestampMs,
        series: [], // batch quote carries no historical series
      });
    }
    return out;
  }
}
