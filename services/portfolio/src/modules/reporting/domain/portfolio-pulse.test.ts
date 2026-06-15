import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolioPulse, PORTFOLIO_PULSE_VERSION, type PortfolioPulseInput } from './portfolio-pulse.js';

const healthyDataQuality = { pricedValueRatio: 1, freshValueRatio: 1, hasInvalidPositions: false };

function input(over: Partial<PortfolioPulseInput>): PortfolioPulseInput {
  return {
    instrumentValues: [25, 25, 25, 25],
    risk: { volatilityPct: 0, downsideVolatilityPct: 0, maxDrawdownPct: 0 },
    dataQuality: healthyDataQuality,
    ...over,
  };
}

describe('computePortfolioPulse — structure', () => {
  test('a single holding scores 0 on structure (fully concentrated)', () => {
    const pulse = computePortfolioPulse(input({ instrumentValues: [1000] }));
    assert.equal(pulse.components.structure.score, 0);
    assert.equal(pulse.components.structure.hhi, 1);
    assert.equal(pulse.components.structure.top1_pct, 100);
  });

  test('four equal holdings: HHI 0.25 → structure 75, top3 75%', () => {
    const pulse = computePortfolioPulse(input({ instrumentValues: [25, 25, 25, 25] }));
    assert.equal(pulse.components.structure.hhi, 0.25);
    assert.equal(pulse.components.structure.score, 75);
    assert.equal(pulse.components.structure.top1_pct, 25);
    assert.equal(pulse.components.structure.top3_pct, 75);
  });

  test('aggregated values drive weights regardless of order', () => {
    const pulse = computePortfolioPulse(input({ instrumentValues: [10, 90] }));
    assert.equal(pulse.components.structure.top1_pct, 90);
    // HHI = 0.81 + 0.01 = 0.82 → score 18
    assert.equal(pulse.components.structure.hhi, 0.82);
    assert.equal(pulse.components.structure.score, 18);
  });
});

describe('computePortfolioPulse — risk', () => {
  test('zero vol/drawdown → risk 100; high vol/drawdown → low', () => {
    const calm = computePortfolioPulse(input({ risk: { volatilityPct: 0, downsideVolatilityPct: 0, maxDrawdownPct: 0 } }));
    assert.equal(calm.components.risk.score, 100);
    // vol 40 → 0, downside 20 → 50, drawdown 50 → 0; blend 0.4*0+0.2*50+0.4*0 = 10
    const wild = computePortfolioPulse(input({ risk: { volatilityPct: 40, downsideVolatilityPct: 20, maxDrawdownPct: -50 } }));
    assert.equal(wild.components.risk.score, 10);
  });
});

describe('computePortfolioPulse — data quality', () => {
  test('full coverage/fresh/valid → 100; gaps lower it', () => {
    const good = computePortfolioPulse(input({}));
    assert.equal(good.components.data_quality.score, 100);
    // coverage 0.5→50, fresh 0→0, invalid→0 : 0.5*50 + 0.3*0 + 0.2*0 = 25
    const bad = computePortfolioPulse(
      input({ dataQuality: { pricedValueRatio: 0.5, freshValueRatio: 0, hasInvalidPositions: true } }),
    );
    assert.equal(bad.components.data_quality.score, 25);
    assert.equal(bad.components.data_quality.ledger_valid, false);
  });
});

describe('computePortfolioPulse — weighting, status, confidence', () => {
  test('all components present: structure-led 45/30/25, full confidence', () => {
    // structure 75, risk 100, dq 100 → 0.45*75 + 0.30*100 + 0.25*100 = 88.75 → 89
    const pulse = computePortfolioPulse(input({}));
    assert.equal(pulse.version, PORTFOLIO_PULSE_VERSION);
    assert.equal(pulse.score, 89);
    assert.equal(pulse.status, 'strong');
    assert.equal(pulse.confidence, 1);
    assert.equal(pulse.components.structure.weight, 0.45);
    assert.equal(pulse.components.risk.weight, 0.3);
    assert.equal(pulse.components.data_quality.weight, 0.25);
  });

  test('missing risk reweights structure+data quality and lowers confidence to 0.70', () => {
    // available weight 0.45+0.25 = 0.70; reweighted structure 0.643, dq 0.357
    // score = (0.45*75 + 0.25*100)/0.70 = 58.75/0.70 = 83.9 → 84
    const pulse = computePortfolioPulse(input({ risk: null }));
    assert.equal(pulse.components.risk.available, false);
    assert.equal(pulse.components.risk.score, null);
    assert.equal(pulse.components.risk.weight, 0);
    assert.equal(pulse.score, 84);
    assert.equal(pulse.confidence, 0.7);
    assert.equal(pulse.components.structure.weight, 0.64);
    assert.equal(pulse.components.data_quality.weight, 0.36);
  });

  test('unpriced value further reduces confidence', () => {
    const pulse = computePortfolioPulse(
      input({ dataQuality: { pricedValueRatio: 0.5, freshValueRatio: 1, hasInvalidPositions: false } }),
    );
    assert.equal(pulse.confidence, 0.5); // availability 1.0 × coverage 0.5
  });

  test('no holdings and no risk → insufficient_data, null score', () => {
    const pulse = computePortfolioPulse({
      instrumentValues: [],
      risk: null,
      dataQuality: { pricedValueRatio: 0, freshValueRatio: 0, hasInvalidPositions: false },
    });
    assert.equal(pulse.status, 'insufficient_data');
    assert.equal(pulse.score, null);
    assert.equal(pulse.primary_driver, null);
  });

  test('primary driver is the lowest-scoring available component', () => {
    // structure low (single holding → 0), risk high, dq high → structure drags
    const pulse = computePortfolioPulse(input({ instrumentValues: [1000] }));
    assert.equal(pulse.primary_driver, 'structure');
  });

  test('status thresholds across hand-built scores', () => {
    // strong ≈ 89: structure 75, risk 100, dq 100.
    assert.equal(computePortfolioPulse(input({})).status, 'strong');

    // balanced ≈ 61: structure 75, risk 50, dq 50.
    const balanced = computePortfolioPulse(
      input({
        instrumentValues: [25, 25, 25, 25],
        risk: { volatilityPct: 20, downsideVolatilityPct: 20, maxDrawdownPct: -25 },
        dataQuality: { pricedValueRatio: 0.375, freshValueRatio: 0.375, hasInvalidPositions: false },
      }),
    );
    assert.equal(balanced.score, 61);
    assert.equal(balanced.status, 'balanced');

    // fragile ≈ 45: structure 50, risk 40, dq 40.
    const fragile = computePortfolioPulse(
      input({
        instrumentValues: [50, 50],
        risk: { volatilityPct: 24, downsideVolatilityPct: 24, maxDrawdownPct: -30 },
        dataQuality: { pricedValueRatio: 0.25, freshValueRatio: 0.25, hasInvalidPositions: false },
      }),
    );
    assert.equal(fragile.status, 'fragile');

    // at_risk ≈ 11: structure 0, risk 20, dq 20.
    const atRisk = computePortfolioPulse(
      input({
        instrumentValues: [1000],
        risk: { volatilityPct: 32, downsideVolatilityPct: 32, maxDrawdownPct: -40 },
        dataQuality: { pricedValueRatio: 0, freshValueRatio: 0, hasInvalidPositions: false },
      }),
    );
    assert.equal(atRisk.status, 'at_risk');
  });
});
