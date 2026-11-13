// Penalty Kings v3 — the goalkeeper: one model for the player and the CPU.
// A dive is a list of waypoints for the hands; the body follows the hands, and
// the ball really collides with hands, arms, body, head and legs (core/ball.js).
// Nothing here rolls a dice: a save is a collision.
//
// Coordinates are the ball's: x = the shooter's right, y = up, goal line at z = 11.
// Times are seconds relative to the strike (negative = before the ball is hit).
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, SPOT_DISTANCE, clamp } from './ball.js';

export const KEEPER = {
  speed: 6.2, // m/s the hands travel in a dive
  pushOff: 0.07, // s between deciding and moving
  perfectFrom: 0, // a dive released 0..90 ms after the strike is a perfect dive
  perfectTo: 0.09,
  perfectBoost: 1.15, // speed and reach +15%
  ready: { x: 0, y: 1.05 }, // where the hands wait
  lineZ: SPOT_DISTANCE - 0.3, // the keeper stands just in front of the line
  catchSpeed: 18, // m/s: slower than this into the hands or chest is held, if the keeper barely moved
  reflex: 0.25, // s after the strike before a keeper who stayed put gets the hands to a ball near him
  reflexReach: 0.9, // m either side of the middle that the reflex covers
};

/**
 * A dive plan.
 * @typedef {{moves: Array<{at:number, x:number, y:number}>, boost:number, grade:string}} Dive
 *   moves: at = when the keeper decides (s after the strike); the hands start moving pushOff later
 */

/**
 * The keeper stays put (saving rule 5): he holds the middle, and puts his hands to a ball
 * that comes near him, which is what stops chips and central drives.
 * @param crossing where the ball is heading {x, y}, once it has been struck (null before)
 */
export function stayPut(crossing = null) {
  const moves = crossing
    ? [{ at: KEEPER.reflex, x: clamp(crossing.x, -KEEPER.reflexReach, KEEPER.reflexReach), y: clamp(crossing.y, 0.3, GOAL_HEIGHT - 0.1) }]
    : [];
  return { moves, boost: 1, grade: 'stay' };
}

/**
 * The player's dive from a swipe (saving rules 2 and 3).
 * @param target where the swipe points on the goal plane
 * @param releaseT when the finger lifted, s relative to the strike
 */
export function playerDive(target, releaseT) {
  const perfect = releaseT >= KEEPER.perfectFrom && releaseT <= KEEPER.perfectTo;
  return {
    moves: [{ at: releaseT, x: clamp(target.x, -GOAL_HALF_WIDTH - 0.2, GOAL_HALF_WIDTH + 0.2), y: clamp(target.y, 0.15, GOAL_HEIGHT + 0.1) }],
    boost: perfect ? KEEPER.perfectBoost : 1,
    grade: perfect ? 'perfect' : releaseT < 0 ? 'early' : 'normal',
  };
}

/** Where the hands are at time t, and how fast they are moving. */
export function handsAt(dive, t) {
  let x = KEEPER.ready.x; let y = KEEPER.ready.y;
  let vx = 0; let vy = 0; let moved = 0;
  const speed = KEEPER.speed * dive.boost;
  for (let i = 0; i < dive.moves.length; i++) {
    const m = dive.moves[i];
    const from = m.at + KEEPER.pushOff;
    if (t <= from) break;
    const until = i + 1 < dive.moves.length ? Math.min(t, dive.moves[i + 1].at + KEEPER.pushOff) : t;
    const dx = m.x - x; const dy = m.y - y;
    const dist = Math.hypot(dx, dy);
    const go = Math.min(dist, speed * (until - from));
    vx = 0; vy = 0;
    if (dist > 1e-6) {
      x += (dx / dist) * go; y += (dy / dist) * go; moved += go;
      if (go < dist && until === t) { vx = (dx / dist) * speed; vy = (dy / dist) * speed; }
    }
  }
  return { x, y, vx, vy, moved };
}

/**
 * The keeper's whole body at time t: joints for drawing, capsules for the ball.
 * Standing, the keeper is upright in the middle. Diving, the body lines up
 * behind the hands along the line of the dive.
 */
export function keeperBody(dive, t) {
  const h = handsAt(dive, t);
  const z = KEEPER.lineZ;
  // how far into a dive: 0 standing, 1 fully stretched (after about 0.8 m of hand travel)
  const f = clamp(h.moved / 0.8, 0, 1);
  const dx = h.x - KEEPER.ready.x; const dy = h.y - 0.95;
  const len = Math.hypot(dx, dy) || 1;
  // direction the body points: straight up when standing, along the dive when stretched
  let ux = (dx / len) * f; let uy = (1 - f) + (dy / len) * f;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const reach = 0.62; // shoulder to hands
  const torso = 0.55;
  const leg = 0.88;
  const standChest = { x: 0, y: 1.45 };
  const chest = { x: standChest.x * (1 - f) + (h.x - ux * reach) * f, y: Math.max(0.22, standChest.y * (1 - f) + (h.y - uy * reach) * f) };
  const hip = { x: chest.x - ux * torso, y: Math.max(0.2, chest.y - uy * torso) };
  // legs trail behind: down when standing, along the body when flying
  const feet = { x: hip.x - ux * leg * f, y: Math.max(0.1, hip.y - (1 - f) * leg - uy * leg * f) };
  const head = { x: chest.x + ux * 0.24, y: chest.y + uy * 0.24 };
  const hands = { x: h.x, y: Math.max(0.12, h.y) };
  const px = -uy; const py = ux; // across the body
  const still = h.moved < 0.35;
  const cap = (name, a, b, r, e, extra = {}) => ({ name, a: { x: a.x, y: a.y, z }, b: { x: b.x, y: b.y, z }, r, e, vx: h.vx, vy: h.vy, ...extra });
  const capsules = [
    cap('hands', { x: hands.x - px * 0.16, y: Math.max(0.1, hands.y - py * 0.16) }, { x: hands.x + px * 0.16, y: Math.max(0.1, hands.y + py * 0.16) }, 0.1, 0.18, still ? { catch: KEEPER.catchSpeed } : {}),
    cap('arms', chest, hands, 0.07, 0.3),
    cap('body', hip, chest, 0.2, 0.3, still ? { catch: KEEPER.catchSpeed * 0.8 } : {}),
    cap('head', head, head, 0.12, 0.4),
    cap('legs', feet, hip, 0.13, 0.35),
  ];
  return { hands, chest, hip, feet, head, f, dir: { x: ux, y: uy }, capsules, moving: h.vx !== 0 || h.vy !== 0 };
}

/** Obstacles for core/ball.js: the keeper's capsules as a function of time. */
export const keeperObstacles = (dive) => (t) => keeperBody(dive, t).capsules;
