import { sql, type Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';

export interface PortfolioRow {
  id: string;
  name: string;
  sort_order: number;
  archived: boolean;
  preferred_headline_metric: string;
  /** The listing id this portfolio is benchmarked against, or null. */
  preferred_benchmark: string | null;
  created_at: string;
}

/** Kysely adapter for the `portfolio.portfolios` table (owned by this service). */
export class KyselyPortfolioRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async list(userId: string, includeArchived: boolean): Promise<PortfolioRow[]> {
    let query = this.db
      .selectFrom('portfolio.portfolios')
      .select(['id', 'name', 'sort_order', 'archived_at', 'preferred_headline_metric', 'preferred_benchmark', 'created_at'])
      .where('user_id', '=', userId);
    if (!includeArchived) query = query.where('archived_at', 'is', null);
    const rows = await query.orderBy('sort_order').orderBy('created_at').execute();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sort_order: row.sort_order,
      archived: row.archived_at !== null,
      preferred_headline_metric: row.preferred_headline_metric,
      preferred_benchmark: parseBenchmark(row.preferred_benchmark),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  }

  /** Sets (or clears) the portfolio's benchmark listing. Returns false if not owned. */
  async setPreferredBenchmark(id: string, userId: string, listingId: string | null): Promise<boolean> {
    const result = await this.db
      .updateTable('portfolio.portfolios')
      .set({ preferred_benchmark: listingId === null ? null : JSON.stringify(listingId), updated_at: new Date() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async nameExists(userId: string, name: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('portfolio.portfolios')
      .select('id')
      .where('user_id', '=', userId)
      .where('name', '=', name)
      .executeTakeFirst();
    return row !== undefined;
  }

  async create(userId: string, name: string): Promise<string> {
    const next = await this.db
      .selectFrom('portfolio.portfolios')
      .select(sql<number>`coalesce(max(sort_order) + 1, 0)`.as('next'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();
    const inserted = await this.db
      .insertInto('portfolio.portfolios')
      .values({ user_id: userId, name, sort_order: Number(next.next) })
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }

  async setArchived(id: string, userId: string, archived: boolean): Promise<boolean> {
    const result = await this.db
      .updateTable('portfolio.portfolios')
      .set({ archived_at: archived ? new Date() : null, updated_at: new Date() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('portfolio.portfolios')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  // jsonb stores the bare listing-id string; tolerate a legacy { listing_id } shape.
  // (declared after the class methods below)

  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await trx
          .updateTable('portfolio.portfolios')
          .set({ sort_order: index, updated_at: new Date() })
          .where('id', '=', orderedIds[index]!)
          .where('user_id', '=', userId)
          .execute();
      }
    });
  }
}

/** Extracts the benchmark listing id from the jsonb column (string or `{ listing_id }`). */
function parseBenchmark(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'listing_id' in raw) {
    const id = (raw as { listing_id: unknown }).listing_id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
