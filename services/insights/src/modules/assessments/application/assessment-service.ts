import { AppError } from '@portfolio/platform';
import { computeDcf, DcfError, type DcfAssumptions, type DcfResult } from '../domain/dcf.js';
import type {
  AssessmentRepository,
  FairValueRecord,
  PriceTargetRecord,
  UpdatePriceTarget,
} from './ports.js';

export interface CreateDcfInput {
  instrumentId: string;
  currency: string;
  assumptions: DcfAssumptions;
  effectiveDate?: string;
  source?: string | null;
}

export interface CreatePriceTargetInput {
  instrumentId: string;
  listingId?: string | null;
  horizon: 'short' | 'medium' | 'long';
  zoneLow?: number | null;
  zoneHigh?: number | null;
  currency: string;
  effectiveDate?: string;
  note?: string | null;
}

/**
 * Use cases for instrument-level assessments. Fair values from a DCF are
 * computed transparently here and stored with their inputs; price targets are
 * user-owned zones. Both reads include any global provider records.
 */
export class AssessmentService {
  constructor(private readonly repo: AssessmentRepository) {}

  // ---- Fair values --------------------------------------------------------

  listFairValues(userId: string, instrumentId: string): Promise<FairValueRecord[]> {
    return this.repo.listFairValues(instrumentId, userId);
  }

  /** Computes a DCF intrinsic value from the assumptions and stores it (user-owned). */
  async createDcfFairValue(
    userId: string,
    input: CreateDcfInput,
  ): Promise<{ record: FairValueRecord; breakdown: DcfResult }> {
    let breakdown: DcfResult;
    try {
      breakdown = computeDcf(input.assumptions);
    } catch (err) {
      if (err instanceof DcfError) throw AppError.badRequest('invalid_dcf_assumptions', err.message);
      throw err;
    }
    if (breakdown.intrinsic_value_per_share < 0) {
      throw AppError.badRequest('invalid_dcf_result', 'DCF produced a negative value; check the assumptions');
    }

    const record = await this.repo.insertFairValue({
      instrumentId: input.instrumentId,
      userId,
      value: String(breakdown.intrinsic_value_per_share),
      currency: input.currency.toUpperCase(),
      assumptions: input.assumptions,
      effectiveDate: input.effectiveDate ?? today(),
      source: input.source ?? null,
    });
    return { record, breakdown };
  }

  async deleteFairValue(userId: string, id: string): Promise<void> {
    if (!(await this.repo.deleteFairValue(id, userId))) {
      throw AppError.notFound('fair_value_not_found', 'Fair-value estimate not found');
    }
  }

  // ---- Price targets ------------------------------------------------------

  listPriceTargets(userId: string, instrumentId: string, listingId?: string): Promise<PriceTargetRecord[]> {
    return this.repo.listPriceTargets(instrumentId, userId, listingId);
  }

  /** A user's own target zones across instruments (for the notifications worker). */
  listOwnTargetsForInstruments(userId: string, instrumentIds: string[]): Promise<PriceTargetRecord[]> {
    return this.repo.listOwnTargetsForInstruments(userId, instrumentIds);
  }

  async createPriceTarget(userId: string, input: CreatePriceTargetInput): Promise<PriceTargetRecord> {
    const low = input.zoneLow ?? null;
    const high = input.zoneHigh ?? null;
    if (low === null && high === null) {
      throw AppError.badRequest('empty_target_zone', 'Provide zone_low and/or zone_high');
    }
    if (low !== null && high !== null && low > high) {
      throw AppError.badRequest('invalid_target_zone', 'zone_low must be less than or equal to zone_high');
    }
    return this.repo.insertPriceTarget({
      instrumentId: input.instrumentId,
      listingId: input.listingId ?? null,
      userId,
      horizon: input.horizon,
      zoneLow: low === null ? null : String(low),
      zoneHigh: high === null ? null : String(high),
      currency: input.currency.toUpperCase(),
      effectiveDate: input.effectiveDate,
      note: input.note ?? null,
    });
  }

  async updatePriceTarget(
    userId: string,
    id: string,
    patch: { currency?: string; horizon?: 'short' | 'medium' | 'long'; zoneLow?: number; zoneHigh?: number; note?: string | null },
  ): Promise<PriceTargetRecord> {
    if (patch.zoneLow !== undefined && patch.zoneHigh !== undefined && patch.zoneLow > patch.zoneHigh) {
      throw AppError.badRequest('invalid_target_zone', 'zone_low must be less than or equal to zone_high');
    }
    const update: UpdatePriceTarget = {};
    if (patch.currency !== undefined) update.currency = patch.currency.toUpperCase();
    if (patch.horizon !== undefined) update.horizon = patch.horizon;
    if (patch.zoneLow !== undefined) update.zoneLow = String(patch.zoneLow);
    if (patch.zoneHigh !== undefined) update.zoneHigh = String(patch.zoneHigh);
    if (patch.note !== undefined) update.note = patch.note;

    const updated = await this.repo.updatePriceTarget(id, userId, update);
    if (!updated) throw AppError.notFound('price_target_not_found', 'Price target not found');
    return updated;
  }

  async deletePriceTarget(userId: string, id: string): Promise<void> {
    if (!(await this.repo.deletePriceTarget(id, userId))) {
      throw AppError.notFound('price_target_not_found', 'Price target not found');
    }
  }

  // ---- Provider ingest (event-driven) -------------------------------------

  /**
   * Stores the global analyst records for an instrument from a market
   * `analyst_assessment.updated` event. Idempotent: each refresh replaces the
   * single analyst target zone + mean fair value.
   */
  async ingestAnalystAssessment(payload: AnalystAssessmentPayload): Promise<void> {
    if (!payload.instrument_id) return;
    const currency = (payload.currency ?? 'USD').toUpperCase();

    if (payload.target_low != null || payload.target_high != null) {
      await this.repo.replaceGlobalAnalystTarget({
        instrumentId: payload.instrument_id,
        zoneLow: payload.target_low != null ? String(payload.target_low) : null,
        zoneHigh: payload.target_high != null ? String(payload.target_high) : null,
        currency,
        note: analystNote(payload),
      });
    }
    if (payload.target_mean != null) {
      await this.repo.replaceGlobalAnalystFairValue({
        instrumentId: payload.instrument_id,
        value: String(payload.target_mean),
        currency,
        source: payload.source ?? 'yahoo',
      });
    }
  }
}

export interface AnalystAssessmentPayload {
  instrument_id: string;
  currency: string;
  target_low: number | null;
  target_high: number | null;
  target_mean: number | null;
  target_median: number | null;
  recommendation_key: string | null;
  recommendation_mean: number | null;
  number_of_analysts: number | null;
  source?: string;
  as_of?: string;
}

/** A compact human-readable note for an analyst target row. */
function analystNote(p: AnalystAssessmentPayload): string {
  const parts: string[] = [];
  if (p.target_mean != null) parts.push(`mean ${p.target_mean}`);
  if (p.recommendation_key) parts.push(p.recommendation_key);
  if (p.number_of_analysts != null) parts.push(`${p.number_of_analysts} analysts`);
  return parts.join(' · ');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
