// Penalty Kings v3 — ball physics. Pure and deterministic (fixed time step, no
// randomness), so the same kick gives the same result in the app, in a
// challenge link and in Node tests.
//
// Units are metres and seconds. Origin = penalty spot on the ground.
//   x: the shooter's right, y: up, z: towards the goal. Goal line at z = 11.
//   (The renderer's world is (x, y, -z).)

export const SPOT_DISTANCE = 11.0;
export const GOAL_HALF_WIDTH = 3.66; // 7.32 m between the post centres
export const GOAL_HEIGHT = 2.44; // to the centre of the bar
export const POST_RADIUS = 0.06;
export const BALL_RADIUS = 0.11;
export const NET_DEPTH = 2.2;
export const GRAVITY = 9.81;
export const STEP = 1 / 480; // fixed physics step: 34 m/s moves 7 cm, less than the ball's radius

// A size-5 ball: 0.43 kg, 0.11 m radius, in air of 1.2 kg/m3.
const DRAG_K = 0.0133; // a = -k |v| v            (drag coefficient about 0.25)
const MAGNUS_K = 0.0058; // a = k (spin x v)        (lift slope about 1 per unit of spin ratio)
const SPIN_DECAY = 0.35; // per second
const GROUND_BOUNCE = 0.58;
const GROUND_GRIP = 0.14; // share of horizontal speed lost in a bounce
const ROLL_DECEL = 1.4; // m/s2 while rolling
const FRAME_BOUNCE = 0.62; // aluminium post and bar
const NET_SPRING = 420; // 1/s2: the net gives about half a metre to a full-power shot
const NET_DAMP = 30; // 1/s
const NET_DRAG = 5; // 1/s sideways while the ball is in the mesh

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * What a kick does to the ball.
 * @typedef {Object} Launch
 * @property {{x:number,y:number,z:number}} v     initial velocity
 * @property {number} sideSpin  rad/s about the vertical axis; positive pushes the ball towards +x
 * @property {number} topSpin   rad/s; positive dips the ball, negative (backspin) holds it up
 * @property {number} [skid]    0..1, how much less the turf grips (driven shots)
 */

/** The goal frame as capsules (a, b = segment ends, r = radius). */
export const FRAME = [
  { name: 'post', a: { x: -GOAL_HALF_WIDTH, y: 0, z: SPOT_DISTANCE }, b: { x: -GOAL_HALF_WIDTH, y: GOAL_HEIGHT, z: SPOT_DISTANCE }, r: POST_RADIUS, e: FRAME_BOUNCE },
  { name: 'post', a: { x: GOAL_HALF_WIDTH, y: 0, z: SPOT_DISTANCE }, b: { x: GOAL_HALF_WIDTH, y: GOAL_HEIGHT, z: SPOT_DISTANCE }, r: POST_RADIUS, e: FRAME_BOUNCE },
  { name: 'bar', a: { x: -GOAL_HALF_WIDTH, y: GOAL_HEIGHT, z: SPOT_DISTANCE }, b: { x: GOAL_HALF_WIDTH, y: GOAL_HEIGHT, z: SPOT_DISTANCE }, r: POST_RADIUS, e: FRAME_BOUNCE },
];

/** A new ball on the spot, struck with the given launch. */
export function newBall(launch) {
  return {
    p: { x: 0, y: BALL_RADIUS, z: 0 },
    v: { ...launch.v },
    sideSpin: launch.sideSpin || 0,
    topSpin: launch.topSpin || 0,
    skid: launch.skid || 0,
    t: 0,
    inGoal: false, // crossed the mouth between the posts and under the bar
    scored: false, // the whole ball is over the line
    past: false, // went past the goal line outside the frame
    netDepth: 0, // how far the ball is pushed into the net right now (m)
    held: false, // caught and held by the keeper
    events: [], // {type:'post'|'bar'|'ground'|'net'|'goal'|'out'|<obstacle name>, t, speed, x, y}
  };
}

function hitCapsule(s, c) {
  const { p, v } = s;
  const abx = c.b.x - c.a.x; const aby = c.b.y - c.a.y; const abz = c.b.z - c.a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const k = len2 > 0 ? clamp(((p.x - c.a.x) * abx + (p.y - c.a.y) * aby + (p.z - c.a.z) * abz) / len2, 0, 1) : 0;
  const nx = p.x - (c.a.x + abx * k); const ny = p.y - (c.a.y + aby * k); const nz = p.z - (c.a.z + abz * k);
  const d = Math.hypot(nx, ny, nz);
  const min = c.r + BALL_RADIUS;
  if (d >= min || d < 1e-9) return false;
  const ux = nx / d; const uy = ny / d; const uz = nz / d;
  p.x += ux * (min - d); p.y += uy * (min - d); p.z += uz * (min - d);
  // the obstacle may be moving (a diving keeper's hands): bounce relative to it
  const ox = c.vx || 0; const oy = c.vy || 0;
  const vn = (v.x - ox) * ux + (v.y - oy) * uy + v.z * uz;
  if (vn >= 0) return false;
  if (c.catch && -vn < c.catch) {
    // slow enough and into the hands or chest: held
    v.x = 0; v.y = 0; v.z = 0; s.sideSpin = 0; s.topSpin = 0; s.held = true;
    s.events.push({ type: c.name, t: s.t, speed: -vn, x: p.x, y: p.y, held: true });
    return true;
  }
  const j = -(1 + c.e) * vn;
  v.x += j * ux; v.y += j * uy; v.z += j * uz;
  // a glancing touch scrubs a little speed and most of the spin
  v.x *= 0.985; v.y *= 0.985; v.z *= 0.985;
  s.sideSpin *= 0.5; s.topSpin *= 0.5;
  s.events.push({ type: c.name, t: s.t, speed: -vn, x: p.x, y: p.y });
  return true;
}

/** Spring-damper along one axis: the net (or the outside of it) pushing the ball back. */
function netPush(s, axis, depth, dir, dt) {
  // depth > 0: how far the ball is into the mesh; dir: +1/-1 direction that pushes it back
  const vn = s.v[axis] * dir; // speed back out of the net
  if (vn < 0) s.v[axis] += dir * (NET_SPRING * depth - NET_DAMP * vn) * dt; // stretching: the net brakes the ball
  else s.v[axis] += dir * (NET_SPRING * 0.06 * depth) * dt - s.v[axis] * NET_DAMP * 0.5 * dt; // a net does not fire it back out
  for (const a of ['x', 'y', 'z']) if (a !== axis) s.v[a] *= 1 - NET_DRAG * dt;
  s.sideSpin *= 1 - 8 * dt; s.topSpin *= 1 - 8 * dt;
  if (depth > s.netDepth) s.netDepth = depth;
  if (!s.netTouched) { s.netTouched = true; s.events.push({ type: 'net', t: s.t, speed: Math.hypot(s.v.x, s.v.y, s.v.z), x: s.p.x, y: s.p.y }); }
}

/**
 * Advance the ball by one fixed STEP. Mutates and returns the state.
 * @param obstacles extra capsules (a keeper's body and hands): {name, a, b, r, e, catch?, vx?, vy?},
 *   or a function of time returning them (a keeper who moves)
 */
export function stepBall(s, obstacles = null) {
  if (s.held) { s.t += STEP; return s; }
  const dt = STEP;
  const { p, v } = s;
  const prevZ = p.z;
  const sp = Math.hypot(v.x, v.y, v.z);
  // drag, gravity, Magnus (spin x velocity) for spin about the vertical and the sideways axis
  let ax = -DRAG_K * sp * v.x + MAGNUS_K * (s.sideSpin * v.z);
  let ay = -DRAG_K * sp * v.y - GRAVITY + MAGNUS_K * (-s.topSpin * v.z);
  let az = -DRAG_K * sp * v.z + MAGNUS_K * (-s.sideSpin * v.x + s.topSpin * v.y);
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  const decay = 1 - SPIN_DECAY * dt;
  s.sideSpin *= decay; s.topSpin *= decay;
  s.t += dt;

  // turf: bounce, skid, then roll
  if (p.y < BALL_RADIUS) {
    p.y = BALL_RADIUS;
    if (v.y < 0) {
      const impact = -v.y;
      if (impact > 0.6) {
        v.y = impact * GROUND_BOUNCE;
        const grip = 1 - GROUND_GRIP * (1 - 0.7 * s.skid);
        v.x *= grip; v.z *= grip;
        s.sideSpin *= 0.7; s.topSpin *= 0.7;
        if (impact > 1.5) s.events.push({ type: 'ground', t: s.t, speed: impact, x: p.x, y: p.y });
      } else {
        v.y = 0;
        const h = Math.hypot(v.x, v.z);
        if (h > 1e-4) { const k = Math.max(0, h - ROLL_DECEL * dt) / h; v.x *= k; v.z *= k; }
      }
    }
  }

  // goal frame, then anything else in the way
  for (const c of FRAME) hitCapsule(s, c);
  if (obstacles) for (const c of (typeof obstacles === 'function' ? obstacles(s.t) : obstacles)) hitCapsule(s, c);

  // crossing the goal line: between the posts and under the bar, or past it
  if (!s.inGoal && !s.past && prevZ < SPOT_DISTANCE && p.z >= SPOT_DISTANCE) {
    if (Math.abs(p.x) < GOAL_HALF_WIDTH && p.y < GOAL_HEIGHT) s.inGoal = true;
    else { s.past = true; s.events.push({ type: 'out', t: s.t, speed: sp, x: p.x, y: p.y }); }
  }
  if (s.inGoal && !s.scored && p.z - BALL_RADIUS > SPOT_DISTANCE) {
    s.scored = true;
    s.events.push({ type: 'goal', t: s.t, speed: sp, x: p.x, y: p.y });
  }
  // a ball that comes back out of the mouth before fully crossing is not a goal
  if (s.inGoal && !s.scored && p.z < SPOT_DISTANCE && v.z < 0) s.inGoal = false;

  // the net: inside, it catches the ball; from outside, it keeps the ball out
  const back = SPOT_DISTANCE + NET_DEPTH;
  s.netDepth = 0;
  if (s.inGoal) {
    if (p.z + BALL_RADIUS > back) netPush(s, 'z', p.z + BALL_RADIUS - back, -1, dt);
    if (p.x + BALL_RADIUS > GOAL_HALF_WIDTH && p.z > SPOT_DISTANCE + 0.15) netPush(s, 'x', p.x + BALL_RADIUS - GOAL_HALF_WIDTH, -1, dt);
    if (p.x - BALL_RADIUS < -GOAL_HALF_WIDTH && p.z > SPOT_DISTANCE + 0.15) netPush(s, 'x', -GOAL_HALF_WIDTH - (p.x - BALL_RADIUS), 1, dt);
    if (p.y + BALL_RADIUS > GOAL_HEIGHT && p.z > SPOT_DISTANCE + 0.15) netPush(s, 'y', p.y + BALL_RADIUS - GOAL_HEIGHT, -1, dt);
  } else if (p.z > SPOT_DISTANCE + 0.15 && p.z < back && p.y < GOAL_HEIGHT + BALL_RADIUS) {
    // side netting and roof from the outside
    const overX = Math.abs(p.x) - BALL_RADIUS - GOAL_HALF_WIDTH; // negative when inside the box sideways
    const overY = p.y - BALL_RADIUS - GOAL_HEIGHT;
    if (overX < 0 && overY < 0) {
      if (-overX < -overY) netPush(s, 'x', -overX, Math.sign(p.x) || 1, dt);
      else netPush(s, 'y', -overY, 1, dt);
    }
  }
  return s;
}

/** Names an obstacle capsule can have (keeper parts). */
export const OBSTACLE_PARTS = ['hands', 'arms', 'body', 'head', 'legs'];

/** The ball has stopped mattering: at rest, or well past the goal, or far too long. */
export function ballDone(s) {
  if (s.t > 8 || s.held) return true;
  if (s.past && (s.p.z > SPOT_DISTANCE + 6 || s.t > 5)) return true;
  const sp = Math.hypot(s.v.x, s.v.y, s.v.z);
  return sp < 0.25 && s.p.y <= BALL_RADIUS + 0.02;
}

/**
 * Run a kick to its end and say what happened.
 * @returns {{outcome:'goal'|'post'|'save'|'miss', reason:string, crossing:{x,y,t}|null, events:Array, state:Object}}
 *   reason: 'clean' | 'in-off-post' | 'in-off-bar' | 'post' | 'bar' | 'over' | 'wide' | 'short' | <obstacle name>
 */
export function simulate(launch, obstacles = null) {
  const s = newBall(launch);
  let crossing = null;
  while (!ballDone(s)) {
    const pz = s.p.z;
    stepBall(s, obstacles);
    if (!crossing && pz < SPOT_DISTANCE && s.p.z >= SPOT_DISTANCE) crossing = { x: s.p.x, y: s.p.y, t: s.t };
    if (s.scored && s.t > s.events.find((e) => e.type === 'goal').t + 0.05) break;
  }
  return { ...classify(s, crossing), crossing, events: s.events, state: s };
}

/**
 * What happened, from a ball's event list (used by simulate and by a flight stepped live).
 * @returns {{outcome:'goal'|'post'|'save'|'miss', reason:string}}
 */
export function classify(s, crossing) {
  const wood = s.events.find((e) => e.type === 'post' || e.type === 'bar');
  const body = s.events.find((e) => OBSTACLE_PARTS.includes(e.type));
  const goal = s.events.find((e) => e.type === 'goal');
  if (goal) {
    return { outcome: 'goal', reason: wood && wood.t < goal.t ? `in-off-${wood.type}` : body && body.t < goal.t ? `off-${body.type}` : 'clean' };
  }
  if (body) return { outcome: 'save', reason: body.held ? 'held' : body.type };
  if (wood) return { outcome: 'post', reason: wood.type };
  return { outcome: 'miss', reason: !crossing ? 'short' : crossing.y >= GOAL_HEIGHT ? 'over' : 'wide' };
}

/** Free flight (no turf, frame or net) to the goal plane. Used to solve the aim. */
function flyToLine(v, sideSpin, topSpin) {
  const s = newBall({ v, sideSpin, topSpin });
  const dt = 1 / 240;
  for (let i = 0; i < 1400; i++) {
    const sp = Math.hypot(s.v.x, s.v.y, s.v.z);
    const ax = -DRAG_K * sp * s.v.x + MAGNUS_K * (s.sideSpin * s.v.z);
    const ay = -DRAG_K * sp * s.v.y - GRAVITY + MAGNUS_K * (-s.topSpin * s.v.z);
    const az = -DRAG_K * sp * s.v.z + MAGNUS_K * (-s.sideSpin * s.v.x + s.topSpin * s.v.y);
    const pz = s.p.z; const px = s.p.x; const py = s.p.y;
    s.v.x += ax * dt; s.v.y += ay * dt; s.v.z += az * dt;
    s.p.x += s.v.x * dt; s.p.y += s.v.y * dt; s.p.z += s.v.z * dt;
    s.sideSpin *= 1 - SPIN_DECAY * dt; s.topSpin *= 1 - SPIN_DECAY * dt;
    s.t += dt;
    if (s.p.z >= SPOT_DISTANCE) {
      const k = (SPOT_DISTANCE - pz) / (s.p.z - pz);
      return { x: px + (s.p.x - px) * k, y: py + (s.p.y - py) * k, t: s.t - dt * (1 - k) };
    }
    if (s.v.z <= 0.05 || s.p.y < -30) break;
  }
  return null;
}

/**
 * Find the launch velocity that makes the ball arrive at a point on the goal
 * plane, for a given speed and spin. The spin bends the path; the solver bends
 * the launch the other way, so "what you point at is what you aim at".
 * @param target {x, y} on the goal plane (y = height of the ball's centre)
 * @param opts {speed, sideSpin, topSpin, lob} lob = take the high arc (chips)
 * @returns {{v:{x,y,z}, speed:number, reached:boolean}}
 */
export function solveLaunch(target, { speed, sideSpin = 0, topSpin = 0, lob = false }) {
  const tx = target.x;
  const ty = Math.max(BALL_RADIUS, target.y);
  let s = speed;
  for (let attempt = 0; attempt < 8; attempt++) {
    const dist = Math.hypot(tx, SPOT_DISTANCE);
    // drag-free starting guess: the low or the high root of the projectile equation
    const g = GRAVITY; const h = ty - BALL_RADIUS; const s2 = s * s;
    const disc = s2 * s2 - g * (g * dist * dist + 2 * h * s2);
    if (disc < 0) { s *= 1.08; continue; }
    let elev = Math.atan((s2 + (lob ? 1 : -1) * Math.sqrt(disc)) / (g * dist));
    let azim = Math.atan2(tx, SPOT_DISTANCE);
    const vel = (e, a) => ({ x: s * Math.cos(e) * Math.sin(a), y: s * Math.sin(e), z: s * Math.cos(e) * Math.cos(a) });
    let ok = false;
    for (let i = 0; i < 24; i++) {
      const hit = flyToLine(vel(elev, azim), sideSpin, topSpin);
      if (!hit) { ok = false; break; }
      const ex = tx - hit.x; const ey = ty - hit.y;
      if (Math.abs(ex) < 0.004 && Math.abs(ey) < 0.004) { ok = true; break; }
      // how the arrival height changes with elevation, measured
      const hit2 = flyToLine(vel(elev + 0.004, azim), sideSpin, topSpin);
      const slope = hit2 ? (hit2.y - hit.y) / 0.004 : 0;
      if (Math.abs(slope) > 0.5) elev += clamp(ey / slope, -0.08, 0.08);
      else elev += (lob ? -1 : 1) * clamp(ey, -1, 1) * 0.02;
      azim += Math.atan2(ex, SPOT_DISTANCE);
      elev = clamp(elev, -0.05, 1.45);
    }
    if (ok) return { v: vel(elev, azim), speed: s, reached: true };
    s *= 1.08; // not enough pace to get there: the striker hits it a little harder
  }
  const dist = Math.hypot(tx, SPOT_DISTANCE);
  return { v: { x: (s * tx) / dist, y: 0.2 * s, z: (s * SPOT_DISTANCE) / dist }, speed: s, reached: false };
}
