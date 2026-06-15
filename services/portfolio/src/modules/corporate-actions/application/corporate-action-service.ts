import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { AppError } from '@portfolio/platform';
import type { PositionService } from '../../positions/application/position-service.js';
import type {
  CorporateActionApplicationRecord,
  CorporateActionApplicationRepository,
  FractionalHandling,
} from './ports.js';

/** Corporate-action types this version can apply to accounting (ratio-based). */
const RATIO_TYPES = new Set(['split', 'reverse_split']);

export interface ApplyCorporateActionInput {
  /** The events service's stable action id (any string; stored as a derived UUID). */
  corporateActionId: string;
  type: string;
  ratioNumerator: string;
  ratioDenominator: string;
  /** Ex-date (YYYY-MM-DD) — the effective date of the adjustment. */
  exDate: string;
  version?: number;
  fractionalHandling?: FractionalHandling;
}

export interface CorporateActionServiceDeps {
  repo: CorporateActionApplicationRepository;
  positions: PositionService;
}

/**
 * Apply/reverse signed corporate-action adjustments on a position. v1 supports
 * share-ratio actions (splits / reverse splits): applying records a tamper-evident
 * snapshot of the objective action (with a SHA-256 content hash) and re-derives
 * the position so holdings reflect the restated share count; reversing un-applies
 * it. Dividends are handled via the cash-flow ledger, not here.
 */
export class CorporateActionService {
  constructor(private readonly deps: CorporateActionServiceDeps) {}

  async apply(
    userId: string,
    bearerToken: string,
    positionId: string,
    input: ApplyCorporateActionInput,
  ): Promise<{ application_id: string; position_id: string }> {
    await this.deps.positions.getOwnedPositionRecord(userId, positionId); // 404 if not owned

    if (!RATIO_TYPES.has(input.type)) {
      throw AppError.badRequest('unsupported_corporate_action', 'Only split / reverse_split actions can be applied');
    }
    const numerator = new Decimal(input.ratioNumerator);
    const denominator = new Decimal(input.ratioDenominator);
    if (!numerator.isFinite() || !denominator.isFinite() || numerator.lte(0) || denominator.lte(0)) {
      throw AppError.badRequest('invalid_split_ratio', 'A split requires positive ratio components');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.exDate)) {
      throw AppError.badRequest('invalid_ex_date', 'A valid ex-date (YYYY-MM-DD) is required');
    }

    const version = input.version ?? 1;
    const snapshot = {
      corporate_action_id: input.corporateActionId,
      type: input.type,
      ratio_numerator: input.ratioNumerator,
      ratio_denominator: input.ratioDenominator,
      ex_date: input.exDate,
      version,
    };

    const { id } = await this.deps.repo.insert({
      positionId,
      corporateActionId: deterministicUuid(input.corporateActionId),
      corporateActionVersion: version,
      signedActionSnapshot: snapshot,
      tokenSignatureHash: sha256Hex(canonicalize(snapshot)),
      ratioNumerator: input.ratioNumerator,
      ratioDenominator: input.ratioDenominator,
      effectiveAt: new Date(`${input.exDate}T00:00:00.000Z`),
      fractionalHandling: input.fractionalHandling ?? 'keep_fractional',
      appliedBy: userId,
    });

    await this.deps.positions.recalculatePosition(positionId, bearerToken);
    return { application_id: id, position_id: positionId };
  }

  async reverse(
    userId: string,
    bearerToken: string,
    applicationId: string,
    reason: string | null,
  ): Promise<{ position_id: string }> {
    const application = await this.deps.repo.getOwnedApplication(applicationId, userId);
    if (!application) throw AppError.notFound('application_not_found', 'Corporate-action application not found');
    if (application.reversed_at) {
      throw AppError.badRequest('already_reversed', 'This corporate-action application is already reversed');
    }
    await this.deps.repo.markReversed(applicationId, reason, userId);
    await this.deps.positions.recalculatePosition(application.position_id, bearerToken);
    return { position_id: application.position_id };
  }

  async list(userId: string, positionId: string): Promise<CorporateActionApplicationRecord[]> {
    await this.deps.positions.getOwnedPositionRecord(userId, positionId);
    return this.deps.repo.listForPosition(positionId);
  }
}

/** Stable JSON for hashing (keys serialized in declaration order). */
function canonicalize(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** A deterministic UUID-shaped id from an arbitrary seed (for dedup on the action). */
function deterministicUuid(seed: string): string {
  const h = createHash('sha256').update(seed, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
