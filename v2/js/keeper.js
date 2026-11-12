// Penalty Kings v2 — goalkeeper model, shared by the player keeper and the CPU.
// Fairness rule: the CPU never sees anything a human keeper couldn't. It
// either guesses at the strike (reading the run-up "tell") or reacts to the
// ball after its reaction time. Its quality comes from visible stats only.

import { GOAL_HALF_WIDTH, GOAL_HEIGHT, clamp } from './physics.js';

export const KEEPER_START = { x: 0, y: 1.0 };
export const DIVE_SPEED = 5.6; // m/s for the hands
export const HAND_REACH = 0.62; // radius around the hands that saves
export const MAX_REACH_X = 3.05; // furthest the hands get from centre
const BODY_HALF_WIDTH = 0.33;
const BODY_HEIGHT = 1.85;

/**
 * A dive plan: when the keeper commits and where the hands go.
 * @typedef {{start:number, x:number, y:number}} DivePlan
 *   start: seconds relative to the strike (negative = moved early)
 */

/** Hand position at time t (seconds after the strike). */
export function handsAt(plan, t) {
  const tx = clamp(plan.x, -MAX_REACH_X, MAX_REACH_X);
  const ty = clamp(plan.y, 0.15, GOAL_HEIGHT);
  const dx = tx - KEEPER_START.x;
  const dy = ty - KEEPER_START.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { ...KEEPER_START, progress: 1 };
  const moving = Math.max(0, t - plan.start);
  const f = Math.min(1, (moving * DIVE_SPEED) / dist);
  return { x: KEEPER_START.x + dx * f, y: KEEPER_START.y + dy * f, progress: f };
}

/**
 * Does the keeper stop a ball crossing the line at (x, y) at time t?
 * @returns {'save'|'goal'} plus why, for the "why did I miss" replay.
 */
export function resolveSave(plan, crossing) {
  const h = handsAt(plan, crossing.t);
  const d = Math.hypot(h.x - crossing.x, h.y - crossing.y);
  if (d <= HAND_REACH) return { result: 'save', reason: h.progress < 1 ? 'reaction' : 'read' };
  // the body still blocks if the keeper barely moved off the centre
  const bodyX = h.x * 0.6;
  if (h.progress < 0.35 && Math.abs(crossing.x - bodyX) < BODY_HALF_WIDTH && crossing.y < BODY_HEIGHT) {
    return { result: 'save', reason: 'body' };
  }
  return { result: 'goal', reason: d < HAND_REACH + 0.35 ? 'fingertips' : 'beaten' };
}

/**
 * Visible keeper stats (0..1), shown on the opponent card.
 * @typedef {{reach:number, reaction:number, reading:number}} KeeperStats
 */

/**
 * CPU keeper decides a dive plan.
 * @param crossing predicted crossing of the real shot
 * @param tellSide the side the shooter's run-up suggests (-1 / 1), may lie
 * @param stats visible keeper stats
 * @param rng seeded rng
 */
export function cpuKeeperPlan(crossing, tellSide, stats, rng) {
  const reactionTime = 0.34 - 0.16 * stats.reaction; // 0.18..0.34 s
  const guesses = rng.chance(0.55 + 0.2 * (1 - stats.reaction));
  if (guesses) {
    // commits at the strike and trusts the run-up tell (or a coin flip)
    const trustsTell = rng.chance(0.4 + 0.5 * stats.reading);
    const side = trustsTell ? tellSide : rng.sign();
    const reach = 1.6 + 1.3 * stats.reach;
    return {
      start: -0.04,
      x: side * rng.range(reach * 0.5, reach * 0.95),
      // most penalties are low, so a guessing keeper favours a low dive
      y: rng.chance(0.65) ? rng.range(0.3, 1.0) : rng.range(1.0, 1.9),
    };
  }
  // reacts to the ball; aim error shrinks with reading
  const err = 0.65 * (1 - stats.reading);
  return {
    start: reactionTime,
    x: crossing.x + rng.range(-err, err),
    y: crossing.y + rng.range(-err, err) * 0.6,
  };
}

/**
 * The tell a shooter's run-up shows: true side with probability set by
 * the shooter's disguise. 0 disguise = always honest, 1 = coin flip.
 */
export function runUpTell(aimX, disguise, rng) {
  const trueSide = aimX >= 0 ? 1 : -1;
  return rng.chance(1 - 0.5 * clamp(disguise, 0, 1)) ? trueSide : -trueSide;
}

/** Player keeper: turn a swipe on the goal into a dive plan. */
export function playerKeeperPlan(goalX, goalY, swipeTime) {
  return {
    start: swipeTime,
    x: clamp(goalX, -GOAL_HALF_WIDTH, GOAL_HALF_WIDTH),
    y: clamp(goalY, 0, GOAL_HEIGHT),
  };
}
