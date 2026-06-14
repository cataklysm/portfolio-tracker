import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type {
  NewTransaction,
  PositionRecord,
  PositionRepository,
  PositionWriteState,
  RealizationAllocationView,
  StoredTransaction,
} from '../application/ports.js';

/**
 * Kysely adapter for the portfolio service's owned tables: positions,
 * authoritative transactions, and the transactional outbox.
 */
export class KyselyPositionRepository implements PositionRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async listPositionsForUser(userId: string, portfolioId?: string): Promise<PositionRecord[]> {
    let query = this.db
      .selectFrom('portfolio.positions as p')
      .innerJoin('portfolio.portfolios as pf', 'pf.id', 'p.portfolio_id')
      .select(['p.id as id', 'p.portfolio_id as portfolio_id', 'p.listing_id as listing_id', 'p.state as state'])
      .where('pf.user_id', '=', userId)
      .where('pf.archived_at', 'is', null);
    if (portfolioId) query = query.where('p.portfolio_id', '=', portfolioId);
    return query.orderBy('p.created_at').execute();
  }

  async getOwnedPosition(positionId: string, userId: string): Promise<PositionRecord | null> {
    const row = await this.db
      .selectFrom('portfolio.positions as p')
      .innerJoin('portfolio.portfolios as pf', 'pf.id', 'p.portfolio_id')
      .select(['p.id as id', 'p.portfolio_id as portfolio_id', 'p.listing_id as listing_id', 'p.state as state'])
      .where('p.id', '=', positionId)
      .where('pf.user_id', '=', userId)
      .executeTakeFirst();
    return row ?? null;
  }

  async assertPortfolioOwned(portfolioId: string, userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('portfolio.portfolios')
      .select('id')
      .where('id', '=', portfolioId)
      .where('user_id', '=', userId)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    return row !== undefined;
  }

  async upsertPosition(portfolioId: string, listingId: string): Promise<{ id: string; created: boolean }> {
    const inserted = await this.db
      .insertInto('portfolio.positions')
      .values({ portfolio_id: portfolioId, listing_id: listingId })
      .onConflict((oc) => oc.columns(['portfolio_id', 'listing_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted) return { id: inserted.id, created: true };

    const existing = await this.db
      .selectFrom('portfolio.positions')
      .select('id')
      .where('portfolio_id', '=', portfolioId)
      .where('listing_id', '=', listingId)
      .executeTakeFirstOrThrow();
    return { id: existing.id, created: false };
  }

  async listTransactions(positionId: string): Promise<StoredTransaction[]> {
    const rows = await this.db
      .selectFrom('portfolio.transactions')
      .selectAll()
      .where('position_id', '=', positionId)
      .orderBy('effective_at')
      .orderBy('creation_sequence')
      .execute();
    return rows.map(mapTransaction);
  }

  async listTransactionsForPositions(positionIds: string[]): Promise<Map<string, StoredTransaction[]>> {
    const map = new Map<string, StoredTransaction[]>();
    if (positionIds.length === 0) return map;
    const rows = await this.db
      .selectFrom('portfolio.transactions')
      .selectAll()
      .where('position_id', 'in', positionIds)
      .orderBy('effective_at')
      .orderBy('creation_sequence')
      .execute();
    for (const row of rows) {
      const tx = mapTransaction(row);
      const list = map.get(row.position_id) ?? [];
      list.push(tx);
      map.set(row.position_id, list);
    }
    return map;
  }

  async insertTransaction(
    positionId: string,
    tx: NewTransaction,
  ): Promise<{ id: string; aggregateVersion: string }> {
    const row = await this.db
      .insertInto('portfolio.transactions')
      .values({
        position_id: positionId,
        side: tx.side,
        effective_at: tx.effectiveAt,
        quantity: tx.quantity,
        price: tx.price,
        fee: tx.fee,
        currency: tx.currency,
        booking_fx_rate: tx.bookingFxRate,
        tax_relevant_value_date: tx.taxRelevantValueDate,
        savings_plan: tx.savingsPlan,
        note: tx.note,
      })
      .returning(['id', 'creation_sequence'])
      .executeTakeFirstOrThrow();
    return { id: row.id, aggregateVersion: String(row.creation_sequence) };
  }

  async transactionBelongsToPosition(txId: string, positionId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('portfolio.transactions')
      .select('id')
      .where('id', '=', txId)
      .where('position_id', '=', positionId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async updateTransaction(txId: string, tx: NewTransaction): Promise<void> {
    await this.db
      .updateTable('portfolio.transactions')
      .set({
        side: tx.side,
        effective_at: tx.effectiveAt,
        quantity: tx.quantity,
        price: tx.price,
        fee: tx.fee,
        currency: tx.currency,
        booking_fx_rate: tx.bookingFxRate,
        tax_relevant_value_date: tx.taxRelevantValueDate,
        savings_plan: tx.savingsPlan,
        note: tx.note,
        updated_at: new Date(),
      })
      .where('id', '=', txId)
      .execute();
  }

  async deleteTransaction(txId: string): Promise<void> {
    await this.db.deleteFrom('portfolio.transactions').where('id', '=', txId).execute();
  }

  async deletePosition(positionId: string): Promise<void> {
    // Transactions and derived records cascade via ON DELETE CASCADE.
    await this.db.deleteFrom('portfolio.positions').where('id', '=', positionId).execute();
  }

  async applyPositionState(positionId: string, write: PositionWriteState): Promise<void> {
    if (write.calculatedValues !== null) {
      // Successful recalculation: bump the monotonic calculation version and
      // replace the derived realization allocations, all in one transaction so
      // the persisted allocations always match the version on the position.
      await this.db.transaction().execute(async (trx) => {
        const updated = await trx
          .updateTable('portfolio.positions')
          .set({
            state: write.state,
            last_valid_calculated_values: JSON.stringify(write.calculatedValues),
            calculation_version: sql`calculation_version + 1`,
            invalid_reason: null,
            updated_at: new Date(),
          })
          .where('id', '=', positionId)
          .returning('calculation_version')
          .executeTakeFirstOrThrow();

        const txnRows = await trx
          .selectFrom('portfolio.transactions')
          .select('id')
          .where('position_id', '=', positionId)
          .execute();
        const txnIds = txnRows.map((r) => r.id);
        if (txnIds.length > 0) {
          await trx.deleteFrom('portfolio.realization_allocations').where('sell_transaction_id', 'in', txnIds).execute();
          await trx.deleteFrom('portfolio.average_cost_realizations').where('sell_transaction_id', 'in', txnIds).execute();
        }

        const realization = write.realization;
        if (realization && realization.lotAllocations.length > 0) {
          await trx
            .insertInto('portfolio.realization_allocations')
            .values(
              realization.lotAllocations.map((a) => ({
                sell_transaction_id: a.sellTransactionId,
                buy_transaction_id: a.buyTransactionId,
                quantity: a.quantity,
                accounting_method: realization.method === 'lifo' ? ('lifo' as const) : ('fifo' as const),
                calculation_version: updated.calculation_version,
              })),
            )
            .execute();
        }
        if (realization && realization.averageCostRealizations.length > 0) {
          await trx
            .insertInto('portfolio.average_cost_realizations')
            .values(
              realization.averageCostRealizations.map((a) => ({
                sell_transaction_id: a.sellTransactionId,
                average_cost_basis: a.averageCostBasis,
                quantity: a.quantity,
                calculation_version: updated.calculation_version,
              })),
            )
            .execute();
        }
      });
      return;
    }
    // Invalid recalculation: flag the position only, retaining the last-valid
    // values and the previously persisted allocations.
    await this.db
      .updateTable('portfolio.positions')
      .set({
        state: write.state,
        invalid_reason: JSON.stringify(write.invalidReason),
        updated_at: new Date(),
      })
      .where('id', '=', positionId)
      .execute();
  }

  async getRealizationAllocations(positionId: string): Promise<RealizationAllocationView> {
    const lots = await this.db
      .selectFrom('portfolio.realization_allocations as ra')
      .innerJoin('portfolio.transactions as t', 't.id', 'ra.sell_transaction_id')
      .select(['ra.sell_transaction_id', 'ra.buy_transaction_id', 'ra.quantity', 'ra.accounting_method', 'ra.calculation_version'])
      .where('t.position_id', '=', positionId)
      .execute();
    const avg = await this.db
      .selectFrom('portfolio.average_cost_realizations as ar')
      .innerJoin('portfolio.transactions as t', 't.id', 'ar.sell_transaction_id')
      .select(['ar.sell_transaction_id', 'ar.average_cost_basis', 'ar.quantity', 'ar.calculation_version'])
      .where('t.position_id', '=', positionId)
      .execute();

    const method = lots[0]?.accounting_method ?? (avg.length > 0 ? ('average_cost' as const) : null);
    const version = lots[0]?.calculation_version ?? avg[0]?.calculation_version ?? null;
    return {
      position_id: positionId,
      accounting_method: method,
      calculation_version: version === null ? null : String(version),
      lot_allocations: lots.map((l) => ({
        sell_transaction_id: l.sell_transaction_id,
        buy_transaction_id: l.buy_transaction_id,
        quantity: l.quantity,
      })),
      average_cost_realizations: avg.map((a) => ({
        sell_transaction_id: a.sell_transaction_id,
        average_cost_basis: a.average_cost_basis,
        quantity: a.quantity,
      })),
    };
  }

  async enqueuePositionOpened(input: {
    positionId: string;
    portfolioId: string;
    listingId: string;
    userId: string;
    aggregateVersion: string;
  }): Promise<void> {
    await this.db
      .insertInto('portfolio.outbox_events')
      .values({
        event_type: 'portfolio.position.opened',
        event_version: 1,
        aggregate_type: 'position',
        aggregate_id: input.positionId,
        aggregate_version: input.aggregateVersion,
        user_id: input.userId,
        payload: JSON.stringify({
          event_id: randomUUID(),
          portfolio_id: input.portfolioId,
          listing_id: input.listingId,
          interest_type: 'open_position',
        }),
        correlation_id: null,
        causation_id: null,
      })
      .execute();
  }
}

interface TransactionRow {
  id: string;
  position_id: string;
  side: 'buy' | 'sell';
  effective_at: Date;
  creation_sequence: string;
  quantity: string;
  price: string;
  fee: string;
  currency: string;
  tax_relevant_value_date: string;
  savings_plan: boolean;
  note: string | null;
}

function mapTransaction(row: TransactionRow): StoredTransaction {
  return {
    id: row.id,
    side: row.side,
    effective_at: row.effective_at,
    creation_sequence: row.creation_sequence,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    currency: row.currency,
    tax_relevant_value_date: row.tax_relevant_value_date,
    savings_plan: row.savings_plan,
    note: row.note,
  };
}
