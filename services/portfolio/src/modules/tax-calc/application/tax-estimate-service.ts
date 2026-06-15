import Decimal from 'decimal.js';
import { computeRealization, type RealizationResult } from '../../positions/domain/realization.js';
import { makeDatedConverter } from '../../positions/domain/currency.js';
import type {
  DatedRateRequest,
  FxReader,
  ListingReader,
  ListingSummary,
  PositionRepository,
} from '../../positions/application/ports.js';
import type { PortfolioTaxSettingsRepository } from '../../tax-settings/application/ports.js';
import type { UserTaxSettingsRepository } from '../../tax-settings/application/ports.js';
import type { TaxRule } from '../../tax-rules/application/ports.js';
import type { TaxEventRecord, TaxEventRepository } from '../../tax-events/application/ports.js';
import {
  computeGermanSecuritiesTax,
  type ExemptionOrderEntry,
  type GermanSecuritiesResult,
  type RealizedSecuritySale,
} from '../domain/german-securities.js';
import {
  computeGermanCryptoTax,
  type CryptoDisposalLot,
  type GermanCryptoResult,
} from '../domain/german-crypto.js';

export interface TaxRuleReader {
  getRule(ruleKey: string): Promise<TaxRule | null>;
}

export interface TaxEstimateDeps {
  positions: PositionRepository;
  listings: ListingReader;
  fx: FxReader;
  portfolioTax: PortfolioTaxSettingsRepository;
  userTax: UserTaxSettingsRepository;
  rules: TaxRuleReader;
  taxEvents: TaxEventRepository;
}

export interface SecuritiesEstimate {
  portfolio_id: string;
  portfolio_name: string;
  rule_key: string;
  result: GermanSecuritiesResult;
}

export interface CryptoEstimate {
  portfolio_id: string;
  portfolio_name: string;
  rule_key: string;
  result: GermanCryptoResult;
}

export interface UnsupportedEstimate {
  portfolio_id: string;
  portfolio_name: string;
  reason: string;
}

export interface TaxEstimate {
  tax_currency: string;
  /** False when at least one realized amount lacked a historical FX rate (totals understated). */
  fx_complete: boolean;
  securities: SecuritiesEstimate[];
  crypto: CryptoEstimate[];
  unsupported: UnsupportedEstimate[];
}

/** One configured portfolio paired with its resolved rule and relevant positions. */
interface WorkItem {
  portfolioId: string;
  portfolioName: string;
  rule: TaxRule;
  taxSettings: Record<string, unknown>;
  /** Positions whose asset class the rule covers, with their FIFO realization. */
  positions: { realization: RealizationResult }[];
}

/**
 * Computes the German tax ESTIMATE (securities + crypto) from real portfolio data.
 * It runs the pure engines (modules/tax-calc/domain) over each configured
 * portfolio: realized P&L is replayed with FIFO — the method German tax requires —
 * and converted to the tax currency at each disposal's value date, then fed to the
 * matching engine. It never writes anything and never touches the recorded-tax
 * ledger; recorded refunds only flow in as `bookedTaxCorrection`.
 */
export class TaxEstimateService {
  constructor(private readonly deps: TaxEstimateDeps) {}

  async getEstimate(userId: string, bearerToken: string, portfolioId?: string): Promise<TaxEstimate> {
    const userTax = await this.deps.userTax.get(userId);
    const taxCurrency = pickString(userTax?.settings.taxCurrency) ?? 'EUR';
    const churchRate =
      userTax?.settings.churchTaxEnabled === true && userTax.settings.churchTaxRate != null
        ? new Decimal(String(userTax.settings.churchTaxRate))
        : null;

    const configs = (await this.deps.portfolioTax.listForUser(userId, portfolioId)).filter((c) => c.tax_rule_key);
    const empty: TaxEstimate = { tax_currency: taxCurrency, fx_complete: true, securities: [], crypto: [], unsupported: [] };
    if (configs.length === 0) return empty;

    // Resolve each distinct rule once.
    const rules = new Map<string, TaxRule | null>();
    for (const key of new Set(configs.map((c) => c.tax_rule_key!))) {
      rules.set(key, await this.deps.rules.getRule(key));
    }

    // Load positions, listings, and transactions for the scope.
    const positions = await this.deps.positions.listPositionsForUser(userId, portfolioId);
    const listingIds = [...new Set(positions.map((p) => p.listing_id))];
    const [listings, txnsByPosition, events] = await Promise.all([
      this.deps.listings.getListings(listingIds, bearerToken),
      this.deps.positions.listTransactionsForPositions(positions.map((p) => p.id)),
      this.deps.taxEvents.listForUser(userId, { portfolioId }),
    ]);
    const byPortfolio = groupBy(positions, (p) => p.portfolio_id);
    const refundedByPortfolio = groupRefunded(events);

    const unsupported: UnsupportedEstimate[] = [];
    const work: WorkItem[] = [];

    for (const config of configs) {
      const rule = rules.get(config.tax_rule_key!) ?? null;
      const members = byPortfolio.get(config.portfolio_id) ?? [];
      if (!rule) {
        unsupported.push({ portfolio_id: config.portfolio_id, portfolio_name: config.name, reason: 'unknown_tax_rule' });
        continue;
      }
      // Fund/ETF tax handling is deferred (decision): flag, do not estimate.
      if (members.some((p) => listings.get(p.listing_id)?.asset_type === 'fund')) {
        unsupported.push({ portfolio_id: config.portfolio_id, portfolio_name: config.name, reason: 'fund_tax_deferred' });
      }

      const relevant = members.filter((p) => isCovered(rule, listings.get(p.listing_id)));
      const withRealization = relevant
        .map((p) => ({ realization: computeRealization(txnsByPosition.get(p.id) ?? [], 'fifo') }))
        .filter((p) => !p.realization.invalid);

      work.push({
        portfolioId: config.portfolio_id,
        portfolioName: config.name,
        rule,
        taxSettings: config.tax_settings,
        positions: withRealization,
      });
    }

    // One FX fetch for every (currency, date) the conversions will need.
    const convert = makeDatedConverter(
      await this.deps.fx.getEurRatesAt(collectRateRequests(work, refundedByPortfolio, taxCurrency), bearerToken),
      taxCurrency,
    );
    let fxComplete = true;
    const note = () => {
      fxComplete = false;
    };

    const securities: SecuritiesEstimate[] = [];
    const crypto: CryptoEstimate[] = [];

    for (const item of work) {
      if (item.rule.calculation_engine_key === 'germanCapitalGainsTax') {
        const sales = buildSecuritySales(item, convert, note);
        const bookedTaxCorrection = sumConverted(refundedByPortfolio.get(item.portfolioId) ?? [], convert, note);
        securities.push({
          portfolio_id: item.portfolioId,
          portfolio_name: item.portfolioName,
          rule_key: item.rule.rule_key,
          result: computeGermanSecuritiesTax({
            taxCurrency,
            ruleKey: item.rule.rule_key,
            ruleVersion: item.rule.rule_version,
            params: {
              capitalGainsTaxRate: decParam(item.rule.parameters, 'capitalGainsTaxRate', '0.25'),
              solidaritySurchargeRate: decParam(item.rule.parameters, 'solidaritySurchargeRate', '0.055'),
              churchTaxRate: churchRate,
            },
            automaticTaxWithholding: item.taxSettings.automaticTaxWithholding === true,
            exemptionOrderHistory: parseExemptionOrders(item.taxSettings.exemptionOrderHistory),
            sales,
            bookedTaxCorrection,
          }),
        });
      } else if (item.rule.calculation_engine_key === 'germanCryptoTaxableGainOnly') {
        crypto.push({
          portfolio_id: item.portfolioId,
          portfolio_name: item.portfolioName,
          rule_key: item.rule.rule_key,
          result: computeGermanCryptoTax({
            taxCurrency,
            ruleKey: item.rule.rule_key,
            ruleVersion: item.rule.rule_version,
            params: {
              holdingPeriodMonths: numberParam(item.rule.parameters, 'holdingPeriodMonths', 12),
              annualFreeLimit: decParam(item.rule.parameters, 'taxFreeLimit', '0'),
            },
            lots: buildCryptoLots(item, convert, note),
          }),
        });
      } else {
        unsupported.push({
          portfolio_id: item.portfolioId,
          portfolio_name: item.portfolioName,
          reason: `unsupported_engine:${item.rule.calculation_engine_key}`,
        });
      }
    }

    return { tax_currency: taxCurrency, fx_complete: fxComplete, securities, crypto, unsupported };
  }
}

type Convert = (amount: Decimal, fromCurrency: string, valueDate: string) => Decimal | null;

/** Per-sell realized P&L, converted to the tax currency at the sell's value date. */
function buildSecuritySales(item: WorkItem, convert: Convert, onMissing: () => void): RealizedSecuritySale[] {
  const sales: RealizedSecuritySale[] = [];
  for (const { realization } of item.positions) {
    for (const tx of realization.byTransaction) {
      if (tx.side !== 'sell' || tx.realizedPnl === null) continue;
      const converted = convert(tx.realizedPnl, tx.currency, tx.valueDate);
      if (converted === null) {
        onMissing();
        continue;
      }
      sales.push({
        sellTransactionId: tx.transactionId,
        date: tx.valueDate,
        assetClass: 'equity',
        economicGainLoss: converted,
        taxRelevantGainLoss: converted,
      });
    }
  }
  return sales;
}

/** Per-lot realized P&L, converted to the tax currency at the disposal date. */
function buildCryptoLots(item: WorkItem, convert: Convert, onMissing: () => void): CryptoDisposalLot[] {
  const lots: CryptoDisposalLot[] = [];
  for (const { realization } of item.positions) {
    for (const c of realization.lotConsumptions) {
      const converted = convert(c.realizedGainLoss, c.currency, c.disposalDate);
      if (converted === null) {
        onMissing();
        continue;
      }
      lots.push({
        sellTransactionId: c.sellTransactionId,
        acquisitionDate: c.acquisitionDate,
        disposalDate: c.disposalDate,
        gainLoss: converted,
      });
    }
  }
  return lots;
}

function sumConverted(events: TaxEventRecord[], convert: Convert, onMissing: () => void): Decimal {
  let total = new Decimal(0);
  for (const e of events) {
    const converted = convert(new Decimal(e.amount), e.currency, e.booking_date);
    if (converted === null) {
      onMissing();
      continue;
    }
    total = total.plus(converted);
  }
  return total;
}

function collectRateRequests(
  work: WorkItem[],
  refundedByPortfolio: Map<string, TaxEventRecord[]>,
  taxCurrency: string,
): DatedRateRequest[] {
  const out: DatedRateRequest[] = [];
  const add = (currency: string, date: string) => {
    if (!date) return;
    out.push({ currency, date }, { currency: taxCurrency, date });
  };
  for (const item of work) {
    for (const { realization } of item.positions) {
      for (const tx of realization.byTransaction) {
        if (tx.side === 'sell') add(tx.currency, tx.valueDate);
      }
      for (const c of realization.lotConsumptions) add(c.currency, c.disposalDate);
    }
  }
  for (const events of refundedByPortfolio.values()) {
    for (const e of events) add(e.currency, e.booking_date);
  }
  return out;
}

/** Whether a listing's asset class is one the rule covers. */
function isCovered(rule: TaxRule, listing: ListingSummary | undefined): boolean {
  return listing !== undefined && rule.asset_classes.includes(listing.asset_type);
}

function parseExemptionOrders(raw: unknown): ExemptionOrderEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ExemptionOrderEntry[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.validFrom !== 'string' || e.amount == null) continue;
    out.push({
      validFrom: e.validFrom,
      validTo: typeof e.validTo === 'string' ? e.validTo : null,
      amount: new Decimal(String(e.amount)),
    });
  }
  return out;
}

function decParam(params: Record<string, unknown>, key: string, fallback: string): Decimal {
  const v = params[key];
  return new Decimal(v == null ? fallback : String(v));
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(params[key]);
  return Number.isFinite(v) ? v : fallback;
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k) ?? [];
    list.push(item);
    out.set(k, list);
  }
  return out;
}

/** Refunded tax events grouped by their owning portfolio (the only correction input). */
function groupRefunded(events: TaxEventRecord[]): Map<string, TaxEventRecord[]> {
  const out = new Map<string, TaxEventRecord[]>();
  for (const e of events) {
    if (e.direction !== 'refunded' || !e.portfolio_id) continue;
    const list = out.get(e.portfolio_id) ?? [];
    list.push(e);
    out.set(e.portfolio_id, list);
  }
  return out;
}
