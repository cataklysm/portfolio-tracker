import Decimal from 'decimal.js';
import { AppError } from '@portfolio/platform';
import type {
  CashFlowRecord,
  CashFlowRepository,
  CashFlowType,
  CashFlowView,
  DatedRateRequest,
  FxRateReader,
  IncomeTaxComponentInput,
  NewCashFlow,
  NewIncomeTaxComponent,
  PositionQuantityReader,
  UpdateCashFlow,
} from './ports.js';
import { computeFxComparison, type EurRateLookup } from '../domain/fx-comparison.js';

/** Accepted absolute drift between a client-supplied source net and the computed identity. */
const SOURCE_NET_TOLERANCE = new Decimal('0.000001');

export interface CreateCashFlowInput {
  type: CashFlowType;
  grossAmount: string;
  withholdingTax?: string;
  fee?: string;
  currency: string;
  paymentDate: string;
  taxRelevantValueDate?: string;
  positionId?: string | null;
  note?: string | null;
  // Event linkage (dividend/cash-in-lieu booked from an `events` corporate action).
  sourceEventId?: string | null;
  sourceEventVersion?: number | null;
  sourceEventType?: string | null;
  exDate?: string | null;
  amountPerShare?: string | null;
  // Foreign-currency source economics (optional). When `sourceCurrency` differs from
  // `currency` the full source breakdown and broker FX are required; same-currency
  // bookings omit this layer entirely.
  sourceCurrency?: string | null;
  sourceGrossAmount?: string | null;
  sourceWithholdingTax?: string | null;
  sourceFee?: string | null;
  /** Optional client-supplied source net; validated against the identity, then recomputed. */
  sourceNetAmount?: string | null;
  sourceAmountPerShare?: string | null;
  brokerFxRate?: string | null;
  /** Optional; when given must equal sourceCurrency / settlement currency respectively. */
  brokerFxFromCurrency?: string | null;
  brokerFxToCurrency?: string | null;
  brokerFxRateDate?: string | null;
  // Withheld-tax components (income types only); set withholding_tax = their sum
  // and persist linked tax events. Mutually exclusive with `withholdingTax`.
  taxComponents?: IncomeTaxComponentInput[];
}

/** The resolved source-economics + broker-FX columns persisted with a cash flow. */
interface SourceEconomics {
  sourceCurrency: string | null;
  sourceGrossAmount: string | null;
  sourceWithholdingTax: string | null;
  sourceFee: string | null;
  sourceNetAmount: string | null;
  sourceAmountPerShare: string | null;
  brokerFxRate: string | null;
  brokerFxFromCurrency: string | null;
  brokerFxToCurrency: string | null;
  brokerFxRateDate: string | null;
}

const NO_SOURCE_ECONOMICS: SourceEconomics = {
  sourceCurrency: null,
  sourceGrossAmount: null,
  sourceWithholdingTax: null,
  sourceFee: null,
  sourceNetAmount: null,
  sourceAmountPerShare: null,
  brokerFxRate: null,
  brokerFxFromCurrency: null,
  brokerFxToCurrency: null,
  brokerFxRateDate: null,
};

/** Resolved + computed event-linkage fields persisted with the cash flow. */
interface EventLinkage {
  sourceEventId: string | null;
  sourceEventVersion: number | null;
  sourceEventType: string | null;
  exDate: string | null;
  amountPerShare: string | null;
  quantityAtExDate: string | null;
  expectedGrossAmount: string | null;
}

const NO_EVENT_LINKAGE: EventLinkage = {
  sourceEventId: null,
  sourceEventVersion: null,
  sourceEventType: null,
  exDate: null,
  amountPerShare: null,
  quantityAtExDate: null,
  expectedGrossAmount: null,
};

export interface UpdateCashFlowInput {
  grossAmount?: string;
  withholdingTax?: string;
  fee?: string;
  currency?: string;
  paymentDate?: string;
  taxRelevantValueDate?: string;
  note?: string | null;
}

// Position linkage per type (mirrors the cash_flows table CHECK):
//   required  — dividend & cash_in_lieu must attach to a position
//   optional  — interest is portfolio-level by default, but may attach to one
//   forbidden — deposit & withdrawal are portfolio-level only (any other type)
const POSITION_REQUIRED: ReadonlySet<CashFlowType> = new Set(['dividend', 'cash_in_lieu']);
const POSITION_OPTIONAL: ReadonlySet<CashFlowType> = new Set(['interest']);
// Types that represent income and may carry withheld-tax components.
const INCOME_TYPES: ReadonlySet<CashFlowType> = new Set(['dividend', 'cash_in_lieu', 'interest']);

/**
 * CRUD for portfolio cash flows (dividends, deposits, withdrawals, cash-in-lieu).
 * Net amount is always derived server-side as gross − withholding − fee; the
 * position linkage and ownership are enforced before any write.
 */
export class CashFlowService {
  constructor(
    private readonly repo: CashFlowRepository,
    /** Resolves held quantity at an ex-date for event-linked dividend bookings. */
    private readonly positions?: PositionQuantityReader,
    /** Reads reference FX for the broker-vs-reference comparison on read; optional. */
    private readonly fx?: FxRateReader,
  ) {}

  async list(
    userId: string,
    portfolioId: string,
    filter: { types?: CashFlowType[]; positionId?: string; dateFrom?: string; dateTo?: string },
    bearerToken?: string,
  ): Promise<CashFlowView[]> {
    const records = await this.repo.listForPortfolio(userId, portfolioId, filter);
    return this.enrich(records, bearerToken);
  }

  /**
   * Adds the broker-vs-reference FX comparison to each record. Foreign bookings need
   * the EUR-based source + settlement rates at the broker FX date (or value date),
   * fetched in one batched read; without an FX reader or token, foreign rows report
   * `unavailable` and same-currency rows `same_currency`.
   */
  private async enrich(records: CashFlowRecord[], bearerToken?: string): Promise<CashFlowView[]> {
    const foreign = records.filter((r) => r.source_currency !== null && r.source_currency !== r.currency);
    if (!this.fx || !bearerToken || foreign.length === 0) {
      const noRate: EurRateLookup = () => null;
      return records.map((r) => ({ ...r, ...computeFxComparison(r, noRate) }));
    }
    const requests: DatedRateRequest[] = [];
    for (const r of foreign) {
      const date = r.broker_fx_rate_date ?? r.tax_relevant_value_date;
      requests.push({ currency: r.source_currency as string, date }, { currency: r.currency, date });
    }
    const map = await this.fx.getEurRatesAt(requests, bearerToken);
    const rate: EurRateLookup = (cur, date) => (cur === 'EUR' ? '1' : (map.get(`${cur}@${date}`) ?? null));
    return records.map((r) => ({ ...r, ...computeFxComparison(r, rate) }));
  }

  async create(userId: string, portfolioId: string, input: CreateCashFlowInput): Promise<CashFlowRecord> {
    if (!(await this.repo.assertPortfolioOwned(userId, portfolioId))) {
      throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
    }

    const positionId = await this.resolvePositionLink(userId, portfolioId, input.type, input.positionId ?? null);
    const gross = amount(input.grossAmount, 'gross_amount');
    const fee = nonNegative(input.fee ?? '0', 'fee');
    const paymentDate = requireDate(input.paymentDate, 'payment_date');
    const taxRelevantValueDate = requireDate(input.taxRelevantValueDate ?? paymentDate, 'tax_relevant_value_date');
    const currency = normalizeCurrency(input.currency);
    const sourceCurrency = input.sourceCurrency?.trim() ? normalizeCurrency(input.sourceCurrency) : null;
    const { withholding, sourceWithholding, components } = this.resolveWithholding(input, currency, sourceCurrency);
    const source = resolveSourceEconomics(input, currency, sourceCurrency, sourceWithholding);
    const link = await this.resolveEventLinkage(userId, input, positionId);

    const newCashFlow: NewCashFlow = {
      userId,
      portfolioId,
      positionId,
      type: input.type,
      grossAmount: gross.toString(),
      withholdingTax: withholding.toString(),
      fee: fee.toString(),
      netAmount: gross.minus(withholding).minus(fee).toString(),
      currency,
      paymentDate,
      taxRelevantValueDate,
      note: input.note?.trim() || null,
      ...source,
      ...link,
    };
    const recordCreated = (created: CashFlowRecord) => ({
      userId,
      entityType: 'cash_flow' as const,
      entityId: created.id,
      action: 'created' as const,
      after: created,
      portfolioId: created.portfolio_id,
      positionId: created.position_id,
    });

    try {
      return components.length > 0
        ? await this.repo.createWithTaxEvents(newCashFlow, components, recordCreated)
        : await this.repo.create(newCashFlow, recordCreated);
    } catch (err) {
      // The partial unique index rejects booking the same event twice for a position.
      if (isUniqueViolation(err, 'portfolio_cash_flows_event_booking_unique_idx')) {
        throw new AppError({
          status: 409,
          code: 'duplicate_event_booking',
          title: 'Conflict',
          detail: 'This event is already booked for the position',
        });
      }
      throw err;
    }
  }

  /**
   * Resolves the withheld tax in both layers: either the explicit `withholding_tax`
   * / `source_withholding_tax` (no components) or the per-component sums. Components
   * are income-types only and mutually exclusive with an explicit withholding;
   * each is normalized to source + settlement amounts. `sourceWithholding` is null
   * when the booking carries no source layer.
   */
  private resolveWithholding(
    input: CreateCashFlowInput,
    currency: string,
    sourceCurrency: string | null,
  ): { withholding: Decimal; sourceWithholding: Decimal | null; components: NewIncomeTaxComponent[] } {
    const provided = input.taxComponents ?? [];
    if (provided.length === 0) {
      const withholding = nonNegative(input.withholdingTax ?? '0', 'withholding_tax');
      const sourceWithholding =
        input.sourceWithholdingTax != null ? nonNegative(input.sourceWithholdingTax, 'source_withholding_tax') : null;
      return { withholding, sourceWithholding, components: [] };
    }
    if (!INCOME_TYPES.has(input.type)) {
      throw AppError.badRequest('tax_components_unsupported', 'tax_components are only valid for income cash flows (dividend, cash_in_lieu, interest)');
    }
    if (input.withholdingTax != null) {
      throw AppError.badRequest('withholding_conflict', 'Provide either withholding_tax or tax_components, not both');
    }
    if (input.sourceWithholdingTax != null) {
      throw AppError.badRequest('source_withholding_conflict', 'source_withholding_tax is derived from tax_components and must not be supplied with them');
    }
    let withholding = new Decimal(0);
    let sourceWithholding = new Decimal(0);
    const components: NewIncomeTaxComponent[] = [];
    for (const c of provided) {
      const { component, settlement, source } = normalizeTaxComponent(c, currency, sourceCurrency);
      withholding = withholding.plus(settlement);
      sourceWithholding = sourceWithholding.plus(source);
      components.push(component);
    }
    return { withholding, sourceWithholding, components };
  }

  /**
   * Resolves and computes the event-linkage fields. With no `source_event_id` the
   * cash flow is a plain manual booking (all null). When set, it is only valid for
   * position-linked income (dividend/cash-in-lieu), requires an ex-date, and the
   * held quantity at the ex-date (and expected gross, if a per-share amount is
   * given) is computed authoritatively from the position ledger.
   */
  private async resolveEventLinkage(
    userId: string,
    input: CreateCashFlowInput,
    positionId: string | null,
  ): Promise<EventLinkage> {
    const sourceEventId = input.sourceEventId?.trim() || null;
    if (!sourceEventId) return NO_EVENT_LINKAGE;

    if (!POSITION_REQUIRED.has(input.type)) {
      throw AppError.badRequest('event_link_unsupported', 'source_event_id is only valid for dividend or cash_in_lieu cash flows');
    }
    if (!input.exDate) throw AppError.badRequest('ex_date_required', 'source_event_id requires ex_date');
    const exDate = requireDate(input.exDate, 'ex_date');
    const amountPerShare = input.amountPerShare != null ? nonNegative(input.amountPerShare, 'amount_per_share').toString() : null;

    let quantityAtExDate: string | null = null;
    let expectedGrossAmount: string | null = null;
    // positionId is guaranteed non-null here (dividend/cash_in_lieu require it).
    if (positionId && this.positions) {
      quantityAtExDate = await this.positions.getOpenQuantityAsOf(userId, positionId, exDate);
      if (amountPerShare !== null) {
        expectedGrossAmount = new Decimal(amountPerShare).times(new Decimal(quantityAtExDate)).toString();
      }
    }
    return {
      sourceEventId,
      sourceEventVersion: input.sourceEventVersion ?? null,
      sourceEventType: input.sourceEventType?.trim() || null,
      exDate,
      amountPerShare,
      quantityAtExDate,
      expectedGrossAmount,
    };
  }

  async update(userId: string, id: string, input: UpdateCashFlowInput): Promise<CashFlowRecord> {
    const existing = await this.repo.get(userId, id);
    if (!existing) throw AppError.notFound('cash_flow_not_found', 'Cash flow not found');

    // withholding_tax is derived from linked income tax components when the booking
    // created them; patching it directly would desync the cash flow from its
    // generated tax events.
    if (input.withholdingTax !== undefined && (await this.repo.hasManagedTaxEvents(userId, id))) {
      throw new AppError({
        status: 409,
        code: 'withholding_managed',
        title: 'Conflict',
        detail: 'withholding_tax is set from linked income tax components and cannot be patched directly; recreate the booking to change it',
      });
    }

    const patch: UpdateCashFlow = {};
    if (input.currency !== undefined) patch.currency = normalizeCurrency(input.currency);
    if (input.paymentDate !== undefined) patch.paymentDate = requireDate(input.paymentDate, 'payment_date');
    if (input.taxRelevantValueDate !== undefined) {
      patch.taxRelevantValueDate = requireDate(input.taxRelevantValueDate, 'tax_relevant_value_date');
    }
    if (input.note !== undefined) patch.note = input.note?.trim() || null;

    // Recompute net whenever any of its components change.
    if (input.grossAmount !== undefined || input.withholdingTax !== undefined || input.fee !== undefined) {
      const gross = amount(input.grossAmount ?? existing.gross_amount, 'gross_amount');
      const withholding = nonNegative(input.withholdingTax ?? existing.withholding_tax, 'withholding_tax');
      const fee = nonNegative(input.fee ?? existing.fee, 'fee');
      patch.grossAmount = gross.toString();
      patch.withholdingTax = withholding.toString();
      patch.fee = fee.toString();
      patch.netAmount = gross.minus(withholding).minus(fee).toString();
    }

    const updated = await this.repo.update(userId, id, patch, (row) =>
      row
        ? {
            userId,
            entityType: 'cash_flow',
            entityId: id,
            action: 'updated',
            before: existing,
            after: row,
            portfolioId: row.portfolio_id,
            positionId: row.position_id,
          }
        : null,
    );
    if (!updated) throw AppError.notFound('cash_flow_not_found', 'Cash flow not found');
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.repo.get(userId, id);
    if (!existing) throw AppError.notFound('cash_flow_not_found', 'Cash flow not found');
    const deleted = await this.repo.delete(userId, id, (ok) =>
      ok
        ? {
            userId,
            entityType: 'cash_flow',
            entityId: id,
            action: 'deleted',
            before: existing,
            portfolioId: existing.portfolio_id,
            positionId: existing.position_id,
          }
        : null,
    );
    if (!deleted) throw AppError.notFound('cash_flow_not_found', 'Cash flow not found');
  }

  /** Enforces the type→position-linkage rule and that any position is in this portfolio. */
  private async resolvePositionLink(
    userId: string,
    portfolioId: string,
    type: CashFlowType,
    positionId: string | null,
  ): Promise<string | null> {
    const required = POSITION_REQUIRED.has(type);
    const optional = POSITION_OPTIONAL.has(type);
    if (positionId) {
      if (!required && !optional) {
        throw AppError.badRequest('position_not_allowed', `${type} cash flows are portfolio-level and cannot reference a position`);
      }
      const owningPortfolio = await this.repo.positionPortfolio(userId, positionId);
      if (owningPortfolio === null) throw AppError.notFound('position_not_found', 'Position not found');
      if (owningPortfolio !== portfolioId) {
        throw AppError.badRequest('position_portfolio_mismatch', 'Position does not belong to this portfolio');
      }
      return positionId;
    }
    if (required) {
      throw AppError.badRequest('position_required', `${type} cash flows must reference a position`);
    }
    return null;
  }
}

/** True for a Postgres unique-violation (23505) raised by the named constraint/index. */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === constraint;
}

function amount(raw: string, field: string): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    throw AppError.badRequest('invalid_amount', `${field} must be a number`);
  }
  if (!value.isFinite()) throw AppError.badRequest('invalid_amount', `${field} must be a finite number`);
  return value;
}

function nonNegative(raw: string, field: string): Decimal {
  const value = amount(raw, field);
  if (value.lt(0)) throw AppError.badRequest('invalid_amount', `${field} must not be negative`);
  return value;
}

function requireDate(raw: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw AppError.badRequest('invalid_date', `${field} must be YYYY-MM-DD`);
  return raw;
}

function normalizeCurrency(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw AppError.badRequest('invalid_currency', 'currency must be a 3-letter code');
  return code;
}

function positive(raw: string, field: string): Decimal {
  const value = amount(raw, field);
  if (value.lte(0)) throw AppError.badRequest('invalid_amount', `${field} must be greater than zero`);
  return value;
}

const SOURCE_FIELDS = [
  'sourceGrossAmount',
  'sourceWithholdingTax',
  'sourceFee',
  'sourceNetAmount',
  'sourceAmountPerShare',
  'brokerFxRate',
  'brokerFxFromCurrency',
  'brokerFxToCurrency',
  'brokerFxRateDate',
] as const;

/**
 * Resolves the source-economics + broker-FX columns. A booking is "foreign" only
 * when `sourceCurrency` is set and differs from the settlement `currency`; then the
 * full source breakdown and a coherent broker FX (direction source->settlement) are
 * required and `source_net` is recomputed server-side. Same-currency bookings carry
 * no source layer (prefer-omit); a source currency with no settlement difference and
 * a broker FX rate is rejected as nonsensical.
 */
function resolveSourceEconomics(
  input: CreateCashFlowInput,
  currency: string,
  sourceCurrency: string | null,
  sourceWithholding: Decimal | null,
): SourceEconomics {
  const anySourceField = SOURCE_FIELDS.some((f) => input[f] != null);

  if (sourceCurrency === null) {
    if (anySourceField) {
      throw AppError.badRequest('source_currency_required', 'source_currency is required when any source amount or broker FX field is given');
    }
    return NO_SOURCE_ECONOMICS;
  }

  if (sourceCurrency === currency) {
    if (input.brokerFxRate != null) {
      throw AppError.badRequest('broker_fx_not_applicable', 'broker_fx_rate does not apply when source_currency equals the settlement currency');
    }
    // Same-currency source layer adds nothing — collapse to omit it.
    return NO_SOURCE_ECONOMICS;
  }

  // Foreign: source_currency differs from settlement currency.
  if (input.sourceGrossAmount == null) {
    throw AppError.badRequest('source_gross_required', 'source_gross_amount is required for a foreign-currency booking');
  }
  if (sourceWithholding === null) {
    throw AppError.badRequest('source_withholding_required', 'source_withholding_tax (or tax_components) is required for a foreign-currency booking');
  }
  const sourceGross = nonNegative(input.sourceGrossAmount, 'source_gross_amount');
  const sourceFee = input.sourceFee != null ? nonNegative(input.sourceFee, 'source_fee') : new Decimal(0);
  const computedNet = sourceGross.minus(sourceWithholding).minus(sourceFee);
  if (computedNet.lt(0)) {
    throw AppError.badRequest('source_net_negative', 'source_net_amount (gross − withholding − fee) must not be negative');
  }
  if (input.sourceNetAmount != null) {
    const supplied = nonNegative(input.sourceNetAmount, 'source_net_amount');
    if (supplied.minus(computedNet).abs().gt(SOURCE_NET_TOLERANCE)) {
      throw AppError.badRequest('source_net_mismatch', 'source_net_amount must equal source_gross_amount − source_withholding_tax − source_fee');
    }
  }

  const brokerFxRate = input.brokerFxRate != null ? positive(input.brokerFxRate, 'broker_fx_rate') : null;
  if (brokerFxRate === null) {
    throw AppError.badRequest('broker_fx_required', 'broker_fx_rate is required for a foreign-currency booking');
  }
  if (input.brokerFxRateDate == null) {
    throw AppError.badRequest('broker_fx_rate_date_required', 'broker_fx_rate_date is required for a foreign-currency booking');
  }
  const brokerFxRateDate = requireDate(input.brokerFxRateDate, 'broker_fx_rate_date');
  if (input.brokerFxFromCurrency != null && normalizeCurrency(input.brokerFxFromCurrency) !== sourceCurrency) {
    throw AppError.badRequest('broker_fx_direction_mismatch', 'broker_fx_from_currency must equal source_currency');
  }
  if (input.brokerFxToCurrency != null && normalizeCurrency(input.brokerFxToCurrency) !== currency) {
    throw AppError.badRequest('broker_fx_direction_mismatch', 'broker_fx_to_currency must equal the settlement currency');
  }
  const sourceAmountPerShare =
    input.sourceAmountPerShare != null ? nonNegative(input.sourceAmountPerShare, 'source_amount_per_share').toString() : null;

  return {
    sourceCurrency,
    sourceGrossAmount: sourceGross.toString(),
    sourceWithholdingTax: sourceWithholding.toString(),
    sourceFee: sourceFee.toString(),
    sourceNetAmount: computedNet.toString(),
    sourceAmountPerShare,
    brokerFxRate: brokerFxRate.toString(),
    brokerFxFromCurrency: sourceCurrency,
    brokerFxToCurrency: currency,
    brokerFxRateDate,
  };
}

/**
 * Normalizes a supplied tax component into source + settlement amounts. The legacy
 * `{ amount, currency }` shape is accepted only for same-currency bookings (source =
 * settlement); the `{ sourceAmount, settlementAmount, … }` shape is required when the
 * booking is foreign. Settlement currency must equal the cash-flow currency and the
 * source currency must equal the cash-flow source currency.
 */
function normalizeTaxComponent(
  c: IncomeTaxComponentInput,
  currency: string,
  sourceCurrency: string | null,
): { component: NewIncomeTaxComponent; settlement: Decimal; source: Decimal } {
  const bookingDate = requireDate(c.bookingDate, 'tax_component.booking_date');
  const effectiveSource = sourceCurrency ?? currency;
  const isCrossShape =
    c.sourceAmount != null || c.settlementAmount != null || c.sourceCurrency != null || c.settlementCurrency != null;

  if (!isCrossShape) {
    if (c.amount == null || c.currency == null) {
      throw AppError.badRequest('tax_component_invalid', 'tax component requires either { amount, currency } or { sourceAmount, sourceCurrency, settlementAmount, settlementCurrency }');
    }
    if (normalizeCurrency(c.currency) !== currency) {
      throw AppError.badRequest('tax_component_currency_mismatch', 'Each tax component must be in the cash-flow settlement currency');
    }
    if (effectiveSource !== currency) {
      throw AppError.badRequest('tax_component_source_required', 'A foreign-currency booking requires source/settlement tax components');
    }
    const amt = nonNegative(c.amount, 'tax_component.amount');
    return {
      component: { component: c.component, sourceAmount: amt.toString(), sourceCurrency: currency, settlementAmount: amt.toString(), settlementCurrency: currency, bookingDate },
      settlement: amt,
      source: amt,
    };
  }

  if (c.sourceAmount == null || c.sourceCurrency == null || c.settlementAmount == null || c.settlementCurrency == null) {
    throw AppError.badRequest('tax_component_invalid', 'cross-currency tax component requires sourceAmount, sourceCurrency, settlementAmount and settlementCurrency');
  }
  const sc = normalizeCurrency(c.sourceCurrency);
  const stc = normalizeCurrency(c.settlementCurrency);
  if (stc !== currency) {
    throw AppError.badRequest('tax_component_currency_mismatch', 'tax component settlement currency must equal the cash-flow currency');
  }
  if (sc !== effectiveSource) {
    throw AppError.badRequest('tax_component_currency_mismatch', 'tax component source currency must equal the cash-flow source currency');
  }
  const source = nonNegative(c.sourceAmount, 'tax_component.source_amount');
  const settlement = nonNegative(c.settlementAmount, 'tax_component.settlement_amount');
  return {
    component: { component: c.component, sourceAmount: source.toString(), sourceCurrency: sc, settlementAmount: settlement.toString(), settlementCurrency: stc, bookingDate },
    settlement,
    source,
  };
}
