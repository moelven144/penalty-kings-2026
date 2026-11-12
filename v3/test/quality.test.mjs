import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, TIER_ORDER, guessTier, refineTier, renderSize, makeWatchdog } from '../js/core/quality.js';

test('every tier defines every setting', () => {
  const keys = Object.keys(TIERS.high);
  for (const t of TIER_ORDER) assert.deepEqual(Object.keys(TIERS[t]), keys, t);
});

test('tiers get heavier from low to ultra', () => {
  for (let i = 1; i < TIER_ORDER.length; i++) {
    const a = TIERS[TIER_ORDER[i - 1]];
    const b = TIERS[TIER_ORDER[i]];
    assert.ok(b.renderScale >= a.renderScale);
    assert.ok(b.crowdDensity >= a.crowdDensity);
    assert.ok(b.grassBlades >= a.grassBlades);
  }
});

test('device guesses: iPhone 11 low, 13 medium (probe decides), 15 Pro high', () => {
  assert.equal(guessTier({ width: 414, height: 896, dpr: 2, isIOS: true }), 'low');
  assert.equal(guessTier({ width: 390, height: 844, dpr: 3, isIOS: true }), 'medium');
  assert.equal(guessTier({ width: 393, height: 852, dpr: 3, isIOS: true }), 'high');
  assert.equal(guessTier({ width: 440, height: 956, dpr: 3, isIOS: true }), 'high');
  assert.equal(guessTier({ width: 1032, height: 1376, dpr: 2, isIOS: true }), 'high');
});

test('the probe moves one step and never lifts a low device', () => {
  assert.equal(refineTier('medium', 5), 'high');
  assert.equal(refineTier('medium', 15.5), 'low');
  assert.equal(refineTier('medium', 10), 'medium');
  assert.equal(refineTier('low', 3), 'low');
  assert.equal(refineTier('ultra', 4), 'ultra');
});

test('the probe steps up only when the next level would use under 60% of the frame', () => {
  assert.equal(refineTier('high', 3), 'high'); // Ultra is never chosen automatically
  assert.equal(refineTier('medium', 6.6), 'high');
  assert.equal(refineTier('medium', 7), 'medium');
});

test('render size follows scale and caps the pixel ratio', () => {
  const s = renderSize('high', 390, 844, 3);
  assert.equal(s.width, Math.round(390 * 3 * 0.9));
  assert.equal(renderSize('low', 414, 896, 3).width, Math.round(414 * 2 * 0.6));
});

test('watchdog drops resolution after 3 bad seconds and recovers slowly', () => {
  const w = makeWatchdog(60);
  assert.equal(w.sample(40), false);
  assert.equal(w.sample(40), false);
  assert.equal(w.sample(40), true);
  assert.equal(w.scale, 0.9);
  for (let i = 0; i < 11; i++) assert.equal(w.sample(60), false);
  assert.equal(w.sample(60), true);
  assert.ok(w.scale > 0.9);
});
