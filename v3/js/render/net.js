// Penalty Kings v3 — the goal net as simulated cloth (Verlet). Four panels
// (back, roof, two sides), each pinned to the goal frame and ground bars, hung
// with a little slack. The ball pushes the mesh as a sphere; the ball's own
// slowing down is done in core/ball.js so results stay deterministic.
import * as THREE from 'three';
import { GOAL_Z, GOAL_HALF_W, GOAL_H, NET_DEPTH, BALL_R } from './layout.js';
import { netTexture } from './textures.js';

const SLACK = 1.05; // rest length relative to the pinned spacing: the net hangs loose
const DAMP = 0.985;
const GRAVITY = -3.2; // light: it is a net, and it is held all round
const DT = 1 / 120;

/** One rectangular panel between four corners (a -> b along u, a -> d along v). */
function makePanel(a, b, d, nu, nv, material, out) {
  const n = nu * nv;
  const pos = new Float32Array(n * 3);
  const prev = new Float32Array(n * 3);
  const pinned = new Uint8Array(n);
  const uv = new Float32Array(n * 2);
  const ux = (b.x - a.x) / (nu - 1); const uy = (b.y - a.y) / (nu - 1); const uz = (b.z - a.z) / (nu - 1);
  const vx = (d.x - a.x) / (nv - 1); const vy = (d.y - a.y) / (nv - 1); const vz = (d.z - a.z) / (nv - 1);
  const lu = Math.hypot(ux, uy, uz); const lv = Math.hypot(vx, vy, vz);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const k = j * nu + i;
    pos[k * 3] = a.x + ux * i + vx * j; pos[k * 3 + 1] = a.y + uy * i + vy * j; pos[k * 3 + 2] = a.z + uz * i + vz * j;
    pinned[k] = i === 0 || j === 0 || i === nu - 1 || j === nv - 1 ? 1 : 0;
    uv[k * 2] = (i * lu) / 0.12; uv[k * 2 + 1] = (j * lv) / 0.12;
  }
  prev.set(pos);
  const idx = [];
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const k = j * nu + i;
    idx.push(k, k + 1, k + nu, k + 1, k + nu + 1, k + nu);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  // out = the panel's outward direction; origin = a point on its plane
  return { pos, prev, pinned, nu, nv, lu: lu * SLACK, lv: lv * SLACK, geo, mesh, out, origin: a };
}

export function createNet(scene, tier) {
  const tex = netTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = tier.anisotropy;
  const material = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.06, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9, color: '#f4f7fb' });
  const [nx, ny] = tier.netNodes;
  const nd = Math.max(6, Math.round(nx * (NET_DEPTH / (GOAL_HALF_W * 2))));
  const W = GOAL_HALF_W; const H = GOAL_H; const zf = GOAL_Z; const zb = GOAL_Z - NET_DEPTH;
  const P = (x, y, z) => ({ x, y, z });
  const panels = [
    makePanel(P(-W, 0, zb), P(W, 0, zb), P(-W, H, zb), nx, ny, material, P(0, 0, -1)), // back
    makePanel(P(-W, H, zf), P(W, H, zf), P(-W, H, zb), nx, nd, material, P(0, 1, 0)), // roof
    makePanel(P(-W, 0, zf), P(-W, 0, zb), P(-W, H, zf), nd, ny, material, P(-1, 0, 0)), // left
    makePanel(P(W, 0, zf), P(W, 0, zb), P(W, H, zf), nd, ny, material, P(1, 0, 0)), // right
  ];
  const group = new THREE.Group();
  group.userData.tag = 'net';
  for (const p of panels) group.add(p.mesh);
  scene.add(group);

  let energy = 1; // > 0 while the net is moving; the simulation sleeps when it has settled
  let acc = 0;
  let quiet = 0; // seconds since the ball was last near

  function relax(p, i0, i1, rest) {
    const { pos, pinned } = p;
    const a = i0 * 3; const b = i1 * 3;
    const dx = pos[b] - pos[a]; const dy = pos[b + 1] - pos[a + 1]; const dz = pos[b + 2] - pos[a + 2];
    const d = Math.hypot(dx, dy, dz);
    if (d <= rest || d < 1e-9) return; // a net only pulls, it never pushes
    const k = ((d - rest) / d) * 0.5;
    const wa = pinned[i0] ? 0 : pinned[i1] ? 2 : 1;
    const wb = pinned[i1] ? 0 : pinned[i0] ? 2 : 1;
    pos[a] += dx * k * wa; pos[a + 1] += dy * k * wa; pos[a + 2] += dz * k * wa;
    pos[b] -= dx * k * wb; pos[b + 1] -= dy * k * wb; pos[b + 2] -= dz * k * wb;
  }

  function stepPanel(p, ball, inside) {
    const { pos, prev, pinned, nu, nv } = p;
    const n = nu * nv;
    let moved = 0;
    for (let k = 0; k < n; k++) {
      if (pinned[k]) continue;
      const o = k * 3;
      const vx = (pos[o] - prev[o]) * DAMP; const vy = (pos[o + 1] - prev[o + 1]) * DAMP; const vz = (pos[o + 2] - prev[o + 2]) * DAMP;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
      pos[o] += vx; pos[o + 1] += vy + GRAVITY * DT * DT; pos[o + 2] += vz;
      moved += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }
    for (let it = 0; it < 3; it++) {
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const k = j * nu + i;
        if (i + 1 < nu) relax(p, k, k + 1, p.lu);
        if (j + 1 < nv) relax(p, k, k + nu, p.lv);
      }
    }
    if (ball && inside) {
      // The ball is in the goal and may be past this panel's plane (it moves up to 0.5 m a frame, so a
      // plain sphere test would let it tunnel through). Whatever mesh lies in the ball's path is carried
      // out in front of it: no particle may sit behind the ball's leading surface.
      const R = BALL_R + 0.025;
      const { out, origin } = p;
      const c = (ball.x - origin.x) * out.x + (ball.y - origin.y) * out.y + (ball.z - origin.z) * out.z;
      if (c + R > 0) {
        for (let k = 0; k < n; k++) {
          if (pinned[k]) continue;
          const o = k * 3;
          const dx = pos[o] - ball.x; const dy = pos[o + 1] - ball.y; const dz = pos[o + 2] - ball.z;
          const along = dx * out.x + dy * out.y + dz * out.z; // particle ahead (+) or behind (-) the ball's centre
          const lx = dx - along * out.x; const ly = dy - along * out.y; const lz = dz - along * out.z;
          const r2 = lx * lx + ly * ly + lz * lz;
          if (r2 >= R * R) continue;
          const need = Math.sqrt(R * R - r2);
          if (along < need) {
            const push = need - along;
            pos[o] += out.x * push; pos[o + 1] += out.y * push; pos[o + 2] += out.z * push;
            moved += 1;
          }
        }
      }
    } else if (ball) {
      const R = BALL_R + 0.025;
      for (let k = 0; k < n; k++) {
        if (pinned[k]) continue;
        const o = k * 3;
        const dx = pos[o] - ball.x; const dy = pos[o + 1] - ball.y; const dz = pos[o + 2] - ball.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R * R && d2 > 1e-9) {
          const d = Math.sqrt(d2); const s = R / d;
          pos[o] = ball.x + dx * s; pos[o + 1] = ball.y + dy * s; pos[o + 2] = ball.z + dz * s;
          moved += 1;
        }
      }
    }
    // the turf
    for (let k = 0; k < n; k++) { const o = k * 3 + 1; if (pos[o] < 0.01) pos[o] = 0.01; }
    return moved / n;
  }

  // let the slack settle before the first frame, so the net starts at rest
  for (let i = 0; i < 90; i++) for (const p of panels) stepPanel(p, null, false);
  for (const p of panels) { p.geo.attributes.position.needsUpdate = true; p.geo.computeVertexNormals(); }
  energy = 0;

  return {
    group,
    /** How far the back panel is pushed out behind its frame right now, in metres (for tests). */
    backBulge() {
      let m = 0;
      const p = panels[0].pos;
      for (let k = 2; k < p.length; k += 3) m = Math.max(m, zb - p[k]);
      return m;
    },
    get awake() { return energy > 0; },
    /** Wake the net (the ball is near, or something shook it). */
    wake() { energy = Math.max(energy, 1); quiet = 0; },
    /**
     * @param dt seconds since the last frame
     * @param ball world position of the ball {x, y, z}, or null when it is nowhere near the goal
     * @param inside true once the ball has gone in between the posts (it then stretches the net from within)
     */
    update(dt, ball, inside = false) {
      const nearGoal = ball && ball.z < GOAL_Z + 0.6 && Math.abs(ball.x) < GOAL_HALF_W + 1 && ball.y < GOAL_H + 1;
      if (nearGoal) { energy = 1; quiet = 0; } else quiet += dt;
      if (energy > 0 && quiet > 4) energy = 0; // settled enough: stop simulating until the next shot
      if (energy <= 0) return;
      acc = Math.min(acc + dt, 4 * DT);
      let moved = 0;
      while (acc >= DT) {
        acc -= DT;
        moved = 0;
        for (const p of panels) moved = Math.max(moved, stepPanel(p, nearGoal ? ball : null, inside));
      }
      for (const p of panels) { p.geo.attributes.position.needsUpdate = true; p.geo.computeVertexNormals(); }
      if (!nearGoal && moved < 0.00004) energy -= dt * 2; else if (moved >= 0.00004) energy = 1;
    },
  };
}
