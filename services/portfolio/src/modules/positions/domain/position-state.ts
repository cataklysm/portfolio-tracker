import type { RealizationResult } from './realization.js';

export type PositionState = 'open' | 'closed' | 'invalid';

/**
 * Position state is derived entirely from the ordered ledger, never set
 * manually: a positive remaining quantity is open, zero is closed, and an
 * inconsistent ledger (e.g. an oversell) is invalid.
 */
export function deriveState(realization: RealizationResult): PositionState {
  if (realization.invalid) return 'invalid';
  return realization.openQuantity.gt(0) ? 'open' : 'closed';
}
