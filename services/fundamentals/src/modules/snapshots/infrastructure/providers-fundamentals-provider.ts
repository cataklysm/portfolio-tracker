import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { FundamentalsProvider, FundamentalsSnapshot } from '../application/ports.js';

/**
 * Fundamentals provider backed by the providers service. Maps the providers DTO
 * to the service's normalized snapshot, deriving the two stored fields the
 * provider doesn't supply directly — price-to-sales (market cap / revenue) and
 * net debt (total debt − total cash) — and stashing the full DTO in `raw`.
 */
export class ProvidersFundamentalsProvider implements FundamentalsProvider {
  constructor(private readonly client: ProvidersClient) {}

  async fetchFundamentals(provider: string, providerSymbol: string): Promise<FundamentalsSnapshot | null> {
    const dto = await this.client.fetchFundamentals(providerSymbol, provider);
    if (!dto) return null;

    const psRatio =
      dto.marketCap !== null && dto.totalRevenue !== null && dto.totalRevenue !== 0
        ? dto.marketCap / dto.totalRevenue
        : null;
    const netDebt =
      dto.totalDebt !== null || dto.totalCash !== null ? (dto.totalDebt ?? 0) - (dto.totalCash ?? 0) : null;

    return {
      currency: dto.currency,
      asOfMs: dto.asOfMs,
      peRatio: dto.trailingPE,
      pbRatio: dto.priceToBook,
      psRatio,
      dividendYield: dto.dividendYield,
      eps: dto.epsTrailing,
      marketCap: dto.marketCap,
      revenue: dto.totalRevenue,
      revenueGrowth: dto.revenueGrowth,
      earningsGrowth: dto.earningsGrowth,
      sharesOutstanding: dto.sharesOutstanding,
      netDebt,
      raw: { ...dto },
    };
  }
}
