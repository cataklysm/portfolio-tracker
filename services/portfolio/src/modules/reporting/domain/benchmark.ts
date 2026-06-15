/**
 * Period-relative portfolio-vs-benchmark comparison. The portfolio is indexed
 * from its time-weighted per-period returns; the benchmark from its daily closes
 * (price relatives — currency-neutral). Both are rebased to 100 at the period
 * start so the chart and the return figures line up. Beta, correlation, and
 * tracking error use the paired per-period returns where both are available.
 */
export interface BenchmarkPoint {
  date: string;
  /** Portfolio index (100 at start), or null before the first return. */
  portfolio: string | null;
  /** Benchmark index (100 at start), or null where the close is missing. */
  benchmark: string | null;
}

export interface BenchmarkComparison {
  portfolio_return_pct: string | null;
  benchmark_return_pct: string | null;
  excess_return_pct: string | null;
  beta: string | null;
  correlation: string | null;
  /** Annualized standard deviation of the per-period return differences, percent. */
  tracking_error_pct: string | null;
  series: BenchmarkPoint[];
}

export interface BenchmarkInput {
  /** Ascending sample dates (length n). */
  sampleDates: string[];
  /** Portfolio per-period (TWR) returns, aligned to intervals (length n−1). */
  portfolioReturns: number[];
  /** Benchmark close at each sample date (length n); null where unavailable. */
  benchmarkCloses: (number | null)[];
  periodsPerYear: number;
}

export function computeBenchmarkComparison(input: BenchmarkInput): BenchmarkComparison {
  const { sampleDates, portfolioReturns, benchmarkCloses, periodsPerYear } = input;
  const n = sampleDates.length;

  // Rebased index curves (100 at the first sample).
  const base = benchmarkCloses.find((c) => c !== null && c > 0) ?? null;
  const portfolioIndex: (number | null)[] = [];
  const benchmarkIndex: (number | null)[] = [];
  let curve = 100;
  for (let i = 0; i < n; i += 1) {
    if (i === 0) portfolioIndex.push(100);
    else {
      curve *= 1 + (portfolioReturns[i - 1] ?? 0);
      portfolioIndex.push(curve);
    }
    const close = benchmarkCloses[i];
    benchmarkIndex.push(base !== null && close !== null && close !== undefined ? (100 * close) / base : null);
  }

  // Paired per-period returns for beta / correlation / tracking error.
  const pairP: number[] = [];
  const pairB: number[] = [];
  for (let i = 1; i < n; i += 1) {
    const prev = benchmarkCloses[i - 1];
    const cur = benchmarkCloses[i];
    if (prev === null || prev === undefined || prev <= 0 || cur === null || cur === undefined) continue;
    pairP.push(portfolioReturns[i - 1] ?? 0);
    pairB.push(cur / prev - 1);
  }

  const portfolioReturnPct = portfolioIndex[n - 1] != null ? portfolioIndex[n - 1]! / 100 - 1 : null;
  const lastBenchmark = lastNonNull(benchmarkIndex);
  const benchmarkReturnPct = lastBenchmark !== null ? lastBenchmark / 100 - 1 : null;
  const excess =
    portfolioReturnPct !== null && benchmarkReturnPct !== null ? portfolioReturnPct - benchmarkReturnPct : null;

  const stats = pairedStats(pairP, pairB, periodsPerYear);

  return {
    portfolio_return_pct: pctOrNull(portfolioReturnPct),
    benchmark_return_pct: pctOrNull(benchmarkReturnPct),
    excess_return_pct: pctOrNull(excess),
    beta: stats.beta === null ? null : stats.beta.toFixed(2),
    correlation: stats.correlation === null ? null : stats.correlation.toFixed(2),
    tracking_error_pct: pctOrNull(stats.trackingError),
    series: sampleDates.map((date, i) => ({
      date,
      portfolio: portfolioIndex[i] != null ? portfolioIndex[i]!.toFixed(2) : null,
      benchmark: benchmarkIndex[i] != null ? benchmarkIndex[i]!.toFixed(2) : null,
    })),
  };
}

function pairedStats(
  p: number[],
  b: number[],
  periodsPerYear: number,
): { beta: number | null; correlation: number | null; trackingError: number | null } {
  const m = p.length;
  if (m < 2) return { beta: null, correlation: null, trackingError: null };
  const meanP = mean(p);
  const meanB = mean(b);
  let cov = 0;
  let varB = 0;
  let varP = 0;
  let diffSq = 0;
  for (let i = 0; i < m; i += 1) {
    cov += (p[i]! - meanP) * (b[i]! - meanB);
    varB += (b[i]! - meanB) ** 2;
    varP += (p[i]! - meanP) ** 2;
    diffSq += (p[i]! - b[i]!) ** 2;
  }
  cov /= m;
  varB /= m;
  varP /= m;
  const beta = varB > 0 ? cov / varB : null;
  const sdP = Math.sqrt(varP);
  const sdB = Math.sqrt(varB);
  const correlation = sdP > 0 && sdB > 0 ? cov / (sdP * sdB) : null;
  const trackingError = Math.sqrt(diffSq / m) * Math.sqrt(periodsPerYear);
  return { beta, correlation, trackingError };
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function lastNonNull(xs: (number | null)[]): number | null {
  for (let i = xs.length - 1; i >= 0; i -= 1) if (xs[i] !== null) return xs[i]!;
  return null;
}

function pctOrNull(value: number | null): string | null {
  return value === null ? null : (value * 100).toFixed(2);
}
