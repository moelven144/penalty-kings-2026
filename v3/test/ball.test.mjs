import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulate, solveLaunch, newBall, stepBall, ballDone, STEP,
  GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS, POST_RADIUS, SPOT_DISTANCE, NET_DEPTH,
} from '../js/core/ball.js';
import { launchFor, resolveShot, standingKeeper, legacyKickToShot, SPIN_MAX } from '../js/core/shot.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} +-${eps}`);
const shot = (x, y, power, curve = 0, type = 'normal') => ({ target: { x, y }, power, curve, type });

test('the solver puts the ball where it was aimed, at any pace', () => {
  for (const [x, y] of [[0, 1.2], [3.2, 2.1], [-3.3, 0.3], [2.0, 0.11], [-1, 2.25]]) {
    for (const speed of [16, 24, 34]) {
      const l = solveLaunch({ x, y }, { speed });
      assert.ok(l.reached, `reached ${x},${y} at ${speed}`);
      const r = simulate({ v: l.v, sideSpin: 0, topSpin: 0 });
      near(r.crossing.x, x, 0.03, `x at ${speed}`);
      near(r.crossing.y, Math.max(y, BALL_RADIUS), 0.03, `y at ${speed}`);
    }
  }
});

test('a curled shot still arrives at the target, and its path bulges the way the swipe did', () => {
  for (const curve of [1, -1]) {
    const l = launchFor(shot(1.0, 1.2, 0.6, curve));
    const s = newBall(l);
    let widest = 0;
    while (s.p.z < SPOT_DISTANCE) {
      stepBall(s);
      const lineX = (s.p.z / SPOT_DISTANCE) * 1.0; // the straight line to the target
      if (Math.abs(s.p.x - lineX) > Math.abs(widest)) widest = s.p.x - lineX;
    }
    near(s.p.x, 1.0, 0.04, 'arrives at the target x');
    assert.ok(Math.sign(widest) === curve && Math.abs(widest) > 0.15, `bulge ${widest} for curve ${curve}`);
    // launched about a metre off the straight line and bent back
    assert.ok(Math.abs((l.v.x / l.v.z) * SPOT_DISTANCE - 1.0) > 0.6, 'bends back by more than half a metre');
  }
});

test('a full curler bends more than a metre off the straight line', () => {
  const l = launchFor(shot(0, 1.2, 0.6, 1, 'curler'));
  assert.ok(Math.abs(l.sideSpin) > SPIN_MAX);
  // launched to the right of the target to allow for the bend
  assert.ok(l.v.x / l.v.z * SPOT_DISTANCE > 1.0, `start offset ${l.v.x / l.v.z * SPOT_DISTANCE}`);
});

test('drag slows the ball: 34 m/s at the foot is under 31 m/s at the line', () => {
  const l = solveLaunch({ x: 0, y: 1 }, { speed: 34 });
  const s = newBall({ v: l.v });
  while (s.p.z < SPOT_DISTANCE) stepBall(s);
  const sp = Math.hypot(s.v.x, s.v.y, s.v.z);
  assert.ok(sp < 31 && sp > 27, `speed at line ${sp}`);
  assert.ok(s.t > 0.33 && s.t < 0.4, `time ${s.t}`);
});

test('inside the frame is a goal; the whole ball must cross the line', () => {
  const r = resolveShot(shot(2.5, 1.0, 0.6));
  assert.equal(r.outcome, 'goal');
  assert.equal(r.reason, 'clean');
  const goal = r.events.find((e) => e.type === 'goal');
  assert.ok(goal.t > r.crossing.t, 'goal is given after the centre crosses');
});

test('wide and over are misses, with the reason', () => {
  assert.deepEqual([resolveShot(shot(4.5, 1.0, 0.6)).outcome, resolveShot(shot(4.5, 1.0, 0.6)).reason], ['miss', 'wide']);
  assert.deepEqual([resolveShot(shot(0, 3.2, 0.6)).outcome, resolveShot(shot(0, 3.2, 0.6)).reason], ['miss', 'over']);
});

test('the inside of the post goes in, the outside comes out', () => {
  const inside = resolveShot(shot(GOAL_HALF_WIDTH - POST_RADIUS - 0.05, 1.0, 0.7));
  assert.equal(inside.outcome, 'goal');
  assert.equal(inside.reason, 'in-off-post');
  const outside = resolveShot(shot(GOAL_HALF_WIDTH + POST_RADIUS + 0.05, 1.0, 0.7));
  assert.equal(outside.outcome, 'post');
  assert.ok(outside.state.past || outside.state.p.z < SPOT_DISTANCE);
});

test('square on the post, the ball comes straight back out', () => {
  const r = resolveShot(shot(GOAL_HALF_WIDTH, 1.0, 0.8));
  assert.equal(r.outcome, 'post');
  const hit = r.events.find((e) => e.type === 'post');
  assert.ok(hit.speed > 15, `impact ${hit.speed}`);
});

test('the underside of the bar goes in, the top of the bar goes over', () => {
  const under = resolveShot(shot(0, GOAL_HEIGHT - POST_RADIUS - 0.06, 0.7));
  assert.equal(under.outcome, 'goal');
  assert.equal(under.reason, 'in-off-bar');
  const over = resolveShot(shot(0, GOAL_HEIGHT + POST_RADIUS + 0.06, 0.7));
  assert.equal(over.outcome, 'post');
  assert.equal(over.reason, 'bar');
});

test('the net catches the ball: it gives, holds, and the ball ends up inside the goal', () => {
  const l = launchFor(shot(1.5, 1.2, 1));
  const s = newBall(l);
  let deepest = 0;
  while (!ballDone(s)) { stepBall(s); if (s.netDepth > deepest) deepest = s.netDepth; }
  assert.ok(s.scored);
  assert.ok(deepest > 0.25 && deepest < 0.9, `net gave ${deepest} m`);
  assert.ok(s.p.z > SPOT_DISTANCE && s.p.z < SPOT_DISTANCE + NET_DEPTH + 0.2, `rest z ${s.p.z}`);
  assert.ok(Math.abs(s.p.x) < GOAL_HALF_WIDTH + 0.2);
  assert.ok(s.events.some((e) => e.type === 'net'));
});

test('a slow shot barely moves the net', () => {
  const s = newBall(launchFor(shot(0, 0.5, 0)));
  let deepest = 0;
  while (!ballDone(s)) { stepBall(s); if (s.netDepth > deepest) deepest = s.netDepth; }
  assert.ok(s.scored);
  assert.ok(deepest < 0.3, `net gave ${deepest} m`);
});

test('the side netting keeps a wide ball out', () => {
  const r = resolveShot(shot(GOAL_HALF_WIDTH + 0.4, 0.8, 0.5, 0));
  assert.equal(r.outcome, 'miss');
  assert.equal(r.state.scored, false);
});

test('a chip is high and slow and drops under the bar', () => {
  const l = launchFor(shot(0, 1.9, 0.2, 0, 'chip'));
  assert.ok(l.speed < 16, `speed ${l.speed}`);
  const s = newBall(l);
  let top = 0;
  while (s.p.z < SPOT_DISTANCE) { stepBall(s); if (s.p.y > top) top = s.p.y; }
  assert.ok(top > 3.0, `apex ${top}`);
  assert.ok(s.v.y < -3, 'dropping at the line');
  near(s.p.y, 1.9, 0.05, 'height at the line');
  assert.ok(s.t > 1.0, `flight time ${s.t}`);
  assert.equal(simulate(l).outcome, 'goal');
});

test('a driven shot is flat and fast', () => {
  const l = launchFor(shot(2.5, 0.3, 0.9, 0, 'driven'));
  const s = newBall(l);
  let top = 0;
  while (s.p.z < SPOT_DISTANCE) { stepBall(s); if (s.p.y > top) top = s.p.y; }
  assert.ok(top < 0.6, `apex ${top}`);
  assert.ok(s.t < 0.4, `time ${s.t}`);
});

test('the ball bounces and skids on the turf, and a driven ball keeps more pace', () => {
  const run = (skid) => {
    const s = newBall({ v: { x: 0, y: -3, z: 20 }, skid });
    s.p.y = 0.5;
    while (!s.events.some((e) => e.type === 'ground')) stepBall(s);
    return s;
  };
  const normal = run(0); const driven = run(1);
  assert.ok(normal.v.y > 1, 'bounces up');
  assert.ok(normal.v.z < 19, 'loses pace');
  assert.ok(driven.v.z > normal.v.z + 1, 'skids');
});

test('spin decays in flight', () => {
  const s = newBall({ v: { x: 0, y: 8, z: 12 }, sideSpin: 60 });
  for (let i = 0; i < 1 / STEP; i++) stepBall(s);
  assert.ok(s.sideSpin < 60 && s.sideSpin > 0);
});

test('a standing keeper stops a ball hit at the body, and it really rebounds', () => {
  const keeper = standingKeeper();
  const r = resolveShot(shot(0, 1.2, 0.7), keeper);
  assert.equal(r.outcome, 'save');
  assert.equal(r.reason, 'body');
  assert.ok(r.state.v.z < 0 || r.state.p.z < SPOT_DISTANCE, 'came back off the keeper');
  assert.equal(resolveShot(shot(3.0, 0.4, 0.7), keeper).outcome, 'goal');
});

test('the same launch always gives the same result', () => {
  const a = resolveShot(shot(3.55, 2.3, 0.83, 0.4));
  const b = resolveShot(shot(3.55, 2.3, 0.83, 0.4));
  assert.deepEqual(a.state, b.state);
});

test('an old challenge-link kick arrives where it was aimed', () => {
  const s = legacyKickToShot({ aimX: 0.8, aimY: 0.7, power: 0.6, curve: 0.5 });
  const r = resolveShot(s);
  near(r.crossing.x, 0.8 * (GOAL_HALF_WIDTH - BALL_RADIUS), 0.05, 'x');
  near(r.crossing.y, BALL_RADIUS + 0.7 * (GOAL_HEIGHT - 2 * BALL_RADIUS), 0.05, 'y');
  assert.equal(r.outcome, 'goal');
});
