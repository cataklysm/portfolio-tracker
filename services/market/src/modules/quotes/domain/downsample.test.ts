import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectPointsToStore, type SeriesPoint } from './downsample.js';

const pt = (timeMs: number, close = '1'): SeriesPoint => ({ timeMs, close });

describe('selectPointsToStore', () => {
  test('keeps one point per resolution window, evenly spaced', () => {
    const points = [pt(0), pt(10_000), pt(20_000), pt(30_000), pt(40_000), pt(50_000)];
    // 20s resolution from the start: keep 0s, then 20s, then 40s.
    const kept = selectPointsToStore(points, null, 20_000);
    assert.deepEqual(kept.map((p) => p.timeMs), [0, 20_000, 40_000]);
  });

  test('continues spacing from the last saved point and drops already-stored points', () => {
    const points = [pt(10_000), pt(20_000), pt(30_000), pt(40_000)];
    // Last saved at 15s, 20s resolution: 10s/20s dropped (<= 15s floor or < 35s),
    // 30s dropped (< 35s gap from 15s), 40s kept (>= 35s).
    const kept = selectPointsToStore(points, 15_000, 20_000);
    assert.deepEqual(kept.map((p) => p.timeMs), [40_000]);
  });

  test('no resolution keeps every point newer than the last saved', () => {
    const points = [pt(1000), pt(2000), pt(3000)];
    assert.deepEqual(selectPointsToStore(points, 1500, 0).map((p) => p.timeMs), [2000, 3000]);
    assert.deepEqual(selectPointsToStore(points, null, null).map((p) => p.timeMs), [1000, 2000, 3000]);
  });

  test('keeps every point when the feed is coarser than the resolution', () => {
    const points = [pt(0), pt(60_000), pt(120_000)]; // 1-min feed
    const kept = selectPointsToStore(points, null, 10_000); // ask for 10s
    assert.deepEqual(kept.map((p) => p.timeMs), [0, 60_000, 120_000]);
  });

  test('empty series yields nothing', () => {
    assert.deepEqual(selectPointsToStore([], null, 5000), []);
  });
});
