// Saving rules from section 5 of v3/REBUILD_PLAN.md, and the honesty of both AIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEEPER, playerDive, stayPut, handsAt, keeperBody, keeperObstacles } from '../js/core/save.js';
import { LEVELS, strikerTraits, strikerPlan, strikerCues, strikerReact, strikerShot, keeperDive, keeperTraits, firstCommit, freeCrossing, keeperCrossing } from '../js/core/ai.js';
import { launchFor } from '../js/core/shot.js';
import { simulate, GOAL_HALF_WIDTH } from '../js/core/ball.js';
import { makeRng } from '../js/core/rng.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} +-${eps}`);
const shot = (x, y, power, curve = 0, type = 'normal') => ({ target: { x, y }, power, curve, type });

test('saving rule 2: the keeper dives at up to 6.2 m/s after a 70 ms push-off', () => {
  const d = playerDive({ x: 3, y: 1.05 }, 0.2);
  assert.equal(handsAt(d, 0.2 + 0.069).moved, 0);
  near(handsAt(d, 0.2 + 0.07 + 0.25).moved, 6.2 * 0.25, 1e-6);
  near(handsAt(d, 0.2 + 0.07 + 0.25).vx, 6.2, 1e-6);
  near(handsAt(d, 5).x, 3, 1e-9, 'arrives and stops');
  assert.equal(handsAt(d, 5).vx, 0);
});

test('saving rule 3: released 0 to 90 ms after the strike is a perfect dive (+15% speed)', () => {
  assert.equal(playerDive({ x: 2, y: 1 }, 0).grade, 'perfect');
  assert.equal(playerDive({ x: 2, y: 1 }, 0.09).grade, 'perfect');
  assert.equal(playerDive({ x: 2, y: 1 }, 0.091).grade, 'normal');
  assert.equal(playerDive({ x: 2, y: 1 }, -0.01).grade, 'early');
  const p = playerDive({ x: 3, y: 1.05 }, 0.05);
  near(handsAt(p, 0.05 + 0.07 + 0.2).moved, 6.2 * 1.15 * 0.2, 1e-6);
});

test('saving rule 3: later dives simply have less time, so far corners become unreachable', () => {
  const corner = shot(2.3, 0.4, 0.6);
  const launch = launchFor(corner);
  const cross = freeCrossing(launch);
  const early = simulate(launch, keeperObstacles(playerDive({ x: cross.x, y: cross.y }, 0.02)));
  const late = simulate(launch, keeperObstacles(playerDive({ x: cross.x, y: cross.y }, 0.3)));
  assert.equal(early.outcome, 'save');
  assert.equal(late.outcome, 'goal');
});

test('saving rule 4: the outcome comes from the collision: hands catch slow central balls and parry fast ones', () => {
  const slow = simulate(launchFor(shot(0, 1.05, 0)), keeperObstacles(stayPut()));
  assert.equal(KEEPER.catchSpeed, 18);
  assert.equal(slow.outcome, 'save');
  assert.ok(slow.state.held, 'held');
  const fast = simulate(launchFor(shot(0.1, 1.05, 1)), keeperObstacles(stayPut()));
  assert.equal(fast.outcome, 'save');
  assert.ok(!fast.state.held, 'too hot to hold: parried');
});

test('saving rule 4: a parried shot can still creep in', () => {
  // a fingertip on a ball going just inside the post: some go in, some are pushed away. Both must happen.
  let goals = 0; let saves = 0;
  for (let i = 0; i < 200; i++) {
    const y = 0.3 + (i % 8) * 0.2; const reach = 2.0 + (i % 25) * 0.04; const x = 3.2 + (i % 3) * 0.12;
    const r = simulate(launchFor(shot(x, y, 0.5)), keeperObstacles(playerDive({ x: reach, y }, -0.15)));
    if (r.events.some((e) => e.type === 'hands' || e.type === 'arms')) { if (r.outcome === 'goal') goals++; else saves++; }
  }
  assert.ok(goals > 0 && saves > 0, `touched: ${goals} went in, ${saves} kept out`);
});

test('saving rule 5: staying put stops chips and central drives', () => {
  const chip = launchFor(shot(0.2, 1.9, 0.2, 0, 'chip'));
  assert.equal(simulate(chip, keeperObstacles(stayPut(keeperCrossing(chip)))).outcome, 'save');
  const drive = launchFor(shot(-0.2, 0.9, 0.9, 0, 'driven'));
  assert.equal(simulate(drive, keeperObstacles(stayPut(keeperCrossing(drive)))).outcome, 'save');
  // but the reflex only covers the middle: a shot a metre and a half away beats a keeper who stood still
  const wide = launchFor(shot(1.9, 0.5, 0.6));
  assert.equal(simulate(wide, keeperObstacles(stayPut(keeperCrossing(wide)))).outcome, 'goal');
  // and a keeper who dived out of the way is beaten by the same chip
  assert.equal(simulate(chip, keeperObstacles(playerDive({ x: 2.8, y: 0.6 }, -0.1))).outcome, 'goal');
});

test('the keeper body lines up behind the hands and stays inside the pitch', () => {
  const b = keeperBody(playerDive({ x: 3.2, y: 0.3 }, 0), 0.6);
  assert.ok(b.f === 1);
  assert.ok(b.hands.x > b.chest.x && b.chest.x > b.hip.x, 'stretched towards the ball');
  for (const c of b.capsules) assert.ok(c.a.y > 0 && c.b.y > 0);
  const s = keeperBody(stayPut(), 0.5);
  near(s.hip.x, 0, 1e-9); assert.ok(s.chest.y > s.hip.y && s.hip.y > s.feet.y);
});

test('striker cards: read window is Rookie 0 ms, Pro 140 ms, World Class 220 ms', () => {
  assert.equal(strikerTraits(LEVELS[0].skill).readWindow, 0);
  near(strikerTraits(LEVELS[2].skill).readWindow, 0.14, 0.02);
  near(strikerTraits(LEVELS[3].skill).readWindow, 0.22, 1e-9);
  assert.equal(LEVELS.length, 4);
});

test('cues are always physically true: the plant foot and the hips never lie', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 500; i++) {
    const plan = strikerPlan(rng.next(), rng);
    const trueSide = plan.aim.x >= 0 ? 1 : -1;
    assert.equal(strikerCues(plan, 0).plantSide, trueSide);
    assert.equal(strikerCues(plan, 0).hipSide, trueSide);
    assert.equal(strikerCues(plan, -0.149).hipSide, trueSide, 'hips are true from 150 ms before the strike');
    assert.equal(strikerCues(plan, -0.5).plantSide, 0, 'the plant foot has not landed yet');
  }
});

test('difficulty changes how late the cues appear, not whether they are honest', () => {
  assert.ok(strikerTraits(0).hipsLead > strikerTraits(1).hipsLead);
  assert.ok(strikerTraits(1).hipsLead >= 0.15);
  assert.ok(strikerTraits(0).approachHonesty > strikerTraits(1).approachHonesty);
});

test('going early against a good striker: it sees you and switches side, at 85% power and double scatter', () => {
  const rng = makeRng(3);
  let plan;
  do plan = strikerPlan(1, rng); while (plan.aim.x < 1.5);
  const out = strikerReact(plan, -0.3, 2.5);
  assert.ok(out.switched);
  assert.ok(out.aim.x < -1, 'rolled the other way');
  near(out.power, plan.power * 0.85, 1e-9);
  near(out.traits.timing, plan.traits.timing * 2, 1e-9);
  // inside the window (later than 220 ms before the strike): no switch
  assert.equal(strikerReact(plan, -0.2, 2.5), plan);
  // a rookie never switches
  let rookie;
  do rookie = strikerPlan(0, rng); while (rookie.aim.x < 1.5);
  assert.equal(strikerReact(rookie, -0.5, 2.5), rookie);
  // going the wrong way early is its own punishment: the striker carries on
  assert.equal(strikerReact(plan, -0.3, -2.5), plan);
});

test('the keeper AI never uses the shot before the strike', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 400; i++) {
    const skill = rng.next();
    const plan = strikerPlan(rng.next(), rng);
    const cross = freeCrossing(launchFor(strikerShot(plan)));
    const dive = keeperDive(skill, plan, cross, makeRng(i));
    const same = keeperDive(skill, plan, { x: -cross.x, y: 2.4 - cross.y, t: cross.t }, makeRng(i));
    // any move decided before its reaction time has passed must not depend on where the ball goes
    const early = (d) => d.moves.filter((m) => m.at < keeperTraits(skill).reaction - 1e-9);
    assert.deepEqual(early(dive), early(same));
    // the one move that does use the ball's path comes no sooner than the reaction time
    assert.ok(dive.moves[dive.moves.length - 1].at >= keeperTraits(skill).reaction - 1e-9, 'judges the ball only after its reaction time');
  }
});

test('keeper reaction time runs from 320 ms down to 190 ms', () => {
  near(keeperTraits(0).reaction, 0.32, 1e-9);
  near(keeperTraits(1).reaction, 0.19, 1e-9);
});

test('balance: computer striker against computer keeper converts like real penalties at every level', () => {
  // real penalties convert at about 75%; the plan's target for the middle levels is 70 to 80%
  const bands = [[0.72, 0.88], [0.68, 0.82], [0.64, 0.8], [0.7, 0.86]];
  LEVELS.forEach((lv, i) => {
    const rng = makeRng(1000 + i);
    let goals = 0; const n = 1200;
    for (let k = 0; k < n; k++) {
      let plan = strikerPlan(lv.skill, rng);
      // the keeper decides from the cues; the striker may answer an early dive
      let dive = keeperDive(lv.skill, plan, keeperCrossing(launchFor(strikerShot(plan))), rng);
      const c = firstCommit(dive);
      if (c) {
        const p2 = strikerReact(plan, c.at, c.x);
        if (p2 !== plan) { plan = p2; dive = { ...dive, moves: dive.moves.slice(0, 1).concat(keeperDive(lv.skill, plan, keeperCrossing(launchFor(strikerShot(plan))), makeRng(k)).moves.filter((m) => m.at >= 0)) }; }
      }
      if (simulate(launchFor(strikerShot(plan)), keeperObstacles(dive)).outcome === 'goal') goals++;
    }
    const rate = goals / n;
    assert.ok(rate >= bands[i][0] && rate <= bands[i][1], `${lv.name}: ${(rate * 100).toFixed(1)}% outside ${bands[i]}`);
  });
});

test('balance: a decent human shot is not auto-saved or auto-scored', () => {
  // a clean, mid-power shot aimed 60 cm inside the post, against each keeper level
  LEVELS.forEach((lv, i) => {
    const rng = makeRng(50 + i);
    let goals = 0; const n = 600;
    for (let k = 0; k < n; k++) {
      const side = rng.sign();
      const plan = { ...strikerPlan(0.5, rng), aim: { x: side * (GOAL_HALF_WIDTH - 0.6), y: rng.range(0.3, 1.9) }, side, power: 0.6, curve: 0, type: 'normal' };
      plan.traits = { ...plan.traits, timing: 1 };
      const launch = launchFor(strikerShot(plan));
      if (simulate(launch, keeperObstacles(keeperDive(lv.skill, plan, keeperCrossing(launch), rng))).outcome === 'goal') goals++;
    }
    const rate = goals / n;
    // never auto-saved; and the best keeper gets to a fair share even of well-placed shots
    assert.ok(rate > 0.5, `${lv.name}: ${(rate * 100).toFixed(1)}%`);
    if (i === 3) assert.ok(rate < 0.85, `${lv.name}: ${(rate * 100).toFixed(1)}%`);
  });
});
