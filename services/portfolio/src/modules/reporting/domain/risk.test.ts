import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeRisk } from './risk.js';

describe('computeRisk', () => {
  test('insufficient data yields nulls', () => {
    const r = computeRisk({ returns: [0.01], periodsPerYear: 252 });
    assert.equal(r.sample_count, 1);
    assert.equal(r.volatility_pct, null);
    assert.equal(r.max_drawdown_pct, null);
  });

  test('zero-variance returns: volatility 0, no Sharpe', () => {
    const r = computeRisk({ returns: [0.01, 0.01, 0.01, 0.01], periodsPerYear: 252 });
    assert.equal(r.volatility_pct, '0.00');
    assert.equal(r.sharpe, null); // undefined with zero volatility
    assert.equal(r.max_drawdown_pct, '0.00'); // monotonic rise
    assert.equal(r.best_period_pct, '1.00');
    assert.equal(r.worst_period_pct, '1.00');
  });

  test('annualizes volatility by sqrt(periodsPerYear)', () => {
    // alternating ±1% → per-period stdev 0.01; annualized = 0.01·√252 ≈ 15.87%.
    const r = computeRisk({ returns: [0.01, -0.01, 0.01, -0.01], periodsPerYear: 252 });
    assert.equal(r.volatility_pct, (0.01 * Math.sqrt(252) * 100).toFixed(2));
  });

  test('max drawdown captures the worst peak-to-trough decline', () => {
    // +10%, −20%, +5%: peak 1.1, trough 0.88 → drawdown (1.1−0.88)/1.1 = 20%.
    const r = computeRisk({ returns: [0.1, -0.2, 0.05], periodsPerYear: 252 });
    assert.equal(r.max_drawdown_pct, '20.00');
    assert.equal(r.worst_period_pct, '-20.00');
    assert.equal(r.best_period_pct, '10.00');
  });

  test('Sharpe is positive for steady gains and nets the risk-free rate', () => {
    const base = computeRisk({ returns: [0.01, 0.02, 0.01, 0.015, 0.005], periodsPerYear: 252 });
    assert.ok(base.sharpe !== null && Number(base.sharpe) > 0);
    const withRf = computeRisk({ returns: [0.01, 0.02, 0.01, 0.015, 0.005], periodsPerYear: 252, riskFreeRate: 0.03 });
    assert.ok(Number(withRf.sharpe) < Number(base.sharpe)); // risk-free reduces excess return
  });

  test('Sortino ignores upside volatility (no negatives → null)', () => {
    const r = computeRisk({ returns: [0.01, 0.02, 0.03], periodsPerYear: 252 });
    assert.equal(r.downside_volatility_pct, '0.00');
    assert.equal(r.sortino, null);
  });
});
