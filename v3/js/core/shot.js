// Penalty Kings v3 — from the shot the player asked for (gesture.js) to what
// the ball does (ball.js), plus a stand-in keeper for milestone (b).
import { solveLaunch, simulate, GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS, SPOT_DISTANCE, clamp } from './ball.js';
import { speedFor } from './gesture.js';

export const SPIN_MAX = 62; // rad/s of side spin at full curve (about 10 turns a second)

/** How each shot type flies. */
export const SHOT_TYPES = {
  normal: { label: 'Shot', spin: 1, top: 0, skid: 0 },
  // high, slow, drops under the bar: a fixed gentle pace on the high arc, with backspin
  chip: { label: 'Chip', spin: 0.4, top: -22, skid: 0, lob: true },
  // flat and fast, skids off the turf
  driven: { label: 'Driven', spin: 0.6, top: 14, skid: 1, speedMul: 1.04 },
  // maximum bend, slight dip late
  curler: { label: 'Curler', spin: 1.3, top: 9, skid: 0 },
};

/**
 * Turn a read swipe into a launch for the ball.
 * curve > 0 means the swipe bulged to the right, so the ball's path bulges to
 * the right too: it starts right of the line and comes back to the target.
 * @param shot the object returned by readSwipe()
 * @returns {import('./ball.js').Launch & {speed:number, reached:boolean, type:string}}
 */
export function launchFor(shot) {
  const type = SHOT_TYPES[shot.type] || SHOT_TYPES.normal;
  let speed = speedFor(shot.power) * (type.speedMul || 1);
  // a chip is lofted, not driven: 12.5 to 14.5 m/s whatever the (low) power
  if (shot.type === 'chip') speed = 12.5 + clamp(shot.power / 0.3, 0, 1) * 2;
  // to make the path bulge right, the spin must push the ball left, and the other way round
  const sideSpin = -shot.curve * SPIN_MAX * type.spin;
  const solved = solveLaunch(shot.target, { speed, sideSpin, topSpin: type.top, lob: !!type.lob });
  return { v: solved.v, sideSpin, topSpin: type.top, skid: type.skid, speed: solved.speed, reached: solved.reached, type: shot.type };
}

/** Resolve a read swipe to its result (deterministic). */
export function resolveShot(shot, obstacles = null) {
  const launch = launchFor(shot);
  return { launch, ...simulate(launch, obstacles) };
}

/**
 * Milestone (b) stand-in: a keeper who stands still on the line. Body, arms
 * and legs as capsules the ball really bounces off. Replaced by the diving
 * keeper in milestone (c).
 */
export function standingKeeper(x = 0) {
  const z = SPOT_DISTANCE - 0.35;
  const cap = (name, ax, ay, bx, by, r, e) => ({ name, a: { x: x + ax, y: ay, z }, b: { x: x + bx, y: by, z }, r, e });
  return [
    cap('body', 0, 0.95, 0, 1.45, 0.2, 0.32),
    cap('head', 0, 1.72, 0, 1.76, 0.12, 0.4),
    cap('legs', -0.14, 0.12, -0.12, 0.9, 0.1, 0.35),
    cap('legs', 0.14, 0.12, 0.12, 0.9, 0.1, 0.35),
    cap('hands', -0.3, 1.4, -0.62, 1.02, 0.08, 0.22),
    cap('hands', 0.3, 1.4, 0.62, 1.02, 0.08, 0.22),
  ];
}

/**
 * A v1/v2 challenge-link kick ({aimX, aimY, power, curve}) as a v3 shot target:
 * the ball is solved to arrive where the old kick was aimed, with the old curve.
 */
export function legacyKickToShot(kick) {
  const power = clamp(kick.power, 0, 1);
  return {
    target: {
      x: kick.aimX * (GOAL_HALF_WIDTH - BALL_RADIUS),
      y: BALL_RADIUS + kick.aimY * (GOAL_HEIGHT - 2 * BALL_RADIUS),
    },
    power,
    // old links: positive curve bent the ball to the right, i.e. the path bulged left
    curve: clamp(-kick.curve, -1, 1),
    type: 'normal',
  };
}
