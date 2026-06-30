import Decimal from 'decimal.js';
import { AppError } from '@portfolio/platform';
import type {
  TaxComponent,
  TaxDirection,
  TaxEventFilter,
  TaxEventRecord,
  TaxEventRepository,
  UpdateTaxEvent,
} from './ports.js';

export interface CreateTaxEventInput {
  component: TaxComponent;
  direction: TaxDirection;
  amount: string;
  currency: string;
  bookingDate: string;
  note?: string | null;
  transactionId?: string | null;
  cashFlowId?: string | null;
  positionId?: string | null;
  portfolioId?: string | null;
}

export interface UpdateTaxEventInput {
  component?: TaxComponent;
  direction?: TaxDirection;
  amount?: string;
  currency?: string;
  bookingDate?: string;
  note?: string | null;
}

/**
 * CRUD for recorded broker tax events (withheld/refunded, per component). The
 * tracker only records what the broker booked; it never computes tax. Any
 * attribution link supplied (transaction, cash flow, position, portfolio) is
 * verified to belong to the user, and a position/transaction/cash-flow link
 * resolves the owning portfolio so portfolio-scoped reports include the event.
 */
export class TaxEventService {
  constructor(private readonly repo: TaxEventRepository) {}

  list(userId: string, filter: TaxEventFilter): Promise<TaxEventRecord[]> {
    return this.repo.listForUser(userId, filter);
  }

  async create(userId: string, input: CreateTaxEventInput): Promise<TaxEventRecord> {
    const amount = nonNegative(input.amount, 'amount');
    const bookingDate = requireDate(input.bookingDate, 'booking_date');
    const portfolioId = await this.resolveLinks(userId, input);

    return this.repo.create(
      {
        userId,
        component: input.component,
        direction: input.direction,
        amount: amount.toString(),
        currency: normalizeCurrency(input.currency),
        bookingDate,
        source: 'manual',
        note: input.note?.trim() || null,
        transactionId: input.transactionId ?? null,
        cashFlowId: input.cashFlowId ?? null,
        positionId: input.positionId ?? null,
        portfolioId,
      },
      (created) => ({
        userId,
        entityType: 'tax_event',
        entityId: created.id,
        action: 'created',
        after: created,
        portfolioId: created.portfolio_id,
        positionId: created.position_id,
      }),
    );
  }

  async update(userId: string, id: string, input: UpdateTaxEventInput): Promise<TaxEventRecord> {
    const existing = await this.repo.get(userId, id);
    if (!existing) throw AppError.notFound('tax_event_not_found', 'Tax event not found');
    assertNotManaged(existing);

    const patch: UpdateTaxEvent = {};
    if (input.component !== undefined) patch.component = input.component;
    if (input.direction !== undefined) patch.direction = input.direction;
    if (input.amount !== undefined) patch.amount = nonNegative(input.amount, 'amount').toString();
    if (input.currency !== undefined) patch.currency = normalizeCurrency(input.currency);
    if (input.bookingDate !== undefined) patch.bookingDate = requireDate(input.bookingDate, 'booking_date');
    if (input.note !== undefined) patch.note = input.note?.trim() || null;

    const updated = await this.repo.update(userId, id, patch, (row) =>
      row
        ? {
            userId,
            entityType: 'tax_event',
            entityId: id,
            action: 'updated',
            before: existing,
            after: row,
            portfolioId: row.portfolio_id,
            positionId: row.position_id,
          }
        : null,
    );
    if (!updated) throw AppError.notFound('tax_event_not_found', 'Tax event not found');
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.repo.get(userId, id);
    if (!existing) throw AppError.notFound('tax_event_not_found', 'Tax event not found');
    assertNotManaged(existing);
    const deleted = await this.repo.delete(userId, id, (ok) =>
      ok
        ? {
            userId,
            entityType: 'tax_event',
            entityId: id,
            action: 'deleted',
            before: existing,
            portfolioId: existing.portfolio_id,
            positionId: existing.position_id,
          }
        : null,
    );
    if (!deleted) throw AppError.notFound('tax_event_not_found', 'Tax event not found');
  }

  /**
   * Verifies every supplied link belongs to the user and derives the scoping
   * portfolio. An explicit `portfolioId` must be owned; otherwise the portfolio
   * is taken from the linked position, transaction, or cash flow (in that order)
   * so the event is attributable in portfolio-scoped reports.
   */
  private async resolveLinks(userId: string, input: CreateTaxEventInput): Promise<string | null> {
    let portfolioId: string | null = null;

    if (input.portfolioId) {
      if (!(await this.repo.assertPortfolioOwned(userId, input.portfolioId))) {
        throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
      }
      portfolioId = input.portfolioId;
    }
    if (input.positionId) {
      const owning = await this.repo.positionPortfolio(userId, input.positionId);
      if (owning === null) throw AppError.notFound('position_not_found', 'Position not found');
      portfolioId ??= owning;
    }
    if (input.transactionId) {
      const owning = await this.repo.transactionPortfolio(userId, input.transactionId);
      if (owning === null) throw AppError.notFound('transaction_not_found', 'Transaction not found');
      portfolioId ??= owning;
    }
    if (input.cashFlowId) {
      const owning = await this.repo.cashFlowPortfolio(userId, input.cashFlowId);
      if (owning === null) throw AppError.notFound('cash_flow_not_found', 'Cash flow not found');
      portfolioId ??= owning;
    }
    return portfolioId;
  }
}

/** Income-booking tax events are owned by their cash flow and immutable via this API. */
function assertNotManaged(event: TaxEventRecord): void {
  if (event.source === 'income_booking') {
    throw new AppError({
      status: 409,
      code: 'tax_event_managed',
      title: 'Conflict',
      detail: 'This tax event is managed by its income cash flow and cannot be edited or deleted directly',
    });
  }
}

function nonNegative(raw: string, field: string): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    throw AppError.badRequest('invalid_amount', `${field} must be a number`);
  }
  if (!value.isFinite()) throw AppError.badRequest('invalid_amount', `${field} must be a finite number`);
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
