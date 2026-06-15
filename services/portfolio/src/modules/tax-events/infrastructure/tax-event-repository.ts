import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { AuditFn } from '../../audit/application/ports.js';
import type { ChangeRecorder } from '../../audit/infrastructure/change-log-repository.js';
import type {
  NewTaxEvent,
  TaxComponent,
  TaxDirection,
  TaxEventFilter,
  TaxEventRecord,
  TaxEventRepository,
  TaxSource,
  UpdateTaxEvent,
} from '../application/ports.js';

interface TaxEventRow {
  id: string;
  component: TaxComponent;
  direction: TaxDirection;
  amount: string;
  currency: string;
  booking_date: Date | string;
  source: TaxSource;
  note: string | null;
  transaction_id: string | null;
  cash_flow_id: string | null;
  position_id: string | null;
  portfolio_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLUMNS = [
  'id',
  'component',
  'direction',
  'amount',
  'currency',
  'booking_date',
  'source',
  'note',
  'transaction_id',
  'cash_flow_id',
  'position_id',
  'portfolio_id',
  'created_at',
  'updated_at',
] as const;

/** Kysely adapter for `portfolio.tax_events`. */
export class KyselyTaxEventRepository implements TaxEventRepository {
  constructor(
    private readonly db: Kysely<PortfolioDatabase>,
    private readonly recorder?: ChangeRecorder,
  ) {}

  /**
   * Runs `write` and, when an audit builder and recorder are present, persists
   * its change-log entry in the same transaction — write and audit row commit
   * (or roll back) together. Without a recorder it just runs `write`.
   */
  private async withAudit<T>(
    audit: AuditFn<T> | undefined,
    write: (exec: Kysely<PortfolioDatabase>) => Promise<T>,
  ): Promise<T> {
    if (!audit || !this.recorder) return write(this.db);
    const recorder = this.recorder;
    return this.db.transaction().execute(async (trx) => {
      const result = await write(trx);
      const change = audit(result);
      if (change) await recorder.recordIn(trx, change);
      return result;
    });
  }

  async create(input: NewTaxEvent, audit?: AuditFn<TaxEventRecord>): Promise<TaxEventRecord> {
    return this.withAudit(audit, async (exec) => {
      const row = await exec
        .insertInto('portfolio.tax_events')
        .values({
          user_id: input.userId,
          component: input.component,
          direction: input.direction,
          amount: input.amount,
          currency: input.currency,
          booking_date: input.bookingDate,
          source: input.source,
          note: input.note,
          transaction_id: input.transactionId,
          cash_flow_id: input.cashFlowId,
          position_id: input.positionId,
          portfolio_id: input.portfolioId,
        })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      return toRecord(row as TaxEventRow);
    });
  }

  async listForUser(userId: string, filter: TaxEventFilter): Promise<TaxEventRecord[]> {
    let q = this.db.selectFrom('portfolio.tax_events').select(COLUMNS).where('user_id', '=', userId);
    if (filter.portfolioId) q = q.where('portfolio_id', '=', filter.portfolioId);
    if (filter.positionId) q = q.where('position_id', '=', filter.positionId);
    if (filter.transactionId) q = q.where('transaction_id', '=', filter.transactionId);
    if (filter.cashFlowId) q = q.where('cash_flow_id', '=', filter.cashFlowId);
    const rows = await q.orderBy('booking_date', 'desc').orderBy('created_at', 'desc').execute();
    return rows.map((r) => toRecord(r as TaxEventRow));
  }

  async listForTransactions(userId: string, transactionIds: string[]): Promise<TaxEventRecord[]> {
    if (transactionIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('portfolio.tax_events')
      .select(COLUMNS)
      .where('user_id', '=', userId)
      .where('transaction_id', 'in', transactionIds)
      .orderBy('booking_date', 'desc')
      .execute();
    return rows.map((r) => toRecord(r as TaxEventRow));
  }

  async get(userId: string, id: string): Promise<TaxEventRecord | null> {
    const row = await this.db
      .selectFrom('portfolio.tax_events')
      .select(COLUMNS)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row ? toRecord(row as TaxEventRow) : null;
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateTaxEvent,
    audit?: AuditFn<TaxEventRecord | null>,
  ): Promise<TaxEventRecord | null> {
    const values: Record<string, unknown> = { updated_at: sql`now()` };
    if (patch.component !== undefined) values.component = patch.component;
    if (patch.direction !== undefined) values.direction = patch.direction;
    if (patch.amount !== undefined) values.amount = patch.amount;
    if (patch.currency !== undefined) values.currency = patch.currency;
    if (patch.bookingDate !== undefined) values.booking_date = patch.bookingDate;
    if (patch.note !== undefined) values.note = patch.note;

    return this.withAudit(audit, async (exec) => {
      const row = await exec
        .updateTable('portfolio.tax_events')
        .set(values)
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .returning(COLUMNS)
        .executeTakeFirst();
      return row ? toRecord(row as TaxEventRow) : null;
    });
  }

  async delete(userId: string, id: string, audit?: AuditFn<boolean>): Promise<boolean> {
    return this.withAudit(audit, async (exec) => {
      const result = await exec
        .deleteFrom('portfolio.tax_events')
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    });
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

  async transactionPortfolio(userId: string, transactionId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('portfolio.transactions as t')
      .innerJoin('portfolio.positions as p', 'p.id', 't.position_id')
      .innerJoin('portfolio.portfolios as pf', 'pf.id', 'p.portfolio_id')
      .select('p.portfolio_id as portfolio_id')
      .where('t.id', '=', transactionId)
      .where('pf.user_id', '=', userId)
      .executeTakeFirst();
    return row?.portfolio_id ?? null;
  }

  async cashFlowPortfolio(userId: string, cashFlowId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('portfolio.cash_flows')
      .select('portfolio_id')
      .where('id', '=', cashFlowId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.portfolio_id ?? null;
  }
}

function toRecord(row: TaxEventRow): TaxEventRecord {
  return {
    id: row.id,
    component: row.component,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    booking_date: dateStr(row.booking_date),
    source: row.source,
    note: row.note,
    transaction_id: row.transaction_id,
    cash_flow_id: row.cash_flow_id,
    position_id: row.position_id,
    portfolio_id: row.portfolio_id,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function dateStr(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
