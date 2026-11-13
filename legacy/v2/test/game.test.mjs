import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictCrossing, GOAL_HALF_WIDTH } from '../js/physics.js';
import { resolveSave, cpuKeeperPlan, runUpTell } from '../js/keeper.js';
import { swipeToKick, cpuKick, resolveKick } from '../js/kick.js';
import { newShootout, record, winner, nextTeam, isSuddenDeath } from '../js/rules.js';
import { encodeChallenge, decodeChallenge, quantise, readChallengeFromLocation } from '../js/challenge.js';
import { makeRng } from '../js/rng.js';

const STAND_STILL = { start: 99, x: 0, y: 1 };

test('a straight mid-power kick at the middle crosses near the aim point', () => {
  const c = predictCrossing({ aimX: 0, aimY: 0.5, power: 0.5, curve: 0 });
  assert.ok(Math.abs(c.x) < 0.05, `x=${c.x}`);
  assert.ok(c.y > 0.8 && c.y < 1.6, `y=${c.y}`);
  assert.ok(c.t > 0.3 && c.t < 0.8, `t=${c.t}`);
});

test('aiming at a corner lands near that corner', () => {
  const c = predictCrossing({ aimX: 0.85, aimY: 0.8, power: 0.6, curve: 0 });
  assert.ok(c.x > 2.6 && c.x < 3.5, `x=${c.x}`);
  assert.ok(c.y > 1.4 && c.y < 2.4, `y=${c.y}`);
});

test('curve bends the ball the way it says', () => {
  const straight = predictCrossing({ aimX: 0, aimY: 0.4, power: 0.5, curve: 0 });
  const right = predictCrossing({ aimX: 0, aimY: 0.4, power: 0.5, curve: 1 });
  const left = predictCrossing({ aimX: 0, aimY: 0.4, power: 0.5, curve: -1 });
  assert.ok(right.x - straight.x > 0.5, `right bend ${right.x - straight.x}`);
  assert.ok(straight.x - left.x > 0.5, `left bend ${straight.x - left.x}`);
});

test('over-hitting lifts the ball over the bar', () => {
  const r = resolveKick({ aimX: 0.3, aimY: 0.95, power: 1, curve: 0 }, STAND_STILL);
  assert.equal(r.outcome, 'miss');
  assert.equal(r.reason, 'over');
});

test('aiming wide misses', () => {
  const r = resolveKick({ aimX: 1.4, aimY: 0.3, power: 0.6, curve: 0 }, STAND_STILL);
  assert.ok(['miss', 'post'].includes(r.outcome));
});

test('keeper standing still saves a ball at the body, not in the corner', () => {
  assert.equal(resolveKick({ aimX: 0.02, aimY: 0.4, power: 0.5, curve: 0 }, STAND_STILL).outcome, 'save');
  assert.equal(resolveKick({ aimX: 0.85, aimY: 0.2, power: 0.6, curve: 0 }, STAND_STILL).outcome, 'goal');
});

test('a keeper who guessed right early saves the corner', () => {
  const kick = { aimX: 0.8, aimY: 0.3, power: 0.55, curve: 0 };
  const c = predictCrossing(kick);
  assert.equal(resolveSave({ start: -0.05, x: c.x, y: c.y }, c).result, 'save');
  assert.equal(resolveSave({ start: -0.05, x: -c.x, y: c.y }, c).result, 'goal');
});

test('a Panenka down the middle beats a keeper who dived early', () => {
  const kick = { aimX: 0, aimY: 0.45, power: 0.25, curve: 0 };
  const r = resolveKick(kick, { start: -0.05, x: 2.5, y: 1 });
  assert.equal(r.outcome, 'goal');
});

test('swipe up-right becomes a kick to the right; faster = more power', () => {
  const slow = swipeToKick([
    { x: 0.5, y: 0.9, t: 0 },
    { x: 0.6, y: 0.7, t: 0.15 },
    { x: 0.7, y: 0.5, t: 0.3 },
  ]);
  const fast = swipeToKick([
    { x: 0.5, y: 0.9, t: 0 },
    { x: 0.6, y: 0.7, t: 0.05 },
    { x: 0.7, y: 0.5, t: 0.1 },
  ]);
  assert.ok(slow.aimX > 0.4);
  assert.ok(fast.power > slow.power);
  assert.equal(slow.curve, 0);
});

test('a swipe that bends right at the end curls right', () => {
  const k = swipeToKick([
    { x: 0.5, y: 0.9, t: 0 },
    { x: 0.47, y: 0.75, t: 0.05 },
    { x: 0.47, y: 0.6, t: 0.1 },
    { x: 0.53, y: 0.5, t: 0.15 },
  ]);
  assert.ok(k.curve > 0.15, `curve=${k.curve}`);
});

test('taps and downward swipes are ignored', () => {
  assert.equal(swipeToKick([{ x: 0.5, y: 0.5, t: 0 }, { x: 0.5, y: 0.52, t: 0.1 }]), null);
});

test('shootout rules: early finish, sudden death', () => {
  const s = newShootout();
  // team 0 scores 3, team 1 misses 3 -> decided 3-0 after 3 each
  for (let i = 0; i < 3; i++) {
    record(s, nextTeam(s), true);
    record(s, nextTeam(s), false);
  }
  assert.equal(winner(s), 0);

  const sd = newShootout();
  for (let i = 0; i < 5; i++) {
    record(sd, 0, true);
    record(sd, 1, true);
  }
  assert.equal(winner(sd), null);
  assert.ok(isSuddenDeath(sd));
  record(sd, 0, false);
  assert.equal(winner(sd), null); // team 1 still to kick
  record(sd, 1, true);
  assert.equal(winner(sd), 1);
});

test('challenge link round-trips and rejects damage', () => {
  const rng = makeRng(42);
  const kicks = Array.from({ length: 5 }, () => cpuKick(0.7, rng));
  const code = encodeChallenge({ nation: 31, scored: 4, seed: 123456789, kicks });
  assert.ok(code.length <= 40, `length ${code.length}`);
  const back = decodeChallenge(code);
  assert.equal(back.nation, 31);
  assert.equal(back.scored, 4);
  assert.equal(back.seed, 123456789);
  back.kicks.forEach((k, i) => {
    const q = quantise(kicks[i]);
    for (const f of ['aimX', 'aimY', 'power', 'curve']) assert.ok(Math.abs(k[f] - q[f]) < 1e-9);
  });
  const broken = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
  assert.equal(decodeChallenge(broken), null);
  assert.equal(readChallengeFromLocation('#c=' + code).scored, 4);
});

test('balance: CPU vs CPU scores about 3 in 4, like real penalties', () => {
  const rng = makeRng(7);
  let goals = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const kick = cpuKick(0.6, rng);
    const c = predictCrossing(kick);
    const plan = cpuKeeperPlan(c, runUpTell(kick.aimX, 0.5, rng), { reach: 0.6, reaction: 0.5, reading: 0.5 }, rng);
    if (resolveKick(kick, plan).outcome === 'goal') goals++;
  }
  const rate = goals / N;
  assert.ok(rate > 0.66 && rate < 0.84, `conversion ${(rate * 100).toFixed(1)}%`);
});

test('goal width constant matches the real 7.32 m', () => {
  assert.equal(GOAL_HALF_WIDTH * 2, 7.32);
});
