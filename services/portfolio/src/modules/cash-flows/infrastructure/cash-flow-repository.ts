import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { AuditFn } from '../../audit/application/ports.js';
import type { ChangeRecorder } from '../../audit/infrastructure/change-log-repository.js';
import type {
  CashFlowRecord,
  CashFlowRepository,
  CashFlowType,
  NewCashFlow,
  NewIncomeTaxComponent,
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
  source_event_id: string | null;
  source_event_version: number | null;
  source_event_type: string | null;
  ex_date: Date | string | null;
  amount_per_share: string | null;
  quantity_at_ex_date: string | null;
  expected_gross_amount: string | null;
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
  'source_event_id',
  'source_event_version',
  'source_event_type',
  'ex_date',
  'amount_per_share',
  'quantity_at_ex_date',
  'expected_gross_amount',
  'created_at',
  'updated_at',
] as const;

/** Kysely adapter for `portfolio.cash_flows`. */
export class KyselyCashFlowRepository implements CashFlowRepository {
  constructor(
    private readonly db: Kysely<PortfolioDatabase>,
    private readonly recorder?: ChangeRecorder,
  ) {}

  /**
   * Runs `write` and, when an audit builder and recorder are present, persists
   * its change-log entry in the same transaction — so the write and its audit
   * row commit (or roll back) together. Without a recorder it just runs `write`.
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

  async create(input: NewCashFlow, audit?: AuditFn<CashFlowRecord>): Promise<CashFlowRecord> {
    return this.withAudit(audit, async (exec) => {
      const row = await exec
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
          source_event_id: input.sourceEventId,
          source_event_version: input.sourceEventVersion,
          source_event_type: input.sourceEventType,
          ex_date: input.exDate,
          amount_per_share: input.amountPerShare,
          quantity_at_ex_date: input.quantityAtExDate,
          expected_gross_amount: input.expectedGrossAmount,
        })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      return toRecord(row as CashFlowRow);
    });
  }

  async createWithTaxEvents(
    input: NewCashFlow,
    taxComponents: NewIncomeTaxComponent[],
    audit?: AuditFn<CashFlowRecord>,
  ): Promise<CashFlowRecord> {
    if (taxComponents.length === 0) return this.create(input, audit);
    // One transaction for the cash flow + its linked withheld-tax events, with an
    // audit row for each. Both are portfolio.* tables in this service, so the
    // co-write is kept here rather than spanning two repositories' transactions.
    return this.db.transaction().execute(async (trx) => {
      const cfRow = await trx
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
          source_event_id: input.sourceEventId,
          source_event_version: input.sourceEventVersion,
          source_event_type: input.sourceEventType,
          ex_date: input.exDate,
          amount_per_share: input.amountPerShare,
          quantity_at_ex_date: input.quantityAtExDate,
          expected_gross_amount: input.expectedGrossAmount,
        })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      const cashFlow = toRecord(cfRow as CashFlowRow);

      if (this.recorder && audit) {
        const change = audit(cashFlow);
        if (change) await this.recorder.recordIn(trx, change);
      }

      for (const component of taxComponents) {
        const teRow = await trx
          .insertInto('portfolio.tax_events')
          .values({
            user_id: input.userId,
            component: component.component,
            direction: 'withheld',
            amount: component.amount,
            currency: input.currency,
            booking_date: component.bookingDate,
            source: 'income_booking',
            note: null,
            transaction_id: null,
            cash_flow_id: cashFlow.id,
            position_id: input.positionId,
            portfolio_id: input.portfolioId,
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();
        if (this.recorder) {
          await this.recorder.recordIn(trx, {
            userId: input.userId,
            entityType: 'tax_event',
            entityId: teRow.id,
            action: 'created',
            after: {
              id: teRow.id,
              component: component.component,
              direction: 'withheld',
              amount: component.amount,
              currency: input.currency,
              booking_date: component.bookingDate,
              source: 'income_booking',
              cash_flow_id: cashFlow.id,
              position_id: input.positionId,
              portfolio_id: input.portfolioId,
            },
            portfolioId: input.portfolioId,
            positionId: input.positionId,
          });
        }
      }
      return cashFlow;
    });
  }

  async listForPortfolio(
    userId: string,
    portfolioId: string,
    filter: { types?: CashFlowType[]; positionId?: string; dateFrom?: string; dateTo?: string },
  ): Promise<CashFlowRecord[]> {
    let q = this.db
      .selectFrom('portfolio.cash_flows')
      .select(COLUMNS)
      .where('user_id', '=', userId)
      .where('portfolio_id', '=', portfolioId);
    if (filter.types && filter.types.length > 0) q = q.where('type', 'in', filter.types);
    if (filter.positionId) q = q.where('position_id', '=', filter.positionId);
    // Date filters apply to the value (tax-relevant) date, matching the existing
    // (portfolio_id, tax_relevant_value_date) index used for activity/reporting.
    if (filter.dateFrom) q = q.where('tax_relevant_value_date', '>=', filter.dateFrom);
    if (filter.dateTo) q = q.where('tax_relevant_value_date', '<=', filter.dateTo);
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

  async update(
    userId: string,
    id: string,
    patch: UpdateCashFlow,
    audit?: AuditFn<CashFlowRecord | null>,
  ): Promise<CashFlowRecord | null> {
    const values: Record<string, unknown> = { updated_at: sql`now()` };
    if (patch.grossAmount !== undefined) values.gross_amount = patch.grossAmount;
    if (patch.withholdingTax !== undefined) values.withholding_tax = patch.withholdingTax;
    if (patch.fee !== undefined) values.fee = patch.fee;
    if (patch.netAmount !== undefined) values.net_amount = patch.netAmount;
    if (patch.currency !== undefined) values.currency = patch.currency;
    if (patch.paymentDate !== undefined) values.payment_date = patch.paymentDate;
    if (patch.taxRelevantValueDate !== undefined) values.tax_relevant_value_date = patch.taxRelevantValueDate;
    if (patch.note !== undefined) values.note = patch.note;

    return this.withAudit(audit, async (exec) => {
      const row = await exec
        .updateTable('portfolio.cash_flows')
        .set(values)
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .returning(COLUMNS)
        .executeTakeFirst();
      return row ? toRecord(row as CashFlowRow) : null;
    });
  }

  async delete(userId: string, id: string, audit?: AuditFn<boolean>): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      // Capture the generated income-booking tax events before deleting the cash
      // flow: the FK is ON DELETE SET NULL, which would otherwise orphan them, so
      // they are deleted here in the same transaction (each audited).
      const managed = await trx
        .selectFrom('portfolio.tax_events')
        .select(['id', 'component', 'direction', 'amount', 'currency', 'booking_date', 'source', 'cash_flow_id', 'position_id', 'portfolio_id'])
        .where('user_id', '=', userId)
        .where('cash_flow_id', '=', id)
        .where('source', '=', 'income_booking')
        .execute();

      const result = await trx
        .deleteFrom('portfolio.cash_flows')
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if ((result.numDeletedRows ?? 0n) <= 0n) return false;

      for (const te of managed) {
        await trx.deleteFrom('portfolio.tax_events').where('id', '=', te.id).execute();
        if (this.recorder) {
          await this.recorder.recordIn(trx, {
            userId,
            entityType: 'tax_event',
            entityId: te.id,
            action: 'deleted',
            before: te,
            portfolioId: te.portfolio_id,
            positionId: te.position_id,
          });
        }
      }
      if (this.recorder && audit) {
        const change = audit(true);
        if (change) await this.recorder.recordIn(trx, change);
      }
      return true;
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

  async hasManagedTaxEvents(userId: string, cashFlowId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('portfolio.tax_events')
      .select('id')
      .where('user_id', '=', userId)
      .where('cash_flow_id', '=', cashFlowId)
      .where('source', '=', 'income_booking')
      .executeTakeFirst();
    return row !== undefined;
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
    source_event_id: row.source_event_id,
    source_event_version: row.source_event_version,
    source_event_type: row.source_event_type,
    ex_date: row.ex_date === null ? null : dateStr(row.ex_date),
    amount_per_share: row.amount_per_share,
    quantity_at_ex_date: row.quantity_at_ex_date,
    expected_gross_amount: row.expected_gross_amount,
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
