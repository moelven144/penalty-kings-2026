// Penalty Kings v3 — hand-authored body motion for the striker and the keeper,
// as joint targets in world space (ball on the origin, goal towards -z, +x the
// shooter's right). Pure maths: the skinned character (render/character.js)
// solves its skeleton to these targets. The cues a keeper reads live here:
// run-up angle, hips, and the standing foot, which always points where the ball goes.
import { RULES } from '../core/gesture.js';
import { keeperBody, KEEPER } from '../core/save.js';

const v = (x, y, z) => ({ x, y, z });
const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
export const ANKLE = 0.09; // ankle height with the foot flat
export const HIP = 0.95; // pelvis height standing

const T = RULES.runUp;
export const SWING = 0.07; // s from the start of the leg swing to contact

/**
 * A right-footed striker's run-up, strike and follow-through.
 * @param t seconds since the run-up started
 * @param strikeT when the foot meets the ball (null while it is not known yet)
 * @param cues {approach: -1|1, side: -1|0|1, hipsFrom: seconds before the strike the hips open}
 *   side = where the ball is going, 0 while undecided (a player who has not released yet)
 * @returns joint targets: pelvis, torso (unit vector), yaw (radians, 0 = facing the goal), hipTwist,
 *   footL, footR (ankles), footYawL, footYawR, toeR (toe pitch of the kicking foot), handL, handR
 */
export function strikerPose(t, strikeT, cues = {}) {
  const approach = cues.approach || 1;
  const side = cues.side || 0;
  // a wide approach comes in from further left; a straight one from almost behind the ball
  const wide = approach > 0 ? 1 : 0.45;
  const start = v(-1.35 * wide - 0.2, 0, 2.75);
  const marks = [
    { foot: 'R', t: 0, p: v(start.x + 0.12, 0, start.z - 0.05) },
    { foot: 'L', t: 0, p: v(start.x - 0.12, 0, start.z + 0.05) },
    { foot: 'R', t: T * 0.3, p: v(start.x * 0.62, 0, 1.95) },
    { foot: 'L', t: T * 0.55, p: v(start.x * 0.42 - 0.12, 0, 1.15) },
    { foot: 'R', t: T * 0.78, p: v(-0.2, 0, 0.62) },
    { foot: 'L', t: T, p: v(-0.26, 0, 0.05) }, // the plant, beside the ball, exactly at RULES.runUp
  ];
  const footAt = (which) => {
    const mine = marks.filter((m) => m.foot === which);
    let prev = mine[0]; let next = null;
    for (const m of mine) { if (m.t <= t) prev = m; else { next = m; break; } }
    if (!next) return { ...prev.p, y: ANKLE };
    const lift = Math.max(prev.t, next.t - (next.t - prev.t) * 0.62);
    const k = ease(clamp01((t - lift) / (next.t - lift)));
    const p = mix(prev.p, next.p, k);
    p.y = ANKLE + Math.sin(k * Math.PI) * 0.17;
    return p;
  };
  const run = clamp01(t / T);
  const pelvis = mix(v(start.x, 0, start.z), v(-0.2, 0, 0.32), ease(run));
  pelvis.y = HIP - 0.06 - Math.abs(Math.sin(run * Math.PI * 2.5)) * 0.035;
  const footL = footAt('L');
  let footR = footAt('R');
  let lean = 0.14 + run * 0.1; // forward lean (towards -z)
  let toeR = 0;
  let follow = 0;
  if (t >= T * 0.78) {
    // the kicking leg: cocked back at the plant, through the ball at the strike, then follow through
    const cock = clamp01((t - T * 0.78) / (T * 0.22));
    const back = v(-0.08, 0.5, 0.92);
    footR = mix(marks[4].p, back, ease(cock)); footR.y = Math.max(ANKLE, footR.y);
    toeR = cock * 0.9;
    if (strikeT != null) {
      const k = (t - (strikeT - SWING)) / SWING; // 0 = start of the swing, 1 = contact
      const contact = v(0.02, 0.13, 0.17);
      if (k > 0 && k <= 1) footR = mix(back, contact, k * k);
      else if (k > 1) {
        follow = ease(clamp01(((k - 1) * SWING) / 0.3));
        footR = mix(contact, v(0.1 + side * 0.12, 0.8, -0.72), follow);
        pelvis.z -= follow * 0.28; pelvis.y += follow * 0.05; lean = 0.24 - follow * 0.4;
        toeR = 0.9 * (1 - follow * 0.5);
      }
    }
  }
  // the run-up direction turns to face the goal as the striker arrives
  const yaw = Math.atan2(-(marks[5].p.x - start.x), start.z - marks[5].p.z) * (1 - ease(run)) * 0.8;
  // the plant foot points where the ball is going (the cue that never lies)
  const landed = t >= T - 0.001;
  const footYawL = landed ? side * 0.45 : yaw;
  // hips: open (turned across the body) for the far side, closed for the natural side; shown from hipsFrom
  const hipsFrom = Math.max(0.15, cues.hipsFrom == null ? 0.25 : cues.hipsFrom);
  const untilStrike = (strikeT != null ? strikeT : T + SWING) - t;
  const hipShow = side ? ease(clamp01((hipsFrom - untilStrike) / 0.12)) : 0;
  const hipTwist = hipShow * side * 0.38 - follow * 0.3;
  const sw = Math.sin(run * Math.PI * 5) * 0.3 * (1 - clamp01((t - T) * 5));
  const chest = { x: pelvis.x, y: pelvis.y + 0.5, z: pelvis.z - lean * 0.5 };
  const after = t > T ? 1 : 0;
  return {
    pelvis,
    torso: norm(v(0, 1, -lean)),
    yaw, hipTwist,
    footL, footR, footYawL, footYawR: yaw, toeR,
    handL: v(chest.x - 0.36 - after * 0.2, chest.y - 0.32 + after * 0.25, chest.z - sw - after * 0.15),
    handR: v(chest.x + 0.36 + after * 0.12, chest.y - 0.36 + after * 0.1, chest.z + sw + after * 0.3),
    plantSide: landed ? side : 0, hipSide: hipShow > 0.5 ? side : 0,
  };
}

function norm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }

/** Standing and waiting: weight shifting a little. `face` = 1 looks down +z, -1 looks down -z. */
export function idlePose(at, clock, face = -1) {
  const sway = Math.sin(clock * 1.3) * 0.02;
  const pelvis = v(at.x + sway, HIP - 0.02 + Math.sin(clock * 2.1) * 0.006, at.z);
  return {
    pelvis, torso: norm(v(sway * 0.5, 1, face * 0.04)), yaw: face > 0 ? Math.PI : 0, hipTwist: 0,
    footL: v(at.x - 0.13 * -face, ANKLE, at.z), footR: v(at.x + 0.13 * -face, ANKLE, at.z),
    footYawL: face > 0 ? Math.PI : 0, footYawR: face > 0 ? Math.PI : 0, toeR: 0,
    handL: v(at.x - 0.3 * -face, 0.86, at.z - face * 0.06), handR: v(at.x + 0.3 * -face, 0.86, at.z - face * 0.06),
  };
}

/** Arms up, bouncing: a goal for the striker, a save for the keeper. */
export function celebratePose(at, clock, face = -1) {
  const p = idlePose(at, clock, face);
  const hop = Math.abs(Math.sin(clock * 6)) * 0.14;
  p.pelvis.y += hop; p.footL.y += hop; p.footR.y += hop;
  p.handL = v(at.x - 0.42 * -face, 1.95 + hop, at.z - face * 0.05);
  p.handR = v(at.x + 0.42 * -face, 1.95 + hop, at.z - face * 0.05);
  return p;
}

/** Head down, hands on hips. */
export function dejectedPose(at, clock, face = -1) {
  const p = idlePose(at, clock * 0.4, face);
  p.torso = norm(v(0, 1, -face * 0.22));
  p.handL = v(at.x - 0.22 * -face, 0.98, at.z); p.handR = v(at.x + 0.22 * -face, 0.98, at.z);
  return p;
}

/**
 * The keeper, from the same body the ball collides with (core/save.js), so
 * hands, chest and legs are drawn exactly where they can stop the ball.
 * @param dive the dive plan; t seconds relative to the strike; clock for the ready stance
 */
export function keeperPose(dive, t, clock = 0) {
  const b = keeperBody(dive, t);
  const z = -KEEPER.lineZ;
  const f = b.f;
  // ready: on the toes, knees bent, hands out; it shifts from foot to foot
  const bounce = (1 - f) * (Math.sin(clock * 5) * 0.012);
  const crouch = (1 - f) * 0.1;
  const pelvis = v(b.hip.x, Math.max(0.24, b.hip.y - crouch + bounce), z);
  const across = { x: -b.dir.y, y: b.dir.x };
  const spread = 0.14 + (1 - f) * 0.3; // hands apart when ready, together when stretching
  const handsY = Math.max(0.14, b.hands.y - (1 - f) * 0.12);
  const feetSpread = 0.14 + (1 - f) * 0.1;
  return {
    pelvis,
    torso: norm(v(b.dir.x, b.dir.y, (1 - f) * 0.12)),
    yaw: Math.PI, hipTwist: 0,
    // character left is world +x when it faces +z
    handL: v(b.hands.x + across.x * spread * -1 + (1 - f) * 0.0, Math.max(0.12, handsY + across.y * spread * -1), z + 0.12 + (1 - f) * 0.2),
    handR: v(b.hands.x + across.x * spread, Math.max(0.12, handsY + across.y * spread), z + 0.12 + (1 - f) * 0.2),
    footL: v(b.feet.x - across.x * feetSpread, Math.max(ANKLE, b.feet.y - across.y * feetSpread), z),
    footR: v(b.feet.x + across.x * feetSpread, Math.max(ANKLE, b.feet.y + across.y * feetSpread), z),
    footYawL: Math.PI, footYawR: Math.PI, toeR: f * 0.8, toeL: f * 0.8,
    stretch: f,
  };
}
