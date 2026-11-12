// Penalty Kings v3 — the computer's striker and keeper. Both are honest:
// the striker shows true cues and can only change its mind inside its stated
// read window; the keeper reads the same cues a player sees, reacts after a
// human reaction time, and never knows the shot before the ball is struck.
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS, SPOT_DISTANCE, clamp } from './ball.js';
import { scatterOffset, overhitRise, classifyShot, RULES } from './gesture.js';
import { KEEPER } from './save.js';

const lerp = (a, b, k) => a + (b - a) * k;

/** The four named levels. skill 0..1 is the continuous scale behind them. */
export const LEVELS = [
  { name: 'Rookie', skill: 0 },
  { name: 'Semi-pro', skill: 1 / 3 },
  { name: 'Pro', skill: 2 / 3 },
  { name: 'World Class', skill: 1 },
];

/** What a striker of a given skill is like. Shown on the striker's card. */
export function strikerTraits(skill) {
  const s = clamp(skill, 0, 1);
  return {
    // how long before the strike the striker can still see the keeper go and switch (rule: Rookie 0, Pro 140, World Class 220 ms)
    readWindow: s < 0.05 ? 0 : Math.round(lerp(0.035, 0.22, s) * 1000) / 1000,
    // the true cues appear later for better strikers
    hipsLead: lerp(0.4, 0.15, s), // s before the strike that the hips show the side (never under 150 ms)
    approachHonesty: lerp(0.95, 0.6, s), // how often the run-up angle matches the side (a habit, not a promise)
    power: [lerp(0.3, 0.55, s), lerp(0.55, 0.85, s)],
    corner: lerp(0.55, 0.92, s), // how close to the post it dares to aim (fraction of half the goal)
    timing: lerp(1.5, 0.6, s), // scatter factor: its own strike timing
    centre: lerp(0.08, 0.14, s), // share of kicks down the middle
    curl: lerp(0.1, 0.35, s),
  };
}

/**
 * The striker decides the kick before the run-up.
 * @returns {{aim:{x,y}, power, curve, type, seed, side, cues:{approach:number}, traits}}
 */
export function strikerPlan(skill, rng) {
  const tr = strikerTraits(skill);
  const side = rng.sign();
  let aim;
  if (rng.chance(tr.centre)) aim = { x: rng.range(-0.5, 0.5), y: rng.range(0.4, 1.7) };
  else aim = { x: side * rng.range(0.45, tr.corner) * GOAL_HALF_WIDTH, y: rng.chance(0.62) ? rng.range(0.25, 0.9) : rng.range(0.9, GOAL_HEIGHT * tr.corner) };
  const power = rng.range(tr.power[0], tr.power[1]);
  const curve = rng.chance(tr.curl) ? rng.sign() * rng.range(0.3, 0.8) : 0;
  const realSide = aim.x >= 0 ? 1 : -1;
  return {
    aim, power, curve, side: realSide,
    type: classifyShot({ power, bulge: curve * 0.2, rest: 0, target: aim }),
    seed: Math.floor(rng.next() * 2 ** 32) >>> 0,
    // the run-up angle: usually from the side that suits the shot, sometimes not
    cues: { approach: rng.chance(tr.approachHonesty) ? realSide : -realSide },
    traits: tr,
    switched: false,
  };
}

/**
 * What the keeper (and the player) can see of the striker at time t (s relative to the strike).
 * plantSide and hipSide are 0 until they show, then always the true side.
 */
export function strikerCues(plan, t) {
  const plantT = -0.07; // the standing foot lands 70 ms before the ball is hit
  return {
    approach: plan.cues.approach, // visible from the start of the run-up; a habit
    hipSide: t >= -Math.max(0.15, plan.traits.hipsLead) ? plan.side : 0, // true once it shows
    plantSide: t >= plantT ? plan.side : 0, // never lies
  };
}

/**
 * The striker sees the keeper go early and switches side (saving rule 3).
 * It applies only when the keeper committed at least `readWindow` before the strike
 * (Rookie 0: never; Pro 140 ms; World Class 220 ms).
 * @param diveAt when the keeper committed, s relative to the strike (negative = early)
 * @param diveX where the keeper is going
 * @returns the plan to strike with (the same object if nothing changes)
 */
export function strikerReact(plan, diveAt, diveX) {
  const w = plan.traits.readWindow;
  if (w <= 0 || diveAt > -w || plan.switched) return plan;
  if (Math.abs(diveX) < 0.6) return plan; // the keeper has not picked a side
  const keeperSide = diveX > 0 ? 1 : -1;
  if (keeperSide !== plan.side && Math.abs(plan.aim.x) > 0.8) return plan; // already going the other way
  // roll it the other way: 85% power, double scatter
  return {
    ...plan,
    aim: { x: -keeperSide * Math.max(1.6, Math.abs(plan.aim.x)), y: Math.min(plan.aim.y, 1.2) },
    side: -keeperSide,
    power: plan.power * 0.85,
    curve: 0, type: 'normal',
    traits: { ...plan.traits, timing: plan.traits.timing * 2 },
    switched: true,
  };
}

/** The striker's plan as a shot for core/shot.js launchFor(): aim + its own scatter + overhit. */
export function strikerShot(plan) {
  const sc = scatterOffset(plan.power, plan.traits.timing, plan.seed);
  return {
    aim: plan.aim,
    target: { x: plan.aim.x + sc.x, y: Math.max(BALL_RADIUS, plan.aim.y + sc.y + overhitRise(plan.power)) },
    power: plan.power, curve: plan.curve, type: plan.type, seed: plan.seed, scatter: sc,
    timing: { grade: plan.switched ? 'rushed' : 'clean', offset: 0, strikeT: RULES.runUp },
  };
}

/** What a keeper of a given skill is like. */
export function keeperTraits(skill) {
  const s = clamp(skill, 0, 1);
  return {
    reaction: lerp(0.32, 0.19, s), // s from seeing something to deciding
    guess: lerp(0.8, 0.93, s), // how often it goes with the strike (real keepers nearly always do: reacting alone is too slow)
    reads: lerp(0.35, 0.9, s), // how often it notices the hips
    error: lerp(0.75, 0.2, s), // m: how far off its judgement of the ball can be
    stays: lerp(0.04, 0.09, s), // how often it stands its ground (stops chips and central drives)
    range: lerp(2.4, 3.3, s), // m: how far across it throws itself when it gambles
    lead: lerp(0.02, 0.2, s), // s before the strike that it commits when it gambles (earlier reaches further, and shows more)
  };
}

/**
 * The computer keeper's dive. It may gamble on a side from the cues, and once
 * the ball is struck it needs its reaction time before it can judge the flight.
 * @param plan the striker's plan (only its cues and, after the strike, the ball's real path are used)
 * @param crossing where the ball will cross the line {x, y, t}, or null if it will not: known only after reaction
 */
export function keeperDive(skill, plan, crossing, rng) {
  const tr = keeperTraits(skill);
  const moves = [];
  if (rng.chance(tr.stays)) {
    // stands tall; reacts only to the ball
  } else if (rng.chance(tr.guess)) {
    // commits early from what it can see
    const cueT = -Math.max(0.15, plan.traits.hipsLead);
    const sawHips = rng.chance(tr.reads);
    const side = sawHips ? strikerCues(plan, 0).hipSide : (rng.chance(0.6) ? plan.cues.approach : rng.sign());
    const at = sawHips ? Math.max(cueT + tr.reaction, -tr.lead) : -tr.lead;
    moves.push({ at, x: side * rng.range(tr.range * 0.75, tr.range), y: rng.chance(0.65) ? rng.range(0.35, 0.9) : rng.range(0.9, 1.7) });
  }
  // after the strike: see the ball, then go to where it is heading (with judgement error)
  if (crossing) {
    const ex = rng.range(-tr.error, tr.error); const ey = rng.range(-tr.error, tr.error) * 0.6;
    moves.push({ at: tr.reaction, x: clamp(crossing.x + ex, -GOAL_HALF_WIDTH, GOAL_HALF_WIDTH), y: clamp(crossing.y + ey, 0.2, GOAL_HEIGHT) });
  }
  return { moves, boost: 1, grade: 'cpu' };
}

/** When and where the keeper first commits: what the striker's read window looks at. */
export function firstCommit(dive) {
  return dive.moves.length ? { at: dive.moves[0].at, x: dive.moves[0].x } : null;
}

/** Skill 0..1 from the v2 keeper stats ({reach, reaction, reading}) used by teams and levels. */
export const keeperSkillFromStats = (st) => clamp((st.reach + st.reaction + st.reading) / 3, 0, 1);
/** Skill 0..1 from the v2 shooter stats ({finishing, disguise}). */
export const strikerSkillFromStats = (finishing, disguise) => clamp((finishing + disguise) / 2, 0, 1);

/** Where the ball will be when it reaches the keeper (he stands just in front of the line). */
export const keeperCrossing = (launch) => freeCrossing(launch, KEEPER.lineZ);

/** Where a launch would cross the line (or another distance z) with nothing in the way. */
export function freeCrossing(launch, z = SPOT_DISTANCE) {
  const dt = 1 / 240;
  const p = { x: 0, y: BALL_RADIUS, z: 0 }; const v = { ...launch.v };
  let side = launch.sideSpin || 0; let top = launch.topSpin || 0; let t = 0;
  for (let i = 0; i < 1400; i++) {
    const sp = Math.hypot(v.x, v.y, v.z);
    v.x += (-0.0133 * sp * v.x + 0.0058 * side * v.z) * dt;
    v.y += (-0.0133 * sp * v.y - 9.81 - 0.0058 * top * v.z) * dt;
    v.z += (-0.0133 * sp * v.z + 0.0058 * (-side * v.x + top * v.y)) * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (p.y < BALL_RADIUS) { p.y = BALL_RADIUS; if (v.y < 0) v.y = -v.y * 0.58; }
    side *= 1 - 0.35 * dt; top *= 1 - 0.35 * dt; t += dt;
    if (p.z >= z) return { x: p.x, y: p.y, t };
    if (v.z < 0.1) break;
  }
  return null;
}
