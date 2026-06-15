import Decimal from 'decimal.js';
import { makeDatedConverter } from '../../positions/domain/currency.js';
import type { PositionView } from '../../positions/application/build-position-view.js';
import type { PositionService } from '../../positions/application/position-service.js';
import type {
  DailyClose,
  DatedRateRequest,
  FxReader,
  QuoteReader,
  RatePoint,
  SettingsReader,
} from '../../positions/application/ports.js';
import type { CashFlowRecord, CashFlowRepository } from '../../cash-flows/application/ports.js';
import type { TaxEventRecord, TaxEventRepository } from '../../tax-events/application/ports.js';
import { computeSummary, type PortfolioSummary } from '../domain/summary.js';
import { computeHoldings, type HoldingGroup } from '../domain/holdings.js';
import { computeAllocation, type AllocationReport } from '../domain/allocation.js';
import { computeTaxReport, type ConvertedTaxEvent, type TaxReport } from '../domain/tax-report.js';
import {
  computePerformanceSeries,
  buildSampleDates,
  type PerformancePeriod,
  type PerformancePoint,
  type SeriesCashFlow,
  type SeriesPosition,
} from '../domain/performance-series.js';
import { computeReturns, type ReturnsResult } from '../domain/returns.js';

export interface PortfolioNameReader {
  list(userId: string, includeArchived: boolean): Promise<{ id: string; name: string; preferred_headline_metric: string }[]>;
}

export interface ReportingServiceDeps {
  positions: PositionService;
  cashFlows: CashFlowRepository;
  taxEvents: TaxEventRepository;
  portfolios: PortfolioNameReader;
  fx: FxReader;
  quotes: QuoteReader;
  settings: SettingsReader;
}

export interface PerformanceReport {
  period: PerformancePeriod;
  reporting_currency: string;
  from: string;
  to: string;
  points: PerformancePoint[];
  /** Money-weighted (XIRR) and time-weighted return over the period, in percent. */
  returns: ReturnsResult;
}

/** Summary, holdings, allocation, and tax under a single consistent snapshot. */
export interface ReportingSnapshot {
  snapshot_at: string;
  reporting_currency: string;
  summary: PortfolioSummary;
  holdings: HoldingGroup[];
  allocation: AllocationReport;
  tax: TaxReport;
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

  /**
   * Gross-versus-after-tax reporting. The gross realized P&L is taken from the
   * authoritative summary (so the two never disagree); recorded broker tax events
   * are converted at their booking-date FX and reconciled into net actual tax and
   * realized P&L after actual tax. Gross figures keep their meaning unchanged.
   */
  async getTaxReport(userId: string, bearerToken: string, portfolioId?: string): Promise<TaxReport> {
    const [summary, events] = await Promise.all([
      this.getSummary(userId, bearerToken, portfolioId),
      this.deps.taxEvents.listForUser(userId, { portfolioId }),
    ]);
    return this.buildTaxReport(events, new Decimal(summary.realized_pnl), summary.reporting_currency, bearerToken);
  }

  /**
   * One internally consistent reporting snapshot: summary, holdings, allocation,
   * and tax computed from a single fetch of positions/flows/quotes/FX/tax events,
   * stamped with one `snapshot_at`. Reading the four reports separately can drift
   * if a quote refresh lands between requests; this derives them all from the
   * same in-memory data so they always reconcile.
   */
  async getSnapshot(userId: string, bearerToken: string, portfolioId?: string): Promise<ReportingSnapshot> {
    const [views, flows, settings, portfolios, events] = await Promise.all([
      this.deps.positions.listPositions(userId, bearerToken, portfolioId),
      this.deps.cashFlows.listForUser(userId, portfolioId),
      this.deps.settings.getUserSettings(bearerToken),
      this.deps.portfolios.list(userId, true),
      this.deps.taxEvents.listForUser(userId, { portfolioId }),
    ]);

    const reportingCurrency = settings.reportingCurrency;
    const snapshotAt = new Date().toISOString();
    const portfolioNames = new Map(portfolios.map((p) => [p.id, p.name]));
    const headlineMetric = portfolioId
      ? (portfolios.find((p) => p.id === portfolioId)?.preferred_headline_metric ?? null)
      : null;

    const [dividends, dividendsByInstrument] = await Promise.all([
      this.sumDividends(flows, reportingCurrency, bearerToken),
      this.dividendsByInstrument(flows, views, reportingCurrency, bearerToken),
    ]);

    const summary = computeSummary(views, dividends, reportingCurrency, snapshotAt, headlineMetric);
    const holdings = computeHoldings(views, portfolioNames, dividendsByInstrument);
    const allocation = computeAllocation(views, portfolioNames);
    const tax = await this.buildTaxReport(events, new Decimal(summary.realized_pnl), reportingCurrency, bearerToken);

    return { snapshot_at: snapshotAt, reporting_currency: reportingCurrency, summary, holdings, allocation, tax };
  }

  /** Converts recorded tax events at booking-date FX and reconciles into a tax report. */
  private async buildTaxReport(
    events: TaxEventRecord[],
    realizedPnl: Decimal,
    reportingCurrency: string,
    bearerToken: string,
  ): Promise<TaxReport> {
    const convert = await this.taxConverter(events, reportingCurrency, bearerToken);
    const converted: ConvertedTaxEvent[] = events.map((event) => ({
      component: event.component,
      direction: event.direction,
      amount: convert(new Decimal(event.amount), event.currency, event.booking_date),
      linked: event.transaction_id !== null || event.cash_flow_id !== null || event.position_id !== null,
    }));
    return computeTaxReport(realizedPnl, converted, reportingCurrency);
  }

  /**
   * Historical performance series for a portfolio (or the combined active set)
   * over a period: portfolio value, contributed capital, and cumulative P&L per
   * sample date, reconstructed from the ledger, cash flows, daily closes, and
   * daily FX. The last point reconciles with `getSummary`. Conversions follow
   * the same conventions as the live snapshot (see `computePerformanceSeries`).
   */
  async getPerformance(
    userId: string,
    bearerToken: string,
    period: PerformancePeriod,
    portfolioId?: string,
  ): Promise<PerformanceReport> {
    const [{ reportingCurrency, method, ledgers }, flows] = await Promise.all([
      this.deps.positions.listPositionLedgers(userId, bearerToken, portfolioId),
      this.deps.cashFlows.listForUser(userId, portfolioId),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const firstActivity = earliestActivity(ledgers, flows);
    const sampleDates = buildSampleDates(period, firstActivity, today);
    const from = sampleDates[0] ?? today;
    const to = sampleDates[sampleDates.length - 1] ?? today;

    // Daily closes per unique listing → a forward-fill price lookup.
    const listingIds = [...new Set(ledgers.map((l) => l.listingId))];
    const priceByListing = new Map<string, (date: string) => Decimal | null>();
    await Promise.all(
      listingIds.map(async (id) => {
        const points = await this.deps.quotes.getDailyHistory(id, from, to, bearerToken);
        priceByListing.set(id, lastOnOrBefore(points, (p: DailyClose) => p.price));
      }),
    );

    // Daily FX series for every currency in play → a forward-fill rate lookup.
    const currencies = new Set<string>([reportingCurrency]);
    for (const l of ledgers) currencies.add(l.listingCurrency);
    for (const f of flows) currencies.add(f.currency);
    const fxSeries = await this.deps.fx.getEurRateSeries([...currencies], from, to, bearerToken);
    const rateByCurrency = new Map<string, (date: string) => Decimal | null>();
    for (const [currency, points] of fxSeries) {
      rateByCurrency.set(currency, lastOnOrBefore(points, (p: RatePoint) => p.rate));
    }
    const rateOnOrBefore = (currency: string, date: string): Decimal | null =>
      rateByCurrency.get(currency)?.(date) ?? null;

    const positions: SeriesPosition[] = ledgers.map((l) => ({
      transactions: l.transactions,
      method,
      listingCurrency: l.listingCurrency,
      priceOnOrBefore: priceByListing.get(l.listingId) ?? (() => null),
    }));
    const cashFlows: SeriesCashFlow[] = flows.map((f) => ({
      type: f.type,
      amount: new Decimal(f.net_amount),
      currency: f.currency,
      valueDate: f.tax_relevant_value_date,
    }));

    const points = computePerformanceSeries({
      sampleDates,
      reportingCurrency,
      positions,
      cashFlows,
      rateOnOrBefore,
    });
    const returns = computeReturns({
      sampleDates,
      points,
      positions,
      cashFlows,
      reportingCurrency,
      rateOnOrBefore,
    });
    return { period, reporting_currency: reportingCurrency, from, to, points, returns };
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

  /** A booking-date FX converter for the currencies/dates of the given tax events. */
  private async taxConverter(
    events: TaxEventRecord[],
    reportingCurrency: string,
    bearerToken: string,
  ): Promise<(amount: Decimal, fromCurrency: string, bookingDate: string) => Decimal | null> {
    const pairs: DatedRateRequest[] = [];
    for (const event of events) {
      pairs.push({ currency: event.currency, date: event.booking_date });
      pairs.push({ currency: reportingCurrency, date: event.booking_date });
    }
    const rates = await this.deps.fx.getEurRatesAt(pairs, bearerToken);
    return makeDatedConverter(rates, reportingCurrency);
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

/** Earliest value date across all ledger transactions and cash flows, or null. */
function earliestActivity(
  ledgers: { transactions: { tax_relevant_value_date?: string }[] }[],
  flows: CashFlowRecord[],
): string | null {
  let earliest: string | null = null;
  const consider = (date: string | undefined) => {
    if (date && (earliest === null || date < earliest)) earliest = date;
  };
  for (const ledger of ledgers) for (const tx of ledger.transactions) consider(tx.tax_relevant_value_date);
  for (const flow of flows) consider(flow.tax_relevant_value_date);
  return earliest;
}

/**
 * Builds a forward-fill lookup over an ascending, anchor-prefixed series: the
 * value of the most recent point on or before a date, or null if none precedes
 * it. Binary search keeps the per-date cost logarithmic across many samples.
 */
function lastOnOrBefore<T extends { date: string }>(
  points: T[],
  pick: (point: T) => string,
): (date: string) => Decimal | null {
  return (date: string) => {
    let lo = 0;
    let hi = points.length - 1;
    let found: string | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const point = points[mid];
      if (point && point.date <= date) {
        found = pick(point);
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found === null ? null : new Decimal(found);
  };
}
