import Decimal from 'decimal.js';
import { makeDatedConverter } from '../../positions/domain/currency.js';
import type { PositionView } from '../../positions/application/build-position-view.js';
import type { PositionService } from '../../positions/application/position-service.js';
import type { DatedRateRequest, FxReader, SettingsReader } from '../../positions/application/ports.js';
import type { CashFlowRecord, CashFlowRepository } from '../../cash-flows/application/ports.js';
import { computeSummary, type PortfolioSummary } from '../domain/summary.js';
import { computeHoldings, type HoldingGroup } from '../domain/holdings.js';
import { computeAllocation, type AllocationReport } from '../domain/allocation.js';

export interface PortfolioNameReader {
  list(userId: string, includeArchived: boolean): Promise<{ id: string; name: string; preferred_headline_metric: string }[]>;
}

export interface ReportingServiceDeps {
  positions: PositionService;
  cashFlows: CashFlowRepository;
  portfolios: PortfolioNameReader;
  fx: FxReader;
  settings: SettingsReader;
}

// "Dividend income" for the summary/holdings = received dividends and cash-in-lieu.
const INCOME_TYPES = new Set<CashFlowRecord['type']>(['dividend', 'cash_in_lieu']);

/**
 * Authoritative portfolio reporting. Builds on the verified per-position
 * calculation (PositionService) and the cash-flow ledger, aggregating one
 * internally consistent snapshot for a selected portfolio or the combined active
 * set. Dividends convert at their value-date FX, like realized P&L.
 */
export class ReportingService {
  constructor(private readonly deps: ReportingServiceDeps) {}

  async getSummary(userId: string, bearerToken: string, portfolioId?: string): Promise<PortfolioSummary> {
    const [views, flows, settings, portfolios] = await Promise.all([
      this.deps.positions.listPositions(userId, bearerToken, portfolioId),
      this.deps.cashFlows.listForUser(userId, portfolioId),
      this.deps.settings.getUserSettings(bearerToken),
      this.deps.portfolios.list(userId, true),
    ]);

    const dividends = await this.sumDividends(flows, settings.reportingCurrency, bearerToken);
    const headlineMetric = portfolioId
      ? (portfolios.find((p) => p.id === portfolioId)?.preferred_headline_metric ?? null)
      : null;

    return computeSummary(views, dividends, settings.reportingCurrency, new Date().toISOString(), headlineMetric);
  }

  async getHoldings(userId: string, bearerToken: string, portfolioId?: string): Promise<HoldingGroup[]> {
    const [views, flows, settings, portfolios] = await Promise.all([
      this.deps.positions.listPositions(userId, bearerToken, portfolioId),
      this.deps.cashFlows.listForUser(userId, portfolioId),
      this.deps.settings.getUserSettings(bearerToken),
      this.deps.portfolios.list(userId, true),
    ]);

    const portfolioNames = new Map(portfolios.map((p) => [p.id, p.name]));
    const dividendsByInstrument = await this.dividendsByInstrument(flows, views, settings.reportingCurrency, bearerToken);
    return computeHoldings(views, portfolioNames, dividendsByInstrument);
  }

  async getAllocation(userId: string, bearerToken: string, portfolioId?: string): Promise<AllocationReport> {
    const [views, portfolios] = await Promise.all([
      this.deps.positions.listPositions(userId, bearerToken, portfolioId),
      this.deps.portfolios.list(userId, true),
    ]);
    const portfolioNames = new Map(portfolios.map((p) => [p.id, p.name]));
    return computeAllocation(views, portfolioNames);
  }

  /** Total received dividends/cash-in-lieu in the reporting currency, at value-date FX. */
  private async sumDividends(
    flows: CashFlowRecord[],
    reportingCurrency: string,
    bearerToken: string,
  ): Promise<{ amount: Decimal; complete: boolean }> {
    const income = flows.filter((f) => INCOME_TYPES.has(f.type));
    const convert = await this.datedConverter(income, reportingCurrency, bearerToken);

    let amount = new Decimal(0);
    let complete = true;
    for (const flow of income) {
      const converted = convert(new Decimal(flow.net_amount), flow.currency, flow.tax_relevant_value_date);
      if (converted === null) {
        complete = false; // a foreign dividend with no historical rate
        continue;
      }
      amount = amount.plus(converted);
    }
    return { amount, complete };
  }

  private async dividendsByInstrument(
    flows: CashFlowRecord[],
    views: PositionView[],
    reportingCurrency: string,
    bearerToken: string,
  ): Promise<Map<string, Decimal>> {
    const instrumentByPosition = new Map<string, string>();
    for (const view of views) {
      if (view.listing) instrumentByPosition.set(view.id, view.listing.instrument_id);
    }
    const income = flows.filter((f) => INCOME_TYPES.has(f.type) && f.position_id !== null);
    const convert = await this.datedConverter(income, reportingCurrency, bearerToken);

    const out = new Map<string, Decimal>();
    for (const flow of income) {
      const instrumentId = flow.position_id ? instrumentByPosition.get(flow.position_id) : undefined;
      if (!instrumentId) continue;
      const converted = convert(new Decimal(flow.net_amount), flow.currency, flow.tax_relevant_value_date);
      if (converted === null) continue;
      out.set(instrumentId, (out.get(instrumentId) ?? new Decimal(0)).plus(converted));
    }
    return out;
  }

  /** A value-date FX converter for the value dates/currencies of the given flows. */
  private async datedConverter(
    flows: CashFlowRecord[],
    reportingCurrency: string,
    bearerToken: string,
  ): Promise<(amount: Decimal, fromCurrency: string, valueDate: string) => Decimal | null> {
    const pairs: DatedRateRequest[] = [];
    for (const flow of flows) {
      pairs.push({ currency: flow.currency, date: flow.tax_relevant_value_date });
      pairs.push({ currency: reportingCurrency, date: flow.tax_relevant_value_date });
    }
    const rates = await this.deps.fx.getEurRatesAt(pairs, bearerToken);
    return makeDatedConverter(rates, reportingCurrency);
  }
}
