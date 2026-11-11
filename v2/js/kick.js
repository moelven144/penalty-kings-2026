// Penalty Kings v2 — turning input into kicks, and kicks into results.

import { predictCrossing, insideFrame, woodworkAt, woodworkGoesIn, clamp } from './physics.js';
import { resolveSave } from './keeper.js';

/**
 * Swipe -> Kick.
 * Points are in screen units normalised by the viewport HEIGHT
 * (so a phone and a tablet feel the same): x right, y DOWN, t in seconds.
 * - direction: horizontal travel of the swipe
 * - height:    how far up the screen the swipe travels
 * - power:     swipe speed
 * - curve:     which way the path turns in its second half (bend right = curls right)
 * @returns {import('./physics.js').Kick | null} null if it wasn't a real swipe
 */
export function swipeToKick(points) {
  if (!points || points.length < 2) return null;
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const up = a.y - b.y; // positive when swiping up
  const len = Math.hypot(dx, up);
  const dur = Math.max(0.04, b.t - a.t);
  if (up < 0.06 || len < 0.08) return null;

  const speed = len / dur; // heights per second
  const power = clamp((speed - 0.9) / 2.6, 0, 1);
  const aimX = clamp(dx / 0.32, -1.5, 1.5);
  const aimY = clamp((up - 0.12) / 0.38, -0.1, 1.5);

  // curve: signed turn between first and second half of the path,
  // scaled by how far the path bulges away from the straight chord
  const mid = points[Math.floor(points.length / 2)];
  const d1 = { x: mid.x - a.x, y: mid.y - a.y };
  const d2 = { x: b.x - mid.x, y: b.y - mid.y };
  // screen y points down, so a clockwise turn (bending right) gives cross > 0
  const cross = d1.x * d2.y - d1.y * d2.x;
  let maxDev = 0;
  for (const p of points) {
    // perpendicular distance from the chord
    const dev = Math.abs((p.x - a.x) * -up - (p.y - a.y) * dx) / len;
    if (dev > maxDev) maxDev = dev;
  }
  const turn = Math.sign(cross);
  const curve = clamp(turn * (maxDev / len) * 5, -1.2, 1.2);
  return { aimX, aimY, power, curve: Math.abs(curve) < 0.08 ? 0 : curve };
}

/**
 * CPU shooter picks a kick. Better shooters pick corners more and miss less.
 * @param skill 0..1 (visible "finishing" stat)
 */
export function cpuKick(skill, rng) {
  const side = rng.sign();
  const roll = rng.next();
  let aimX;
  let aimY;
  if (roll < 0.12) {
    aimX = rng.range(-0.2, 0.2); // down the middle / Panenka
    aimY = rng.range(0.2, 0.6);
  } else {
    aimX = side * rng.range(0.45, 0.95);
    aimY = rng.range(0.05, 0.85);
  }
  const wobble = 0.5 * (1 - skill);
  return {
    aimX: aimX + rng.range(-wobble, wobble),
    aimY: aimY + rng.range(-wobble, wobble) * 0.8,
    power: clamp(rng.range(0.45, 0.8) + 0.15 * skill, 0, 1),
    curve: rng.chance(0.3) ? side * rng.range(0.2, 0.7) : 0,
  };
}

/**
 * Resolve one kick against a keeper dive plan.
 * @returns {{outcome:'goal'|'save'|'miss'|'post', crossing, reason:string}}
 */
export function resolveKick(kick, plan) {
  const crossing = predictCrossing(kick);
  if (!isFinite(crossing.t)) return { outcome: 'miss', crossing, reason: 'short' };
  const wood = woodworkAt(crossing.x, crossing.y);
  const onTarget = wood ? woodworkGoesIn(crossing.x, crossing.y) : insideFrame(crossing.x, crossing.y);
  if (!onTarget) {
    return {
      outcome: wood ? 'post' : 'miss',
      crossing,
      reason: wood ? wood : crossing.y > 2.44 ? 'over' : 'wide',
    };
  }
  const save = resolveSave(plan, crossing);
  if (save.result === 'save') return { outcome: 'save', crossing, reason: save.reason };
  return { outcome: 'goal', crossing, reason: wood ? `in-off-${wood}` : save.reason };
}
