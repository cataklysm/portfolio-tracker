import type { Kysely } from 'kysely';
import type { InsightsDatabase } from '../../../platform/database/schema.js';
import type {
  AssessmentRepository,
  FairValueRecord,
  GlobalAnalystFairValue,
  GlobalAnalystTarget,
  NewFairValue,
  NewPriceTarget,
  PriceTargetRecord,
  UpdatePriceTarget,
} from '../application/ports.js';

/** Kysely adapter for `insights.fair_value_estimates` and `insights.price_targets`. */
export class KyselyAssessmentRepository implements AssessmentRepository {
  constructor(private readonly db: Kysely<InsightsDatabase>) {}

  async listFairValues(instrumentId: string, userId: string): Promise<FairValueRecord[]> {
    const rows = await this.db
      .selectFrom('insights.fair_value_estimates')
      .selectAll()
      .where('instrument_id', '=', instrumentId)
      .where((eb) => eb.or([eb('user_id', '=', userId), eb('user_id', 'is', null)]))
      .where('superseded_at', 'is', null)
      .orderBy('effective_date', 'desc')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toFairValue);
  }

  async listAnalystFairValueHistory(instrumentId: string): Promise<FairValueRecord[]> {
    const rows = await this.db
      .selectFrom('insights.fair_value_estimates')
      .selectAll()
      .where('instrument_id', '=', instrumentId)
      .where('method', '=', 'analyst')
      .where('user_id', 'is', null)
      .orderBy('effective_date', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toFairValue);
  }

  async insertFairValue(input: NewFairValue): Promise<FairValueRecord> {
    const row = await this.db
      .insertInto('insights.fair_value_estimates')
      .values({
        instrument_id: input.instrumentId,
        user_id: input.userId,
        method: 'dcf',
        value: input.value,
        currency: input.currency,
        assumptions: JSON.stringify(input.assumptions),
        effective_date: input.effectiveDate,
        source: input.source,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toFairValue(row);
  }

  async deleteFairValue(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('insights.fair_value_estimates')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }

  async listPriceTargets(instrumentId: string, userId: string, listingId?: string): Promise<PriceTargetRecord[]> {
    let query = this.db
      .selectFrom('insights.price_targets')
      .selectAll()
      .where('instrument_id', '=', instrumentId)
      .where((eb) => eb.or([eb('user_id', '=', userId), eb('user_id', 'is', null)]))
      .where('superseded_at', 'is', null);
    // With a listing: instrument-wide targets (listing_id null) + that listing's;
    // other listings' targets are excluded.
    if (listingId) {
      query = query.where((eb) => eb.or([eb('listing_id', 'is', null), eb('listing_id', '=', listingId)]));
    }
    const rows = await query.orderBy('horizon').orderBy('updated_at', 'desc').execute();
    return rows.map(toPriceTarget);
  }

  async listAnalystTargetHistory(instrumentId: string): Promise<PriceTargetRecord[]> {
    const rows = await this.db
      .selectFrom('insights.price_targets')
      .selectAll()
      .where('instrument_id', '=', instrumentId)
      .where('source', '=', 'analyst')
      .where('user_id', 'is', null)
      .orderBy('effective_date', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toPriceTarget);
  }

  async listOwnTargetsForInstruments(userId: string, instrumentIds: string[]): Promise<PriceTargetRecord[]> {
    if (instrumentIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('insights.price_targets')
      .selectAll()
      .where('user_id', '=', userId)
      .where('source', '=', 'own')
      .where('instrument_id', 'in', instrumentIds)
      .execute();
    return rows.map(toPriceTarget);
  }

  async insertPriceTarget(input: NewPriceTarget): Promise<PriceTargetRecord> {
    const row = await this.db
      .insertInto('insights.price_targets')
      .values({
        instrument_id: input.instrumentId,
        listing_id: input.listingId,
        user_id: input.userId,
        horizon: input.horizon,
        source: 'own',
        zone_low: input.zoneLow,
        zone_high: input.zoneHigh,
        currency: input.currency,
        ...(input.effectiveDate ? { effective_date: input.effectiveDate } : {}),
        note: input.note,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toPriceTarget(row);
  }

  async updatePriceTarget(
    id: string,
    userId: string,
    patch: UpdatePriceTarget,
  ): Promise<PriceTargetRecord | null> {
    const values: Record<string, unknown> = { updated_at: new Date() };
    if (patch.currency !== undefined) values.currency = patch.currency;
    if (patch.horizon !== undefined) values.horizon = patch.horizon;
    if (patch.zoneLow !== undefined) values.zone_low = patch.zoneLow;
    if (patch.zoneHigh !== undefined) values.zone_high = patch.zoneHigh;
    if (patch.note !== undefined) values.note = patch.note;

    const row = await this.db
      .updateTable('insights.price_targets')
      .set(values)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst();
    return row ? toPriceTarget(row) : null;
  }

  async deletePriceTarget(id: string, userId: string, canDeleteGlobalAnalyst = false): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const ownResult = await trx
        .deleteFrom('insights.price_targets')
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if ((ownResult.numDeletedRows ?? 0n) > 0n) return true;

      if (!canDeleteGlobalAnalyst) return false;

      const target = await trx
        .selectFrom('insights.price_targets')
        .select(['instrument_id'])
        .where('id', '=', id)
        .where('source', '=', 'analyst')
        .where('user_id', 'is', null)
        .executeTakeFirst();
      if (!target) return false;

      const globalResult = await trx
        .deleteFrom('insights.price_targets')
        .where('id', '=', id)
        .where('source', '=', 'analyst')
        .where('user_id', 'is', null)
        .executeTakeFirst();
      if ((globalResult.numDeletedRows ?? 0n) === 0n) return false;

      await trx
        .insertInto('insights.suppressed_analyst_price_targets')
        .values({
          instrument_id: target.instrument_id,
          deleted_by: userId,
        })
        .onConflict((oc) => oc.column('instrument_id').doUpdateSet({ deleted_by: userId, deleted_at: new Date() }))
        .execute();

      return true;
    });
  }

  async ingestGlobalAnalystTarget(input: GlobalAnalystTarget): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const suppressed = await trx
        .selectFrom('insights.suppressed_analyst_price_targets')
        .select('instrument_id')
        .where('instrument_id', '=', input.instrumentId)
        .executeTakeFirst();
      if (suppressed) return;

      const current = await trx
        .selectFrom('insights.price_targets')
        .select(['id', 'zone_low', 'zone_high', 'currency', 'note'])
        .where('instrument_id', '=', input.instrumentId)
        .where('source', '=', 'analyst')
        .where('user_id', 'is', null)
        .where('superseded_at', 'is', null)
        .executeTakeFirst();

      // Unchanged zone → keep the current row (and its effective_date); only
      // refresh the note in place so "N analysts / recommendation" stays current.
      if (
        current &&
        numEq(current.zone_low, input.zoneLow) &&
        numEq(current.zone_high, input.zoneHigh) &&
        current.currency === input.currency
      ) {
        if ((current.note ?? null) !== (input.note ?? null)) {
          await trx
            .updateTable('insights.price_targets')
            .set({ note: input.note, updated_at: new Date() })
            .where('id', '=', current.id)
            .execute();
        }
        return;
      }

      // Changed (or new): supersede the current row and insert a new current one.
      if (current) {
        await trx
          .updateTable('insights.price_targets')
          .set({ superseded_at: new Date() })
          .where('id', '=', current.id)
          .execute();
      }
      await trx
        .insertInto('insights.price_targets')
        .values({
          instrument_id: input.instrumentId,
          listing_id: null,
          user_id: null,
          horizon: 'medium',
          source: 'analyst',
          zone_low: input.zoneLow,
          zone_high: input.zoneHigh,
          currency: input.currency,
          note: input.note,
        })
        .execute();
    });
  }

  async ingestGlobalAnalystFairValue(input: GlobalAnalystFairValue): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('insights.fair_value_estimates')
        .select(['id', 'value', 'currency'])
        .where('instrument_id', '=', input.instrumentId)
        .where('method', '=', 'analyst')
        .where('user_id', 'is', null)
        .where('superseded_at', 'is', null)
        .executeTakeFirst();

      // Unchanged value → no-op, preserving the original effective_date.
      if (current && numEq(current.value, input.value) && current.currency === input.currency) return;

      if (current) {
        await trx
          .updateTable('insights.fair_value_estimates')
          .set({ superseded_at: new Date() })
          .where('id', '=', current.id)
          .execute();
      }
      await trx
        .insertInto('insights.fair_value_estimates')
        .values({
          instrument_id: input.instrumentId,
          user_id: null,
          method: 'analyst',
          value: input.value,
          currency: input.currency,
          effective_date: new Date().toISOString().slice(0, 10),
          source: input.source,
        })
        .execute();
    });
  }
}

/** Numeric equality for decimal-string columns ("150" == "150.000000000000"). */
function numEq(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

/** A timestamptz column (Date) → ISO string. */
function iso(value: Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** A date column (Date) → 'YYYY-MM-DD'. */
function dateOnly(value: Date): string {
  return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}

function toFairValue(row: {
  id: string;
  instrument_id: string;
  user_id: string | null;
  method: 'dcf' | 'analyst';
  value: string;
  currency: string;
  assumptions: unknown;
  effective_date: Date;
  source: string | null;
  superseded_at: Date | null;
  created_at: Date;
}): FairValueRecord {
  return {
    id: row.id,
    instrument_id: row.instrument_id,
    user_id: row.user_id,
    method: row.method,
    value: row.value,
    currency: row.currency,
    assumptions: row.assumptions,
    effective_date: dateOnly(row.effective_date),
    source: row.source,
    superseded_at: row.superseded_at ? iso(row.superseded_at) : null,
    created_at: iso(row.created_at),
  };
}

function toPriceTarget(row: {
  id: string;
  instrument_id: string;
  listing_id: string | null;
  user_id: string | null;
  horizon: 'short' | 'medium' | 'long';
  source: 'own' | 'analyst' | 'technical';
  zone_low: string | null;
  zone_high: string | null;
  currency: string;
  effective_date: Date;
  note: string | null;
  superseded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): PriceTargetRecord {
  return {
    id: row.id,
    instrument_id: row.instrument_id,
    listing_id: row.listing_id,
    user_id: row.user_id,
    horizon: row.horizon,
    source: row.source,
    zone_low: row.zone_low,
    zone_high: row.zone_high,
    currency: row.currency,
    effective_date: dateOnly(row.effective_date),
    note: row.note,
    superseded_at: row.superseded_at ? iso(row.superseded_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}
