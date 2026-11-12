// Penalty Kings v3 — the shooting gesture, exactly as written in section 5 of
// v2/REBUILD_PLAN.md. Pure functions: every rule here has a test.
//
// Swipe samples are {x, y, t}: x and y in fractions of the screen HEIGHT
// (x right, y down), t in seconds since the finger touched the ball.
import { makeRng } from './rng.js';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS, clamp } from './ball.js';

export const RULES = {
  startRadius: 0.12, // rule 1: the touch must land within 12% of screen height of the ball
  runUp: 0.9, // rule 1/6: the standing foot plants 0.9 s after the touch
  minSwipe: 0.05, // shorter than 5% of screen height is not a shot
  powerWindow: 0.12, // rule 4: the fastest 120 ms of the swipe
  powerSlow: 0.8, // screen heights per second -> power 0 (a pass)
  powerFast: 3.2, // -> power 1
  speedMin: 16, // m/s at power 0
  speedMax: 34, // m/s at power 1
  overhitFrom: 0.9, // above 90% power the ball rises
  curveDead: 0.06, // rule 5: bulge under 6% of swipe length is straight
  curveFull: 0.25, // 25% is maximum spin
  perfect: 0.06, // rule 6: within +-60 ms of the plant
  clean: 0.16, // within +-160 ms
  lateLimit: 1.2, // s after the plant: the striker gives up the run
  scatter: { perfect: 0.4, clean: 1, rushed: 1.6, scuffed: 2.2 },
  scuffedPower: 0.85,
  scatterBase: 0.10, // rule 7: radius = 0.10 m + 0.45 m x power^2, times the timing factor
  scatterPower: 0.45,
  chipPower: 0.3, // rule 8
  chipHold: 0.12, // s the finger rests before release
  holdStill: 0.012, // moving less than this (screen heights) counts as resting
  drivenPower: 0.75,
  curlerBulge: 0.15,
  curlerPower: [0.45, 0.8],
};

/** Rule 1: may this touch start a shot? */
export function canStart(touch, ball) {
  return Math.hypot(touch.x - ball.x, touch.y - ball.y) <= RULES.startRadius;
}

/** Total length of the path, in screen heights. */
export function pathLength(samples) {
  let len = 0;
  for (let i = 1; i < samples.length; i++) len += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  return len;
}

/** Position on the path at time t (linear between samples). */
function at(samples, t) {
  if (t <= samples[0].t) return samples[0];
  for (let i = 1; i < samples.length; i++) {
    if (t <= samples[i].t) {
      const a = samples[i - 1]; const b = samples[i];
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, t };
    }
  }
  return samples[samples.length - 1];
}

/**
 * Rule 4: power from the fastest 120 ms of the swipe.
 * @returns {{power:number, peak:number}} power 0..1, peak in screen heights per second
 */
export function swipePower(samples) {
  if (samples.length < 2) return { power: 0, peak: 0 };
  const w = RULES.powerWindow;
  const t0 = samples[0].t; const t1 = samples[samples.length - 1].t;
  let peak = 0;
  if (t1 - t0 <= w) {
    // a flick shorter than the window: its own average speed
    const a = samples[0]; const b = samples[samples.length - 1];
    peak = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.03, t1 - t0);
  } else {
    // slide the window to every sample time (start or end aligned)
    const tryWindow = (start) => {
      const a = at(samples, start); const b = at(samples, start + w);
      const sp = Math.hypot(b.x - a.x, b.y - a.y) / w;
      if (sp > peak) peak = sp;
    };
    for (const s of samples) {
      if (s.t + w <= t1) tryWindow(s.t);
      if (s.t - w >= t0) tryWindow(s.t - w);
    }
  }
  return { power: clamp((peak - RULES.powerSlow) / (RULES.powerFast - RULES.powerSlow), 0, 1), peak };
}

/** Ball speed in m/s for a power 0..1. */
export const speedFor = (power) => RULES.speedMin + clamp(power, 0, 1) * (RULES.speedMax - RULES.speedMin);

/** Rule 4: extra height above 90% power: +0.25 m at 95%, +0.7 m at 100%. */
export function overhitRise(power) {
  const k = clamp((power - RULES.overhitFrom) / (1 - RULES.overhitFrom), 0, 1);
  return 0.7 * Math.pow(k, 1.5);
}

/**
 * Rule 5: the sideways bulge of the path against its straight line, as a
 * signed fraction of the swipe's length. Positive = the path bulges to the right.
 */
export function swipeBulge(samples) {
  const a = samples[0]; const b = samples[samples.length - 1];
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  let best = 0;
  for (const p of samples) {
    // signed distance from the chord; with y down, a point to the right of an upward swipe is positive
    const dev = ((p.x - a.x) * -dy + (p.y - a.y) * dx) / len;
    if (Math.abs(dev) > Math.abs(best)) best = dev;
  }
  return best / len;
}

/** Rule 5: bulge -> curve -1..1 (sign = side of the bulge). Under 6% is straight; 25% is maximum. */
export function curveFromBulge(bulge) {
  const m = Math.abs(bulge);
  if (m < RULES.curveDead) return 0;
  return Math.sign(bulge) * clamp((m - RULES.curveDead) / (RULES.curveFull - RULES.curveDead), 0, 1);
}

/**
 * Rule 6: strike timing from the moment the finger left the screen.
 * @param releaseT seconds since the touch started
 * @returns {{grade:'perfect'|'clean'|'rushed'|'scuffed', scatter:number, powerMul:number, strikeT:number, offset:number}}
 *   strikeT = when the foot meets the ball; offset = release minus plant (s)
 */
export function strikeTiming(releaseT) {
  const offset = releaseT - RULES.runUp;
  const m = Math.abs(offset);
  let grade;
  if (m <= RULES.perfect) grade = 'perfect';
  else if (m <= RULES.clean) grade = 'clean';
  else grade = offset < 0 ? 'rushed' : 'scuffed';
  return {
    grade,
    scatter: RULES.scatter[grade],
    powerMul: grade === 'scuffed' ? RULES.scuffedPower : 1,
    // an early release waits for the plant; a late one is struck when the finger lifts
    strikeT: Math.max(RULES.runUp, releaseT),
    offset,
  };
}

/** Rule 7: scatter radius in metres. */
export const scatterRadius = (power, timingFactor) => (RULES.scatterBase + RULES.scatterPower * power * power) * timingFactor;

/**
 * Rule 7: the only randomness. A point inside the scatter circle, from the
 * kick's own seed. It never looks at the keeper.
 */
export function scatterOffset(power, timingFactor, seed) {
  const rng = makeRng(seed);
  const radius = scatterRadius(power, timingFactor);
  const r = radius * Math.sqrt(rng.next()); // even over the circle's area
  const a = rng.next() * Math.PI * 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, radius };
}

/** Rule 8 (chip): how long the finger rested at the end of the swipe, in seconds. */
export function restBeforeRelease(samples) {
  const last = samples[samples.length - 1];
  let since = last.t;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (Math.hypot(samples[i].x - last.x, samples[i].y - last.y) > RULES.holdStill) break;
    since = samples[i].t;
  }
  return last.t - since;
}

/**
 * Rule 8: which shot is this? Checked in this order; anything else is normal.
 * @param s {{power:number, bulge:number, rest:number, target:{x:number,y:number}}}
 *   target in metres on the goal plane (x from the centre, y from the ground)
 */
export function classifyShot({ power, bulge, rest, target }) {
  const middleThird = Math.abs(target.x) <= GOAL_HALF_WIDTH / 3;
  const lowerThird = target.y <= GOAL_HEIGHT / 3;
  if (power < RULES.chipPower && middleThird && rest >= RULES.chipHold) return 'chip';
  if (power > RULES.drivenPower && lowerThird) return 'driven';
  if (Math.abs(bulge) > RULES.curlerBulge && power >= RULES.curlerPower[0] && power <= RULES.curlerPower[1]) return 'curler';
  return 'normal';
}

/**
 * Read a finished swipe (rules 2 to 8).
 * @param samples the path, first sample = the touch on the ball (t = 0)
 * @param project (x, y) in screen heights -> {x, y} metres on the goal plane (rule 3). Supplied by the camera.
 * @param seed this kick's scatter seed
 * @returns null if it was not a swipe, otherwise the shot the player asked for
 */
export function readSwipe(samples, project, seed) {
  if (!samples || samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) < RULES.minSwipe) return null;

  const timing = strikeTiming(last.t);
  const raw = swipePower(samples);
  const power = raw.power * timing.powerMul;
  const bulge = swipeBulge(samples);
  const aim = project(last.x, last.y); // rule 3: what you point at is what you aim at
  const type = classifyShot({ power, bulge, rest: restBeforeRelease(samples), target: aim });
  const sc = scatterOffset(power, timing.scatter, seed);
  const target = {
    x: aim.x + sc.x,
    y: Math.max(BALL_RADIUS, aim.y + sc.y + overhitRise(power)),
  };
  return { aim, target, power, peak: raw.peak, bulge, curve: curveFromBulge(bulge), type, timing, scatter: sc, seed };
}
