import Decimal from 'decimal.js';
import { AppError } from '@portfolio/platform';
import type { TaxComponent } from '../../tax-events/application/ports.js';
import type {
  CashFlowRecord,
  CashFlowRepository,
  CashFlowType,
  NewCashFlow,
  NewIncomeTaxComponent,
  PositionQuantityReader,
  UpdateCashFlow,
} from './ports.js';

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
  // Withheld-tax components (income types only); set withholding_tax = their sum
  // and persist linked tax events. Mutually exclusive with `withholdingTax`.
  taxComponents?: { component: TaxComponent; amount: string; currency: string; bookingDate: string }[];
}

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
  ) {}

  list(
    userId: string,
    portfolioId: string,
    filter: { types?: CashFlowType[]; positionId?: string; dateFrom?: string; dateTo?: string },
  ): Promise<CashFlowRecord[]> {
    return this.repo.listForPortfolio(userId, portfolioId, filter);
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
    const { withholding, components } = this.resolveWithholding(input, currency);
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
   * Resolves the withheld tax: either the explicit `withholding_tax` (no
   * components) or the sum of `tax_components`. Components are income-types only,
   * must each be in the cash-flow currency (MVP — no FX conversion), and are
   * mutually exclusive with an explicit `withholding_tax`.
   */
  private resolveWithholding(
    input: CreateCashFlowInput,
    currency: string,
  ): { withholding: Decimal; components: NewIncomeTaxComponent[] } {
    const provided = input.taxComponents ?? [];
    if (provided.length === 0) {
      return { withholding: nonNegative(input.withholdingTax ?? '0', 'withholding_tax'), components: [] };
    }
    if (!INCOME_TYPES.has(input.type)) {
      throw AppError.badRequest('tax_components_unsupported', 'tax_components are only valid for income cash flows (dividend, cash_in_lieu, interest)');
    }
    if (input.withholdingTax != null) {
      throw AppError.badRequest('withholding_conflict', 'Provide either withholding_tax or tax_components, not both');
    }
    let withholding = new Decimal(0);
    const components: NewIncomeTaxComponent[] = [];
    for (const c of provided) {
      if (normalizeCurrency(c.currency) !== currency) {
        throw AppError.badRequest('tax_component_currency_mismatch', 'Each tax component must be in the cash-flow currency');
      }
      const amt = nonNegative(c.amount, 'tax_component.amount');
      withholding = withholding.plus(amt);
      components.push({ component: c.component, amount: amt.toString(), bookingDate: requireDate(c.bookingDate, 'tax_component.booking_date') });
    }
    return { withholding, components };
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
