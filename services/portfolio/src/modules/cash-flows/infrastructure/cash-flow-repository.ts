import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type {
  CashFlowRecord,
  CashFlowRepository,
  CashFlowType,
  NewCashFlow,
  UpdateCashFlow,
} from '../application/ports.js';

interface CashFlowRow {
  id: string;
  portfolio_id: string;
  position_id: string | null;
  type: CashFlowType;
  gross_amount: string;
  withholding_tax: string;
  fee: string;
  net_amount: string;
  currency: string;
  payment_date: Date | string;
  tax_relevant_value_date: Date | string;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLUMNS = [
  'id',
  'portfolio_id',
  'position_id',
  'type',
  'gross_amount',
  'withholding_tax',
  'fee',
  'net_amount',
  'currency',
  'payment_date',
  'tax_relevant_value_date',
  'note',
  'created_at',
  'updated_at',
] as const;

/** Kysely adapter for `portfolio.cash_flows`. */
export class KyselyCashFlowRepository implements CashFlowRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async create(input: NewCashFlow): Promise<CashFlowRecord> {
    const row = await this.db
      .insertInto('portfolio.cash_flows')
      .values({
        user_id: input.userId,
        portfolio_id: input.portfolioId,
        position_id: input.positionId,
        type: input.type,
        gross_amount: input.grossAmount,
        withholding_tax: input.withholdingTax,
        fee: input.fee,
        net_amount: input.netAmount,
        currency: input.currency,
        payment_date: input.paymentDate,
        tax_relevant_value_date: input.taxRelevantValueDate,
        note: input.note,
      })
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
    return toRecord(row as CashFlowRow);
  }

  async listForPortfolio(
    userId: string,
    portfolioId: string,
    filter: { type?: CashFlowType; positionId?: string },
  ): Promise<CashFlowRecord[]> {
    let q = this.db
      .selectFrom('portfolio.cash_flows')
      .select(COLUMNS)
      .where('user_id', '=', userId)
      .where('portfolio_id', '=', portfolioId);
    if (filter.type) q = q.where('type', '=', filter.type);
    if (filter.positionId) q = q.where('position_id', '=', filter.positionId);
    const rows = await q.orderBy('payment_date', 'desc').orderBy('created_at', 'desc').execute();
    return rows.map((r) => toRecord(r as CashFlowRow));
  }

  async listForUser(userId: string, portfolioId?: string): Promise<CashFlowRecord[]> {
    let q = this.db.selectFrom('portfolio.cash_flows').select(COLUMNS).where('user_id', '=', userId);
    if (portfolioId) q = q.where('portfolio_id', '=', portfolioId);
    const rows = await q.orderBy('payment_date', 'desc').execute();
    return rows.map((r) => toRecord(r as CashFlowRow));
  }

  async get(userId: string, id: string): Promise<CashFlowRecord | null> {
    const row = await this.db
      .selectFrom('portfolio.cash_flows')
      .select(COLUMNS)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row ? toRecord(row as CashFlowRow) : null;
  }

  async update(userId: string, id: string, patch: UpdateCashFlow): Promise<CashFlowRecord | null> {
    const values: Record<string, unknown> = { updated_at: sql`now()` };
    if (patch.grossAmount !== undefined) values.gross_amount = patch.grossAmount;
    if (patch.withholdingTax !== undefined) values.withholding_tax = patch.withholdingTax;
    if (patch.fee !== undefined) values.fee = patch.fee;
    if (patch.netAmount !== undefined) values.net_amount = patch.netAmount;
    if (patch.currency !== undefined) values.currency = patch.currency;
    if (patch.paymentDate !== undefined) values.payment_date = patch.paymentDate;
    if (patch.taxRelevantValueDate !== undefined) values.tax_relevant_value_date = patch.taxRelevantValueDate;
    if (patch.note !== undefined) values.note = patch.note;

    const row = await this.db
      .updateTable('portfolio.cash_flows')
      .set(values)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returning(COLUMNS)
      .executeTakeFirst();
    return row ? toRecord(row as CashFlowRow) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('portfolio.cash_flows')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async assertPortfolioOwned(userId: string, portfolioId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('portfolio.portfolios')
      .select('id')
      .where('id', '=', portfolioId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async positionPortfolio(userId: string, positionId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('portfolio.positions as p')
      .innerJoin('portfolio.portfolios as pf', 'pf.id', 'p.portfolio_id')
      .select('p.portfolio_id as portfolio_id')
      .where('p.id', '=', positionId)
      .where('pf.user_id', '=', userId)
      .executeTakeFirst();
    return row?.portfolio_id ?? null;
  }
}

function toRecord(row: CashFlowRow): CashFlowRecord {
  return {
    id: row.id,
    portfolio_id: row.portfolio_id,
    position_id: row.position_id,
    type: row.type,
    gross_amount: row.gross_amount,
    withholding_tax: row.withholding_tax,
    fee: row.fee,
    net_amount: row.net_amount,
    currency: row.currency,
    payment_date: dateStr(row.payment_date),
    tax_relevant_value_date: dateStr(row.tax_relevant_value_date),
    note: row.note,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

/** `date` columns may arrive as a Date (driver-dependent); normalize to YYYY-MM-DD. */
function dateStr(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
