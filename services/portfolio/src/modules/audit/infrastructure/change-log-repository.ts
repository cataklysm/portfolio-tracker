import type { Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type {
  BookingChange,
  ChangeAction,
  ChangeEntityType,
  ChangeLogFilter,
  ChangeLogReader,
  ChangeLogWriter,
  NewBookingChange,
} from '../application/ports.js';
import type { BookingSource } from '../../../platform/database/schema.js';

interface ChangeRow {
  id: string;
  entity_type: ChangeEntityType;
  entity_id: string;
  action: ChangeAction;
  source: BookingSource;
  reason: string | null;
  before: unknown;
  after: unknown;
  portfolio_id: string | null;
  position_id: string | null;
  changed_at: Date | string;
}

const COLUMNS = [
  'id',
  'entity_type',
  'entity_id',
  'action',
  'source',
  'reason',
  'before',
  'after',
  'portfolio_id',
  'position_id',
  'changed_at',
] as const;

const MAX_ROWS = 200;

/** Kysely adapter for the append-only `portfolio.booking_changes` audit log. */
export class KyselyChangeLogRepository implements ChangeLogWriter, ChangeLogReader {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async record(change: NewBookingChange): Promise<void> {
    await this.db
      .insertInto('portfolio.booking_changes')
      .values({
        user_id: change.userId,
        entity_type: change.entityType,
        entity_id: change.entityId,
        action: change.action,
        source: change.source ?? 'manual',
        reason: change.reason ?? null,
        before: change.before === undefined ? null : JSON.stringify(change.before),
        after: change.after === undefined ? null : JSON.stringify(change.after),
        portfolio_id: change.portfolioId ?? null,
        position_id: change.positionId ?? null,
      })
      .execute();
  }

  async list(userId: string, filter: ChangeLogFilter): Promise<BookingChange[]> {
    let q = this.db.selectFrom('portfolio.booking_changes').select(COLUMNS).where('user_id', '=', userId);
    if (filter.entityType) q = q.where('entity_type', '=', filter.entityType);
    if (filter.entityId) q = q.where('entity_id', '=', filter.entityId);
    if (filter.portfolioId) q = q.where('portfolio_id', '=', filter.portfolioId);
    const rows = await q.orderBy('changed_at', 'desc').limit(MAX_ROWS).execute();
    return rows.map((r) => toRecord(r as ChangeRow));
  }
}

function toRecord(row: ChangeRow): BookingChange {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    source: row.source,
    reason: row.reason,
    before: row.before ?? null,
    after: row.after ?? null,
    portfolio_id: row.portfolio_id,
    position_id: row.position_id,
    changed_at: row.changed_at instanceof Date ? row.changed_at.toISOString() : new Date(row.changed_at).toISOString(),
  };
}
