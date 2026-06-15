import Decimal from 'decimal.js';
import { AppError } from '@portfolio/platform';
import type {
  CashFlowRecord,
  CashFlowRepository,
  CashFlowType,
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
}

export interface UpdateCashFlowInput {
  grossAmount?: string;
  withholdingTax?: string;
  fee?: string;
  currency?: string;
  paymentDate?: string;
  taxRelevantValueDate?: string;
  note?: string | null;
}

// dividend & cash_in_lieu attach to a position; deposit & withdrawal are
// portfolio-level (mirrors the cash_flows table CHECK).
const POSITION_LINKED: ReadonlySet<CashFlowType> = new Set(['dividend', 'cash_in_lieu']);

/**
 * CRUD for portfolio cash flows (dividends, deposits, withdrawals, cash-in-lieu).
 * Net amount is always derived server-side as gross − withholding − fee; the
 * position linkage and ownership are enforced before any write.
 */
export class CashFlowService {
  constructor(private readonly repo: CashFlowRepository) {}

  list(
    userId: string,
    portfolioId: string,
    filter: { type?: CashFlowType; positionId?: string },
  ): Promise<CashFlowRecord[]> {
    return this.repo.listForPortfolio(userId, portfolioId, filter);
  }

  async create(userId: string, portfolioId: string, input: CreateCashFlowInput): Promise<CashFlowRecord> {
    if (!(await this.repo.assertPortfolioOwned(userId, portfolioId))) {
      throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
    }

    const positionId = await this.resolvePositionLink(userId, portfolioId, input.type, input.positionId ?? null);
    const gross = amount(input.grossAmount, 'gross_amount');
    const withholding = nonNegative(input.withholdingTax ?? '0', 'withholding_tax');
    const fee = nonNegative(input.fee ?? '0', 'fee');
    const paymentDate = requireDate(input.paymentDate, 'payment_date');

    return this.repo.create(
      {
        userId,
        portfolioId,
        positionId,
        type: input.type,
        grossAmount: gross.toString(),
        withholdingTax: withholding.toString(),
        fee: fee.toString(),
        netAmount: gross.minus(withholding).minus(fee).toString(),
        currency: normalizeCurrency(input.currency),
        paymentDate,
        taxRelevantValueDate: requireDate(input.taxRelevantValueDate ?? paymentDate, 'tax_relevant_value_date'),
        note: input.note?.trim() || null,
      },
      (created) => ({
        userId,
        entityType: 'cash_flow',
        entityId: created.id,
        action: 'created',
        after: created,
        portfolioId: created.portfolio_id,
        positionId: created.position_id,
      }),
    );
  }

  async update(userId: string, id: string, input: UpdateCashFlowInput): Promise<CashFlowRecord> {
    const existing = await this.repo.get(userId, id);
    if (!existing) throw AppError.notFound('cash_flow_not_found', 'Cash flow not found');

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

  /** Enforces the type→position-linkage rule and that the position is in this portfolio. */
  private async resolvePositionLink(
    userId: string,
    portfolioId: string,
    type: CashFlowType,
    positionId: string | null,
  ): Promise<string | null> {
    if (POSITION_LINKED.has(type)) {
      if (!positionId) {
        throw AppError.badRequest('position_required', `${type} cash flows must reference a position`);
      }
      const owningPortfolio = await this.repo.positionPortfolio(userId, positionId);
      if (owningPortfolio === null) throw AppError.notFound('position_not_found', 'Position not found');
      if (owningPortfolio !== portfolioId) {
        throw AppError.badRequest('position_portfolio_mismatch', 'Position does not belong to this portfolio');
      }
      return positionId;
    }
    if (positionId) {
      throw AppError.badRequest('position_not_allowed', `${type} cash flows are portfolio-level and cannot reference a position`);
    }
    return null;
  }
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
