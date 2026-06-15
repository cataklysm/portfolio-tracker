export type FractionalHandling = 'keep_fractional' | 'cash_settlement';

/** A corporate-action application to persist (snapshot already built + hashed). */
export interface NewCorporateActionApplication {
  positionId: string;
  /** Deterministic UUID derived from the events service's stable action id. */
  corporateActionId: string;
  corporateActionVersion: number;
  signedActionSnapshot: unknown;
  tokenSignatureHash: string;
  ratioNumerator: string | null;
  ratioDenominator: string | null;
  effectiveAt: Date;
  fractionalHandling: FractionalHandling;
  appliedBy: string;
}

/** A stored application as served to its owner. */
export interface CorporateActionApplicationRecord {
  id: string;
  position_id: string;
  corporate_action_id: string;
  corporate_action_version: number;
  signed_action_snapshot: unknown;
  token_signature_hash: string;
  ratio_numerator: string | null;
  ratio_denominator: string | null;
  effective_at: string;
  fractional_handling: FractionalHandling;
  applied_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
}

/** Minimal application identity for ownership + reversal checks. */
export interface OwnedApplication {
  id: string;
  position_id: string;
  reversed_at: Date | null;
}

export interface CorporateActionApplicationRepository {
  /** Inserts an application; throws a conflict if one is already active for the action. */
  insert(input: NewCorporateActionApplication): Promise<{ id: string }>;
  listForPosition(positionId: string): Promise<CorporateActionApplicationRecord[]>;
  /** The application if it belongs to the user (joined position → portfolio), else null. */
  getOwnedApplication(applicationId: string, userId: string): Promise<OwnedApplication | null>;
  markReversed(applicationId: string, reason: string | null, reversedBy: string): Promise<void>;
}
