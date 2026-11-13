import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringPoint, RING_LENGTH, GOAL_Z, PITCH_CZ, PITCH_HALF_W, tierY, STAND } from '../js/render/layout.js';

test('the stand ring is closed, continuous and outside the pitch', () => {
  const n = 2000;
  let prev = ringPoint(0);
  let len = 0;
  for (let i = 1; i <= n; i++) {
    const p = ringPoint(i / n);
    const step = Math.hypot(p.x - prev.x, p.z - prev.z);
    assert.ok(step < (RING_LENGTH / n) * 1.5, `jump at ${i}: ${step}`);
    len += step;
    assert.ok(Math.abs(p.x) > PITCH_HALF_W || Math.abs(p.z - PITCH_CZ) > 52.5, 'inside the pitch');
    assert.ok(Math.abs(Math.hypot(p.nx, p.nz) - 1) < 1e-9);
    prev = p;
  }
  assert.ok(Math.abs(len - RING_LENGTH) < 0.5, `length ${len} vs ${RING_LENGTH}`);
});

test('t = 0 is behind the goal, facing away from the pitch', () => {
  const p = ringPoint(0);
  assert.ok(Math.abs(p.x) < 1e-9);
  assert.ok(p.z < GOAL_Z - 5);
  assert.equal(p.nz, -1);
  assert.ok(ringPoint(0, 10).z < p.z, 'offset moves outward');
});

test('tiers rise away from the pitch', () => {
  assert.ok(tierY(STAND.lowerTier, 13) > tierY(STAND.lowerTier, 0));
  assert.ok(tierY(STAND.upperTier, 30) > tierY(STAND.upperTier, 15));
});
