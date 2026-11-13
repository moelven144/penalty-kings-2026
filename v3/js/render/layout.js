// Penalty Kings v3 — world layout shared by the stadium, pitch and crowd.
// World units are metres. The penalty spot is the origin; the shooter looks
// down -z; the goal line is at z = -11; +x is the shooter's right.
// (Physics uses +z towards goal: world = (x, y, -z).)

export const GOAL_Z = -11;
export const GOAL_HALF_W = 3.66;
export const GOAL_H = 2.44;
export const POST_R = 0.06;
export const BALL_R = 0.11;
export const NET_DEPTH = 2.2;

export const PITCH_HALF_W = 34;
export const PITCH_LEN = 105;
export const PITCH_CZ = GOAL_Z + PITCH_LEN / 2; // centre of the pitch (41.5)

// The stand's front row follows a rounded rectangle around the pitch.
const HX = PITCH_HALF_W + 8;
const HZ = PITCH_LEN / 2 + 9;
const R = 22;
const STRAIGHT_X = 2 * (HX - R);
const STRAIGHT_Z = 2 * (HZ - R);
const ARC = (Math.PI * R) / 2;
export const RING_LENGTH = 2 * STRAIGHT_X + 2 * STRAIGHT_Z + 4 * ARC;

/**
 * A point on the stand ring. t in [0,1) goes once around, starting behind the
 * goal (centre of the goal end) and running towards +x. d = metres outward
 * from the front row. Returns position, outward normal and base arc length.
 */
export function ringPoint(t, d = 0) {
  let s = (((t % 1) + 1) % 1) * RING_LENGTH;
  const base = s;
  const out = (x, z, nx, nz) => ({ x: x + nx * d, z: PITCH_CZ + z + nz * d, nx, nz, s: base });
  // goal end, centre -> +x corner
  if (s < STRAIGHT_X / 2) return out(s, -HZ, 0, -1);
  s -= STRAIGHT_X / 2;
  const arc = (cx, cz, a0) => {
    const a = a0 + (s / ARC) * (Math.PI / 2);
    return out(cx + Math.cos(a) * R, cz + Math.sin(a) * R, Math.cos(a), Math.sin(a));
  };
  if (s < ARC) return arc(HX - R, -(HZ - R), -Math.PI / 2);
  s -= ARC;
  if (s < STRAIGHT_Z) return out(HX, -(HZ - R) + s, 1, 0);
  s -= STRAIGHT_Z;
  if (s < ARC) return arc(HX - R, HZ - R, 0);
  s -= ARC;
  if (s < STRAIGHT_X) return out(HX - R - s, HZ, 0, 1);
  s -= STRAIGHT_X;
  if (s < ARC) return arc(-(HX - R), HZ - R, Math.PI / 2);
  s -= ARC;
  if (s < STRAIGHT_Z) return out(-HX, HZ - R - s, -1, 0);
  s -= STRAIGHT_Z;
  if (s < ARC) return arc(-(HX - R), -(HZ - R), Math.PI);
  s -= ARC;
  return out(-(HX - R) + s, -HZ, 0, -1);
}

/** Stairways through the stands: one every AISLE metres of the front-row ring, AISLE_WIDTH wide. */
export const AISLE = 11;
export const AISLE_WIDTH = 1.1;
export const inAisle = (t) => ((((t % 1) + 1) % 1) * RING_LENGTH) % AISLE < AISLE_WIDTH;

/** Ring length at an outward offset d. */
export const ringLengthAt = (d) => RING_LENGTH + 2 * Math.PI * d;

// Stand cross-section (d = metres outward from the front row, y = height).
export const STAND = {
  frontWall: [[0, 0], [0, 1.3]],
  lowerTier: [[0, 1.3], [13, 8.6]],
  midWall: [[13, 8.6], [13, 11.2], [14.6, 11.6]],
  upperTier: [[14.6, 11.6], [30, 27.2]],
  backWall: [[30, 27.2], [30, 34.5]],
  roofUnder: [[31, 34.5], [4, 30.2]],
  roofFascia: [[4, 30.2], [4, 31.6]],
  roofTop: [[4, 31.6], [31, 36]],
  ledD: -4.6,
};

/** Height of a seat at offset d on a tier given as [[d0,y0],[d1,y1]]. */
export function tierY(tier, d) {
  const [[d0, y0], [d1, y1]] = tier;
  return y0 + ((d - d0) / (d1 - d0)) * (y1 - y0);
}

/**
 * The bowl is not the same height all the way round: the long sides are two
 * tall tiers, the goal ends are one tier under a low roof, so the sky and the
 * floodlight rigs are visible behind the goal. "endness" is 1 at the ends.
 */
export function endness(t) {
  const n = Math.abs(ringPoint(t).nz);
  const k = Math.min(1, Math.max(0, (n - 0.35) / 0.5));
  return k * k * (3 - 2 * k);
}
const LOWER_TOP_D = 13;
const LOWER_TOP_Y = 8.6;
/** Map a cross-section point (d, y) to its real place at ring position t. */
export function standPoint(t, d, y) {
  const e = endness(t);
  const kd = 1 - 0.75 * e;
  const ky = 1 - 0.8 * e;
  return {
    d: d > LOWER_TOP_D ? LOWER_TOP_D + (d - LOWER_TOP_D) * kd : d,
    y: y > LOWER_TOP_Y ? LOWER_TOP_Y + (y - LOWER_TOP_Y) * ky : y,
  };
}
