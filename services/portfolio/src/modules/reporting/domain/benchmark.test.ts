import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeBenchmarkComparison } from './benchmark.js';

const dates = ['2026-01-01', '2026-01-02', '2026-01-03'];

describe('computeBenchmarkComparison', () => {
  test('rebases both series to 100 and computes period returns', () => {
    const c = computeBenchmarkComparison({
      sampleDates: dates,
      portfolioReturns: [0.1, 0.1], // +10% then +10% → +21%
      benchmarkCloses: [100, 105, 110], // +10% over the period
      periodsPerYear: 252,
    });
    assert.equal(c.series[0]!.portfolio, '100.00');
    assert.equal(c.series[0]!.benchmark, '100.00');
    assert.equal(c.series[2]!.portfolio, '121.00');
    assert.equal(c.series[2]!.benchmark, '110.00');
    assert.equal(c.portfolio_return_pct, '21.00');
    assert.equal(c.benchmark_return_pct, '10.00');
    assert.equal(c.excess_return_pct, '11.00');
  });

  test('beta and correlation are ~1 when the portfolio tracks the benchmark', () => {
    const c = computeBenchmarkComparison({
      sampleDates: dates,
      portfolioReturns: [0.05, -0.02],
      benchmarkCloses: [100, 105, 102.9], // same +5% then −2%
      periodsPerYear: 252,
    });
    assert.ok(c.beta !== null && Math.abs(Number(c.beta) - 1) < 0.01, `beta=${c.beta}`);
    assert.ok(c.correlation !== null && Math.abs(Number(c.correlation) - 1) < 0.01, `corr=${c.correlation}`);
    assert.equal(c.tracking_error_pct, '0.00'); // identical returns → no tracking error
  });

  test('tolerates missing benchmark closes (forward-fills the index, skips pairs)', () => {
    const c = computeBenchmarkComparison({
      sampleDates: dates,
      portfolioReturns: [0.01, 0.01],
      benchmarkCloses: [100, null, 110],
      periodsPerYear: 252,
    });
    assert.equal(c.series[1]!.benchmark, null);
    assert.equal(c.series[2]!.benchmark, '110.00');
    assert.equal(c.benchmark_return_pct, '10.00');
    // Only one usable pair → beta/correlation undefined.
    assert.equal(c.beta, null);
  });

  test('no benchmark data → null comparison metrics, portfolio still indexed', () => {
    const c = computeBenchmarkComparison({
      sampleDates: dates,
      portfolioReturns: [0.02, 0.03],
      benchmarkCloses: [null, null, null],
      periodsPerYear: 252,
    });
    assert.equal(c.benchmark_return_pct, null);
    assert.equal(c.excess_return_pct, null);
    assert.equal(c.series[2]!.portfolio, (100 * 1.02 * 1.03).toFixed(2));
    assert.equal(c.series[2]!.benchmark, null);
  });
});
