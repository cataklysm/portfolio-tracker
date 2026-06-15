/**
 * Explainable portfolio "pulse" — a versioned 0–100 health score blending three
 * components, kept as a pure function so weights/thresholds are tunable and
 * testable independently of presentation. v1 weights (per product decision):
 * Structure 45% · Risk 30% · Data quality 25%.
 *
 * - **Structure**: instrument-level concentration. Higher diversification scores
 *   higher; the score is `100 · (1 − HHI)` (a single holding → 0). Identical
 *   instruments are aggregated by the caller (combined view aggregates across
 *   portfolios) before weights are computed.
 * - **Risk**: lower annualized volatility / downside volatility / max drawdown
 *   score higher, each mapped through a cap then blended.
 * - **Data quality**: value-weighted price coverage, quote freshness, and ledger
 *   validity.
 *
 * Missing components do not silently score as healthy: an unavailable component
 * (no holdings → no structure; too little history → no risk) is dropped, the
 * remaining base weights are renormalized, and `confidence` falls accordingly
 * (and is further reduced by unpriced value). With neither structure nor risk
 * available the result is `insufficient_data` with a null score.
 */

export const PORTFOLIO_PULSE_VERSION = 1;

export type PulseStatus = 'strong' | 'balanced' | 'fragile' | 'at_risk' | 'insufficient_data';
export type PulseComponent = 'structure' | 'risk' | 'data_quality';

const BASE_WEIGHTS: Record<PulseComponent, number> = { structure: 0.45, risk: 0.3, data_quality: 0.25 };

// Caps: the metric value at which a sub-score reaches 0 (linear from 100 at 0).
const VOL_ZERO_AT = 40; // annualized volatility %
const DOWNSIDE_ZERO_AT = 40; // annualized downside volatility %
const DRAWDOWN_ZERO_AT = 50; // |max drawdown| %

// Sub-weights within the risk component (renormalized over whichever are present).
const RISK_SUBWEIGHTS = { volatility: 0.4, downside: 0.2, drawdown: 0.4 };

// Within data quality.
const DQ_SUBWEIGHTS = { coverage: 0.5, freshness: 0.3, validity: 0.2 };

export interface PortfolioPulseInput {
  /** Open holding values aggregated by instrument (reporting currency, ≥ 0). */
  instrumentValues: number[];
  /** Period risk metrics in percent; null when there is too little history. */
  risk: {
    volatilityPct: number | null;
    downsideVolatilityPct: number | null;
    maxDrawdownPct: number | null;
  } | null;
  dataQuality: {
    /** Value-weighted share of open value that could be priced (0..1). */
    pricedValueRatio: number;
    /** Value-weighted share of open value with a fresh quote (0..1). */
    freshValueRatio: number;
    /** True when any open position is in the invalid state. */
    hasInvalidPositions: boolean;
  };
}

export interface PortfolioPulse {
  version: number;
  /** 0–100, or null when there is not enough signal (insufficient_data). */
  score: number | null;
  status: PulseStatus;
  /** 0–1: fraction of base weight available, scaled by priced-value coverage. */
  confidence: number;
  /** The available component dragging the score most, for an explainable headline. */
  primary_driver: PulseComponent | null;
  components: {
    structure: {
      available: boolean;
      score: number | null;
      weight: number;
      top1_pct: number | null;
      top3_pct: number | null;
      hhi: number | null;
    };
    risk: { available: boolean; score: number | null; weight: number };
    data_quality: {
      available: boolean;
      score: number;
      weight: number;
      priced_value_pct: number;
      fresh_value_pct: number;
      ledger_valid: boolean;
    };
  };
}

export function computePortfolioPulse(input: PortfolioPulseInput): PortfolioPulse {
  const structure = structureComponent(input.instrumentValues);
  const risk = riskComponent(input.risk);
  const dq = dataQualityComponent(input.dataQuality);

  // Renormalize base weights over the available components.
  const available: { key: PulseComponent; score: number }[] = [];
  if (structure.score !== null) available.push({ key: 'structure', score: structure.score });
  if (risk.score !== null) available.push({ key: 'risk', score: risk.score });
  available.push({ key: 'data_quality', score: dq.score }); // data quality is always available

  const availabilityWeight = available.reduce((s, c) => s + BASE_WEIGHTS[c.key], 0);
  const effectiveWeight = (key: PulseComponent, present: boolean): number =>
    present && availabilityWeight > 0 ? round2(BASE_WEIGHTS[key] / availabilityWeight) : 0;

  const components: PortfolioPulse['components'] = {
    structure: {
      available: structure.score !== null,
      score: structure.score,
      weight: effectiveWeight('structure', structure.score !== null),
      top1_pct: structure.top1Pct,
      top3_pct: structure.top3Pct,
      hhi: structure.hhi,
    },
    risk: {
      available: risk.score !== null,
      score: risk.score,
      weight: effectiveWeight('risk', risk.score !== null),
      // (no sub-fields; risk inputs are reported by the risk endpoint itself)
    },
    data_quality: {
      available: true,
      score: dq.score,
      weight: effectiveWeight('data_quality', true),
      priced_value_pct: round2(input.dataQuality.pricedValueRatio * 100),
      fresh_value_pct: round2(input.dataQuality.freshValueRatio * 100),
      ledger_valid: !input.dataQuality.hasInvalidPositions,
    },
  };

  // Without structure or risk, a score from data quality alone is not meaningful.
  const meaningful = structure.score !== null || risk.score !== null;
  if (!meaningful || availabilityWeight <= 0) {
    return {
      version: PORTFOLIO_PULSE_VERSION,
      score: null,
      status: 'insufficient_data',
      confidence: round2(availabilityWeight * input.dataQuality.pricedValueRatio),
      primary_driver: null,
      components,
    };
  }

  const weighted = available.reduce((s, c) => s + BASE_WEIGHTS[c.key] * c.score, 0);
  const score = clampScore(Math.round(weighted / availabilityWeight));
  const confidence = clamp01(round2(availabilityWeight * input.dataQuality.pricedValueRatio));
  // The lowest-scoring available component is the main thing holding the score back.
  const primaryDriver = [...available].sort((a, b) => a.score - b.score || BASE_WEIGHTS[b.key] - BASE_WEIGHTS[a.key])[0]!.key;

  return {
    version: PORTFOLIO_PULSE_VERSION,
    score,
    status: statusFor(score),
    confidence,
    primary_driver: primaryDriver,
    components,
  };
}

function structureComponent(values: number[]): {
  score: number | null;
  hhi: number | null;
  top1Pct: number | null;
  top3Pct: number | null;
} {
  const positive = values.filter((v) => v > 0);
  const total = positive.reduce((s, v) => s + v, 0);
  if (total <= 0) return { score: null, hhi: null, top1Pct: null, top3Pct: null };
  const weights = positive.map((v) => v / total).sort((a, b) => b - a);
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const top1 = weights[0] ?? 0;
  const top3 = weights.slice(0, 3).reduce((s, w) => s + w, 0);
  return {
    score: clampScore(Math.round(100 * (1 - hhi))),
    hhi: round4(hhi),
    top1Pct: round2(top1 * 100),
    top3Pct: round2(top3 * 100),
  };
}

function riskComponent(risk: PortfolioPulseInput['risk']): { score: number | null } {
  if (risk === null) return { score: null };
  const parts: { score: number; weight: number }[] = [];
  if (risk.volatilityPct !== null) {
    parts.push({ score: linearScore(risk.volatilityPct, VOL_ZERO_AT), weight: RISK_SUBWEIGHTS.volatility });
  }
  if (risk.downsideVolatilityPct !== null) {
    parts.push({ score: linearScore(risk.downsideVolatilityPct, DOWNSIDE_ZERO_AT), weight: RISK_SUBWEIGHTS.downside });
  }
  if (risk.maxDrawdownPct !== null) {
    parts.push({ score: linearScore(Math.abs(risk.maxDrawdownPct), DRAWDOWN_ZERO_AT), weight: RISK_SUBWEIGHTS.drawdown });
  }
  if (parts.length === 0) return { score: null };
  const w = parts.reduce((s, p) => s + p.weight, 0);
  return { score: clampScore(Math.round(parts.reduce((s, p) => s + p.weight * p.score, 0) / w)) };
}

function dataQualityComponent(dq: PortfolioPulseInput['dataQuality']): { score: number } {
  const coverage = clamp01(dq.pricedValueRatio) * 100;
  const freshness = clamp01(dq.freshValueRatio) * 100;
  const validity = dq.hasInvalidPositions ? 0 : 100;
  return {
    score: clampScore(
      Math.round(coverage * DQ_SUBWEIGHTS.coverage + freshness * DQ_SUBWEIGHTS.freshness + validity * DQ_SUBWEIGHTS.validity),
    ),
  };
}

/** Linear 100→0 as the metric rises from 0 to `zeroAt`, clamped. */
function linearScore(value: number, zeroAt: number): number {
  if (zeroAt <= 0) return 0;
  return clampScore(100 * (1 - value / zeroAt));
}

function statusFor(score: number): PulseStatus {
  if (score >= 75) return 'strong';
  if (score >= 60) return 'balanced';
  if (score >= 40) return 'fragile';
  return 'at_risk';
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
