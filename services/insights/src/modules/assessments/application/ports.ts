import type { DcfAssumptions } from '../domain/dcf.js';

export interface FairValueRecord {
  id: string;
  instrument_id: string;
  user_id: string | null;
  method: 'dcf' | 'analyst';
  value: string;
  currency: string;
  assumptions: unknown;
  effective_date: string;
  source: string | null;
  created_at: string;
}

export interface NewFairValue {
  instrumentId: string;
  userId: string;
  value: string;
  currency: string;
  assumptions: DcfAssumptions;
  effectiveDate: string;
  source: string | null;
}

export interface PriceTargetRecord {
  id: string;
  instrument_id: string;
  listing_id: string | null;
  user_id: string | null;
  horizon: 'short' | 'medium' | 'long';
  source: 'own' | 'analyst' | 'technical';
  zone_low: string | null;
  zone_high: string | null;
  currency: string;
  effective_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewPriceTarget {
  instrumentId: string;
  listingId: string | null;
  userId: string;
  horizon: 'short' | 'medium' | 'long';
  zoneLow: string | null;
  zoneHigh: string | null;
  currency: string;
  effectiveDate?: string;
  note: string | null;
}

export interface UpdatePriceTarget {
  currency?: string;
  horizon?: 'short' | 'medium' | 'long';
  zoneLow?: string | null;
  zoneHigh?: string | null;
  note?: string | null;
}

/** A global (user_id NULL) analyst target zone, replaced wholesale per refresh. */
export interface GlobalAnalystTarget {
  instrumentId: string;
  zoneLow: string | null;
  zoneHigh: string | null;
  currency: string;
  note: string | null;
}

/** A global (user_id NULL) analyst fair value (the mean target price). */
export interface GlobalAnalystFairValue {
  instrumentId: string;
  value: string;
  currency: string;
  source: string | null;
}

/**
 * Persistence for instrument-level assessments. Reads return the caller's own
 * records plus global (user_id NULL) provider records; user writes are scoped to
 * the owning user. The `replaceGlobalAnalyst*` methods maintain the single
 * provider-fed record per instrument (idempotent: delete + insert).
 */
export interface AssessmentRepository {
  listFairValues(instrumentId: string, userId: string): Promise<FairValueRecord[]>;
  insertFairValue(input: NewFairValue): Promise<FairValueRecord>;
  deleteFairValue(id: string, userId: string): Promise<boolean>;

  listPriceTargets(instrumentId: string, userId: string, listingId?: string): Promise<PriceTargetRecord[]>;
  /** A user's own ('own' source) target zones across many instruments. */
  listOwnTargetsForInstruments(userId: string, instrumentIds: string[]): Promise<PriceTargetRecord[]>;
  insertPriceTarget(input: NewPriceTarget): Promise<PriceTargetRecord>;
  updatePriceTarget(id: string, userId: string, patch: UpdatePriceTarget): Promise<PriceTargetRecord | null>;
  deletePriceTarget(id: string, userId: string): Promise<boolean>;

  replaceGlobalAnalystTarget(input: GlobalAnalystTarget): Promise<void>;
  replaceGlobalAnalystFairValue(input: GlobalAnalystFairValue): Promise<void>;
}
