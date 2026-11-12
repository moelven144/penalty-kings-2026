// One test (or more) per gesture rule in section 5 of v2/REBUILD_PLAN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES, canStart, swipePower, speedFor, overhitRise, swipeBulge, curveFromBulge, strikeTiming,
  scatterRadius, scatterOffset, restBeforeRelease, classifyShot, readSwipe,
} from '../js/core/gesture.js';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '../js/core/ball.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} +-${eps}`);

/** A straight upward swipe at a constant speed (screen heights per second), sampled at 120 Hz. */
function swipe({ speed = 2, length = 0.4, startT = 0.7, dx = 0, bulge = 0, rest = 0 }) {
  const dur = length / speed;
  const pts = [{ x: 0.25, y: 0.8, t: 0 }];
  if (startT > 0) pts.push({ x: 0.25, y: 0.8, t: startT });
  const n = Math.max(2, Math.round(dur * 120));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    pts.push({ x: 0.25 + dx * k + bulge * length * Math.sin(Math.PI * k), y: 0.8 - length * k, t: startT + dur * k });
  }
  const end = pts[pts.length - 1];
  if (rest > 0) for (let t = 1 / 120; t <= rest + 1e-9; t += 1 / 120) pts.push({ x: end.x, y: end.y, t: end.t + t });
  return pts;
}
// a simple stand-in camera: the goal spans x 0.05..0.45 on screen, the goal line is at y 0.45 and the bar at y 0.25
const project = (x, y) => ({ x: ((x - 0.25) / 0.2) * GOAL_HALF_WIDTH, y: ((0.45 - y) / 0.2) * GOAL_HEIGHT });

test('rule 1: the touch must land within 12% of screen height of the ball', () => {
  const ball = { x: 0.25, y: 0.8 };
  assert.equal(canStart({ x: 0.25, y: 0.8 }, ball), true);
  assert.equal(canStart({ x: 0.25 + 0.119, y: 0.8 }, ball), true);
  assert.equal(canStart({ x: 0.25, y: 0.8 - 0.121 }, ball), false);
  assert.equal(RULES.runUp, 0.9);
});

test('rule 3: the release point, projected onto the goal plane, is the aim', () => {
  const s = readSwipe(swipe({ length: 0.4, dx: 0.1 }), project, 1);
  near(s.aim.x, (0.1 / 0.2) * GOAL_HALF_WIDTH, 1e-6, 'aim x');
  near(s.aim.y, ((0.45 - 0.4) / 0.2) * GOAL_HEIGHT, 1e-6, 'aim y');
});

test('rule 3: aiming outside the frame is allowed', () => {
  const s = readSwipe(swipe({ length: 0.4, dx: 0.3 }), project, 1);
  assert.ok(s.aim.x > GOAL_HALF_WIDTH);
});

test('rule 4: 0.8 heights/s is a pass at 16 m/s, 3.2 is maximum at 34 m/s', () => {
  near(swipePower(swipe({ speed: 0.8 })).power, 0, 0.01);
  near(swipePower(swipe({ speed: 3.2 })).power, 1, 0.01);
  near(swipePower(swipe({ speed: 2.0 })).power, 0.5, 0.01);
  assert.equal(swipePower(swipe({ speed: 5 })).power, 1);
  assert.equal(speedFor(0), 16);
  assert.equal(speedFor(1), 34);
});

test('rule 4: power is the fastest 120 ms, so holding first or easing off does not dilute it', () => {
  const fast = swipe({ speed: 3.0, length: 0.4, startT: 0 });
  const held = swipe({ speed: 3.0, length: 0.4, startT: 0.75 });
  near(swipePower(held).power, swipePower(fast).power, 0.01);
  // slow start, then a fast flick
  const slow = swipe({ speed: 0.6, length: 0.1, startT: 0 });
  const end = slow[slow.length - 1];
  const flick = swipe({ speed: 3.0, length: 0.4, startT: 0 }).slice(1).map((p) => ({ x: p.x, y: p.y - 0.1, t: p.t + end.t }));
  near(swipePower([...slow, ...flick]).power, swipePower(fast).power, 0.02);
});

test('rule 4: a flick shorter than 120 ms is measured over its own time, not diluted by the hold before it', () => {
  // 0.25 screen heights in 80 ms after resting on the ball for 0.8 s: 3.1 heights/s
  const pts = swipe({ speed: 3.125, length: 0.25, startT: 0.8 });
  near(swipePower(pts).peak, 3.125, 0.1);
  assert.ok(swipePower(pts).power > 0.9);
  // and a single jumpy sample cannot fake a blast: 50 ms is the shortest time used
  const jump = [{ x: 0.25, y: 0.8, t: 0 }, { x: 0.25, y: 0.8, t: 0.8 }, { x: 0.25, y: 0.7, t: 0.808 }];
  near(swipePower(jump).peak, 0.1 / 0.05, 0.01);
});

test('rule 4: above 90% power the ball rises: +0.25 m at 95%, +0.7 m at 100%', () => {
  assert.equal(overhitRise(0.9), 0);
  assert.equal(overhitRise(0.5), 0);
  near(overhitRise(0.95), 0.25, 0.01);
  near(overhitRise(1), 0.7, 1e-9);
});

test('rule 4: blasting at the top corner sends the target over the bar', () => {
  const pts = swipe({ speed: 3.4, length: 0.535, dx: 0.17, startT: 0.75 });
  const s = readSwipe(pts, project, 3);
  assert.ok(s.aim.y < GOAL_HEIGHT, 'the finger pointed under the bar');
  assert.ok(s.target.y - s.scatter.y > GOAL_HEIGHT, `target ${s.target.y}`);
});

test('rule 5: bulge is measured against the straight line, as a fraction of swipe length', () => {
  near(swipeBulge(swipe({ bulge: 0 })), 0, 1e-9);
  near(swipeBulge(swipe({ bulge: 0.2 })), 0.2, 0.01);
  near(swipeBulge(swipe({ bulge: -0.2 })), -0.2, 0.01);
});

test('rule 5: under 6% no curve; 6% to 25% maps to 0..max, in the direction of the bulge', () => {
  assert.equal(curveFromBulge(0.059), 0);
  assert.equal(curveFromBulge(-0.059), 0);
  near(curveFromBulge(0.155), 0.5, 1e-9);
  assert.equal(curveFromBulge(0.25), 1);
  assert.equal(curveFromBulge(0.4), 1);
  assert.equal(curveFromBulge(-0.25), -1);
});

test('rule 6: perfect within 60 ms of the plant, clean within 160 ms', () => {
  assert.equal(strikeTiming(0.9).grade, 'perfect');
  assert.equal(strikeTiming(0.9 + 0.059).grade, 'perfect');
  assert.equal(strikeTiming(0.9 - 0.059).grade, 'perfect');
  assert.equal(strikeTiming(0.9 + 0.061).grade, 'clean');
  assert.equal(strikeTiming(0.9 - 0.159).grade, 'clean');
  assert.equal(strikeTiming(0.9).scatter, 0.4);
  assert.equal(strikeTiming(1.0).scatter, 1);
});

test('rule 6: an early release waits for the plant and is rushed (scatter x1.6)', () => {
  const t = strikeTiming(0.3);
  assert.equal(t.grade, 'rushed');
  assert.equal(t.scatter, 1.6);
  assert.equal(t.powerMul, 1);
  assert.equal(t.strikeT, 0.9);
});

test('rule 6: later than +160 ms is scuffed (scatter x2.2, power x0.85), struck when the finger lifts', () => {
  const t = strikeTiming(0.9 + 0.2);
  assert.equal(t.grade, 'scuffed');
  assert.equal(t.scatter, 2.2);
  assert.equal(t.powerMul, 0.85);
  near(t.strikeT, 1.1, 1e-9);
  const s = readSwipe(swipe({ speed: 3.2, startT: 1.0 }), project, 1);
  near(s.power, 0.85, 0.01);
});

test('rule 7: scatter radius = 0.10 m + 0.45 m x power^2, times the timing factor', () => {
  near(scatterRadius(0, 1), 0.10, 1e-9);
  near(scatterRadius(1, 1), 0.55, 1e-9);
  near(scatterRadius(0.5, 0.4), (0.10 + 0.45 * 0.25) * 0.4, 1e-9);
  near(scatterRadius(1, 2.2), 0.55 * 2.2, 1e-9);
});

test('rule 7: scatter is seeded per kick, the same for everyone, and stays inside its radius', () => {
  assert.deepEqual(scatterOffset(0.6, 1, 42), scatterOffset(0.6, 1, 42));
  assert.notDeepEqual(scatterOffset(0.6, 1, 42), scatterOffset(0.6, 1, 43));
  for (let seed = 1; seed < 400; seed++) {
    const o = scatterOffset(0.8, 1.6, seed);
    assert.ok(Math.hypot(o.x, o.y) <= o.radius + 1e-12);
  }
});

test('rule 7: scatter is unbiased (no hidden help left, right, up or down)', () => {
  let sx = 0; let sy = 0; const n = 4000;
  for (let seed = 1; seed <= n; seed++) { const o = scatterOffset(0.7, 1, seed); sx += o.x; sy += o.y; }
  near(sx / n, 0, 0.01, 'mean x');
  near(sy / n, 0, 0.01, 'mean y');
});

test('rule 7: the same swipe and seed always give the same shot', () => {
  const pts = swipe({ speed: 2.4, dx: 0.08, bulge: 0.1 });
  assert.deepEqual(readSwipe(pts, project, 99), readSwipe(pts, project, 99));
});

test('rule 8 chip: slow, ending in the middle third, finger rested 120 ms', () => {
  const pts = swipe({ speed: 1.0, length: 0.42, rest: 0.13 });
  assert.ok(restBeforeRelease(pts) >= 0.12);
  assert.equal(readSwipe(pts, project, 1).type, 'chip');
  // no rest: an ordinary slow shot
  assert.equal(readSwipe(swipe({ speed: 1.0, length: 0.42 }), project, 1).type, 'normal');
  // rested but too hard, or out towards a post
  assert.equal(classifyShot({ power: 0.31, bulge: 0, rest: 0.2, target: { x: 0, y: 1.5 } }), 'normal');
  assert.equal(classifyShot({ power: 0.2, bulge: 0, rest: 0.2, target: { x: GOAL_HALF_WIDTH / 3 + 0.01, y: 1.5 } }), 'normal');
  assert.equal(classifyShot({ power: 0.2, bulge: 0, rest: 0.119, target: { x: 0, y: 1.5 } }), 'normal');
});

test('rule 8 driven: over 75% power with the release in the lower third of the goal', () => {
  assert.equal(classifyShot({ power: 0.76, bulge: 0, rest: 0, target: { x: 2, y: GOAL_HEIGHT / 3 - 0.01 } }), 'driven');
  assert.equal(classifyShot({ power: 0.75, bulge: 0, rest: 0, target: { x: 2, y: 0.3 } }), 'normal');
  assert.equal(classifyShot({ power: 0.9, bulge: 0, rest: 0, target: { x: 2, y: GOAL_HEIGHT / 3 + 0.01 } }), 'normal');
  assert.equal(readSwipe(swipe({ speed: 3.0, length: 0.37, dx: 0.1 }), project, 1).type, 'driven');
});

test('rule 8 curler: bulge over 15% and power 45% to 80%', () => {
  assert.equal(classifyShot({ power: 0.6, bulge: 0.16, rest: 0, target: { x: 2, y: 1.5 } }), 'curler');
  assert.equal(classifyShot({ power: 0.6, bulge: -0.16, rest: 0, target: { x: 2, y: 1.5 } }), 'curler');
  assert.equal(classifyShot({ power: 0.6, bulge: 0.15, rest: 0, target: { x: 2, y: 1.5 } }), 'normal');
  assert.equal(classifyShot({ power: 0.44, bulge: 0.2, rest: 0, target: { x: 2, y: 1.5 } }), 'normal');
  assert.equal(classifyShot({ power: 0.81, bulge: 0.2, rest: 0, target: { x: 2, y: 1.5 } }), 'normal');
});

test('a tap or a tiny drag is not a shot', () => {
  assert.equal(readSwipe([{ x: 0.25, y: 0.8, t: 0 }], project, 1), null);
  assert.equal(readSwipe([{ x: 0.25, y: 0.8, t: 0 }, { x: 0.26, y: 0.77, t: 0.3 }], project, 1), null);
});
