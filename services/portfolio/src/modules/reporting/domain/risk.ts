/**
 * Risk analytics over a portfolio's per-period return series (the time-weighted
 * sub-period returns, so capital flows do not distort them). Volatility, Sharpe,
 * and Sortino are annualized using `periodsPerYear` (derived from the actual
 * sample spacing, so strided long ranges annualize correctly). Returns are simple
 * per-period returns (factor − 1).
 */
export interface RiskInput {
  returns: number[];
  /** Sampling frequency per year (e.g. ~252 for daily), for annualization. */
  periodsPerYear: number;
  /** Annualized risk-free rate as a fraction (default 0). */
  riskFreeRate?: number;
}

export interface RiskMetrics {
  /** Annualized standard deviation of returns, in percent. */
  volatility_pct: string | null;
  /** Annualized downside deviation (negative returns only), in percent. */
  downside_volatility_pct: string | null;
  /** Annualized (geometric) return of the series, in percent. */
  annualized_return_pct: string | null;
  sharpe: string | null;
  sortino: string | null;
  /** Largest peak-to-trough decline of the compounded series, in percent. */
  max_drawdown_pct: string | null;
  best_period_pct: string | null;
  worst_period_pct: string | null;
  sample_count: number;
}

const EMPTY: RiskMetrics = {
  volatility_pct: null,
  downside_volatility_pct: null,
  annualized_return_pct: null,
  sharpe: null,
  sortino: null,
  max_drawdown_pct: null,
  best_period_pct: null,
  worst_period_pct: null,
  sample_count: 0,
};

export function computeRisk(input: RiskInput): RiskMetrics {
  const returns = input.returns.filter((r) => Number.isFinite(r));
  const n = returns.length;
  if (n < 2 || input.periodsPerYear <= 0) return { ...EMPTY, sample_count: n };

  const periodsPerYear = input.periodsPerYear;
  const riskFree = input.riskFreeRate ?? 0;

  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const annualizedVol = stdev * Math.sqrt(periodsPerYear);

  // Downside deviation against a zero per-period threshold.
  const downsideVar = returns.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / n;
  const downsideDev = Math.sqrt(downsideVar) * Math.sqrt(periodsPerYear);

  // Geometric annualized return over the sampled span.
  const growth = returns.reduce((p, r) => p * (1 + r), 1);
  const annualizedReturn = growth > 0 ? growth ** (periodsPerYear / n) - 1 : -1;

  const excess = annualizedReturn - riskFree;
  const sharpe = annualizedVol > 0 ? excess / annualizedVol : null;
  const sortino = downsideDev > 0 ? excess / downsideDev : null;

  // Max drawdown on the compounded equity curve.
  let curve = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of returns) {
    curve *= 1 + r;
    if (curve > peak) peak = curve;
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - curve) / peak);
  }

  return {
    volatility_pct: pct(annualizedVol),
    downside_volatility_pct: pct(downsideDev),
    annualized_return_pct: pct(annualizedReturn),
    sharpe: sharpe === null ? null : round2(sharpe),
    sortino: sortino === null ? null : round2(sortino),
    max_drawdown_pct: pct(maxDrawdown),
    best_period_pct: pct(Math.max(...returns)),
    worst_period_pct: pct(Math.min(...returns)),
    sample_count: n,
  };
}

function pct(value: number): string {
  return (value * 100).toFixed(2);
}

function round2(value: number): string {
  return value.toFixed(2);
}
