// Penalty Kings v2 — ball flight physics.
// Pure functions, no rendering, so it runs the same in the app, in the
// browser share link and in Node tests.
//
// World units are metres. Origin = penalty spot on the ground.
//   x: right (from the shooter's view), y: up, z: towards the goal.
// The goal line is at z = SPOT_DISTANCE.

export const SPOT_DISTANCE = 11.0;
export const GOAL_HALF_WIDTH = 3.66; // 7.32 m between the posts
export const GOAL_HEIGHT = 2.44;
export const POST_RADIUS = 0.06;
export const BALL_RADIUS = 0.11;
export const NET_DEPTH = 2.0;
export const GRAVITY = 9.81;

// Aerodynamics (tuned for feel, roughly a real size-5 ball).
const DRAG_K = 0.0125; // a = -k |v| v
const MAGNUS_K = 0.032; // lateral curve per unit of spin and speed
const DIP_K = 0.018; // topspin dip

/**
 * Normalised kick input. Every source (swipe, AI, challenge link) produces one.
 * @typedef {Object} Kick
 * @property {number} aimX   -1 (left post) .. 1 (right post), may exceed for wide shots
 * @property {number} aimY    0 (ground) .. 1 (crossbar), may exceed for high shots
 * @property {number} power   0 .. 1
 * @property {number} curve  -1 (bends left) .. 1 (bends right)
 */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Ball launch speed in m/s for a given power. */
export const speedFor = (power) => 16 + clamp(power, 0, 1) * 16; // 16..32 m/s

/**
 * Initial velocity aimed at the target point on the goal plane.
 * Curve is NOT compensated: the player learns to aim the bend.
 * Over-hit (power > 0.85) lifts the ball, so blasting has a cost.
 */
export function launchVelocity(kick) {
  const speed = speedFor(kick.power);
  const tx = kick.aimX * (GOAL_HALF_WIDTH - BALL_RADIUS);
  const overhit = Math.max(0, kick.power - 0.85) / 0.15; // 0..1
  const ty = BALL_RADIUS + kick.aimY * (GOAL_HEIGHT - 2 * BALL_RADIUS) + overhit * 0.55;
  const dist = Math.hypot(tx, SPOT_DISTANCE);
  const t = dist / (speed * 0.93); // flight time, rough drag allowance
  // vertical speed to arrive at height ty after time t under gravity
  const vy = (ty - BALL_RADIUS) / t + 0.5 * GRAVITY * t;
  const horiz = Math.sqrt(Math.max(1, speed * speed - vy * vy));
  return { x: (horiz * tx) / dist, y: vy, z: (horiz * SPOT_DISTANCE) / dist };
}

/** Advance one step. Mutates and returns state {p, v, spin, t}. */
export function step(s, dt) {
  const { v } = s;
  const sp = Math.hypot(v.x, v.y, v.z);
  // drag
  let ax = -DRAG_K * sp * v.x;
  let ay = -DRAG_K * sp * v.y - GRAVITY;
  let az = -DRAG_K * sp * v.z;
  // Magnus: sidespin bends the ball sideways, decaying slowly
  ax += MAGNUS_K * s.spin * v.z * (sp / 25);
  ay -= DIP_K * Math.abs(s.spin) * v.z * 0.25;
  v.x += ax * dt;
  v.y += ay * dt;
  v.z += az * dt;
  s.p.x += v.x * dt;
  s.p.y += v.y * dt;
  s.p.z += v.z * dt;
  s.spin *= 1 - 0.15 * dt;
  s.t += dt;
  // bounce on the ground
  if (s.p.y < BALL_RADIUS) {
    s.p.y = BALL_RADIUS;
    if (v.y < 0) v.y = -v.y * 0.55;
    v.x *= 0.85;
    v.z *= 0.85;
  }
  return s;
}

export function initialState(kick) {
  return {
    p: { x: 0, y: BALL_RADIUS, z: 0 },
    v: launchVelocity(kick),
    spin: clamp(kick.curve, -1.2, 1.2) * 9,
    t: 0,
  };
}

/** Is the point (x, y) on the goal plane inside the frame (ball fully in)? */
export const insideFrame = (x, y) =>
  Math.abs(x) <= GOAL_HALF_WIDTH - POST_RADIUS - BALL_RADIUS * 0.2 &&
  y <= GOAL_HEIGHT - POST_RADIUS - BALL_RADIUS * 0.2;

/**
 * Where and when the ball first reaches the goal line, plus woodwork hits.
 * Used by the keeper to decide saves before the ball arrives.
 * @returns {{t:number, x:number, y:number, woodwork:null|'post'|'bar'}}
 */
export function predictCrossing(kick, dt = 1 / 240) {
  const s = initialState(kick);
  for (let i = 0; i < 2400; i++) {
    const prevZ = s.p.z;
    step(s, dt);
    if (prevZ < SPOT_DISTANCE && s.p.z >= SPOT_DISTANCE) {
      const { x, y } = s.p;
      return { t: s.t, x, y, woodwork: woodworkAt(x, y) };
    }
    if (s.v.z <= 0.1) break; // ball stopped short
  }
  return { t: Infinity, x: s.p.x, y: s.p.y, woodwork: null };
}

/** Does a ball crossing the line at (x, y) touch a post or the bar? */
export function woodworkAt(x, y) {
  const r = BALL_RADIUS + POST_RADIUS;
  const nearPost = Math.abs(Math.abs(x) - GOAL_HALF_WIDTH) < r && y < GOAL_HEIGHT + r;
  const nearBar = Math.abs(y - GOAL_HEIGHT) < r && Math.abs(x) < GOAL_HALF_WIDTH + r;
  if (nearPost) return 'post';
  if (nearBar) return 'bar';
  return null;
}

/**
 * Deterministic woodwork outcome: does the ball go in off the frame?
 * Hitting the inside half of the post/bar goes in; outside half goes out.
 */
export function woodworkGoesIn(x, y) {
  const w = woodworkAt(x, y);
  if (w === 'post') return Math.abs(x) < GOAL_HALF_WIDTH && y < GOAL_HEIGHT;
  if (w === 'bar') return y < GOAL_HEIGHT && Math.abs(x) < GOAL_HALF_WIDTH;
  return false;
}
