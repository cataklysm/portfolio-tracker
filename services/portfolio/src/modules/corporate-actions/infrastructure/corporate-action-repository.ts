import { type Kysely } from 'kysely';
import { AppError } from '@portfolio/platform';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { SplitAdjustment } from '../../positions/domain/realization.js';
import type { CorporateActionReader } from '../../positions/application/ports.js';
import type {
  CorporateActionApplicationRecord,
  CorporateActionApplicationRepository,
  NewCorporateActionApplication,
  OwnedApplication,
} from '../application/ports.js';

/**
 * Kysely adapter for `portfolio.position_corporate_action_applications`. Also
 * implements the positions' `CorporateActionReader`: the active (non-reversed)
 * ratio applications a position's re-derivation must replay as splits.
 */
export class KyselyCorporateActionRepository
  implements CorporateActionApplicationRepository, CorporateActionReader
{
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async insert(input: NewCorporateActionApplication): Promise<{ id: string }> {
    try {
      const row = await this.db
        .insertInto('portfolio.position_corporate_action_applications')
        .values({
          position_id: input.positionId,
          corporate_action_id: input.corporateActionId,
          corporate_action_version: input.corporateActionVersion,
          signed_action_snapshot: JSON.stringify(input.signedActionSnapshot),
          token_signature_hash: input.tokenSignatureHash,
          ratio_numerator: input.ratioNumerator,
          ratio_denominator: input.ratioDenominator,
          effective_at: input.effectiveAt,
          fractional_handling: input.fractionalHandling,
          applied_by: input.appliedBy,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return { id: row.id };
    } catch (err) {
      // Unique partial index on (position_id, corporate_action_id) WHERE reversed_at IS NULL.
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
        throw AppError.conflict('corporate_action_already_applied', 'This corporate action is already applied to the position');
      }
      throw err;
    }
  }

  async listForPosition(positionId: string): Promise<CorporateActionApplicationRecord[]> {
    const rows = await this.db
      .selectFrom('portfolio.position_corporate_action_applications')
      .selectAll()
      .where('position_id', '=', positionId)
      .orderBy('effective_at', 'desc')
      .orderBy('creation_sequence', 'desc')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      position_id: row.position_id,
      corporate_action_id: row.corporate_action_id,
      corporate_action_version: row.corporate_action_version,
      signed_action_snapshot: row.signed_action_snapshot,
      token_signature_hash: row.token_signature_hash,
      ratio_numerator: row.ratio_numerator,
      ratio_denominator: row.ratio_denominator,
      effective_at: toIso(row.effective_at),
      fractional_handling: row.fractional_handling,
      applied_at: toIso(row.applied_at),
      reversed_at: row.reversed_at ? toIso(row.reversed_at) : null,
      reversal_reason: row.reversal_reason,
    }));
  }

  async getOwnedApplication(applicationId: string, userId: string): Promise<OwnedApplication | null> {
    const row = await this.db
      .selectFrom('portfolio.position_corporate_action_applications as a')
      .innerJoin('portfolio.positions as p', 'p.id', 'a.position_id')
      .innerJoin('portfolio.portfolios as pf', 'pf.id', 'p.portfolio_id')
      .select(['a.id as id', 'a.position_id as position_id', 'a.reversed_at as reversed_at'])
      .where('a.id', '=', applicationId)
      .where('pf.user_id', '=', userId)
      .executeTakeFirst();
    return row ? { id: row.id, position_id: row.position_id, reversed_at: row.reversed_at } : null;
  }

  async markReversed(applicationId: string, reason: string | null, reversedBy: string): Promise<void> {
    await this.db
      .updateTable('portfolio.position_corporate_action_applications')
      .set({ reversed_at: new Date(), reversed_by: reversedBy, reversal_reason: reason })
      .where('id', '=', applicationId)
      .where('reversed_at', 'is', null)
      .execute();
  }

  async activeSplitsForPositions(positionIds: string[]): Promise<Map<string, SplitAdjustment[]>> {
    const map = new Map<string, SplitAdjustment[]>();
    if (positionIds.length === 0) return map;
    const rows = await this.db
      .selectFrom('portfolio.position_corporate_action_applications')
      .select(['position_id', 'ratio_numerator', 'ratio_denominator', 'effective_at'])
      .where('position_id', 'in', positionIds)
      .where('reversed_at', 'is', null)
      .where('ratio_numerator', 'is not', null)
      .where('ratio_denominator', 'is not', null)
      .execute();
    for (const row of rows) {
      if (row.ratio_numerator === null || row.ratio_denominator === null) continue;
      const list = map.get(row.position_id) ?? [];
      list.push({
        effectiveDate: toIso(row.effective_at).slice(0, 10),
        ratioNumerator: row.ratio_numerator,
        ratioDenominator: row.ratio_denominator,
      });
      map.set(row.position_id, list);
    }
    return map;
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
