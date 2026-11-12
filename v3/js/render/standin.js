// Penalty Kings v3 — milestone (b) stand-ins: a jointed mannequin striker whose
// run-up plants the standing foot exactly at RULES.runUp, and a keeper drawn
// from the same capsules the ball collides with. Both are replaced by the
// skinned, animated players in milestone (d).
import * as THREE from 'three';
import { RULES } from '../core/gesture.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function limb(material, radius) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, 1, 8), material);
  m.castShadow = true;
  return m;
}
/** Stretch a unit cylinder between two points. */
function span(mesh, a, b) {
  const d = b.clone().sub(a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, Math.max(0.001, len), 1);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
}
/** Knee position for a two-bone leg (hip, foot, bone lengths), bending forward (-z). */
function knee(hip, foot, l1, l2) {
  const d = foot.clone().sub(hip);
  const dist = Math.min(d.length(), l1 + l2 - 0.001);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const dir = d.normalize();
  const fwd = V(0, 0, -1).addScaledVector(dir, -V(0, 0, -1).dot(dir)).normalize();
  return hip.clone().addScaledVector(dir, a).addScaledVector(fwd, h);
}
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * A right-footed striker. World axes: ball at the origin, goal towards -z.
 * pose(t, strikeT): t = seconds since the touch; strikeT = when the foot meets
 * the ball (null while the finger is still down).
 */
export function createStriker(scene, { shirt = '#c8102e', shorts = '#f4f4f4', skin = '#b98a6b' } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const mShirt = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 });
  const mShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.8 });
  const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const mBoot = new THREE.MeshStandardMaterial({ color: '#14161a', roughness: 0.5 });
  const torso = limb(mShirt, 0.17); const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), mSkin);
  head.castShadow = true;
  const parts = {
    thighL: limb(mShorts, 0.085), thighR: limb(mShorts, 0.085), shinL: limb(mSkin, 0.055), shinR: limb(mSkin, 0.055),
    armL: limb(mShirt, 0.05), armR: limb(mShirt, 0.05),
    footL: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), mBoot), footR: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.26), mBoot),
  };
  group.add(torso, head, ...Object.values(parts));

  // footfalls: where each foot lands and when. The last one is the plant, beside the ball at RULES.runUp.
  const T = RULES.runUp;
  const START = V(-1.25, 0, 2.75);
  const steps = [
    { foot: 'R', t: 0, p: V(-1.13, 0, 2.7) },
    { foot: 'L', t: 0, p: V(-1.37, 0, 2.8) },
    { foot: 'R', t: T * 0.3, p: V(-0.8, 0, 1.95) },
    { foot: 'L', t: T * 0.55, p: V(-0.62, 0, 1.15) },
    { foot: 'R', t: T * 0.78, p: V(-0.22, 0, 0.62) },
    { foot: 'L', t: T, p: V(-0.24, 0, 0.06) }, // the plant foot, pointing at the goal
  ];
  const footAt = (side, t) => {
    const mine = steps.filter((s) => s.foot === side);
    let prev = mine[0]; let next = null;
    for (const s of mine) { if (s.t <= t) prev = s; else { next = s; break; } }
    if (!next) return prev.p.clone();
    // the foot leaves the ground when the other foot lands, and flies to its next mark
    const lift = Math.max(prev.t, next.t - (next.t - prev.t) * 0.62);
    const k = ease(clamp01((t - lift) / (next.t - lift)));
    const p = prev.p.clone().lerp(next.p, k);
    p.y = Math.sin(k * Math.PI) * 0.16;
    return p;
  };

  const hipH = 0.92; const L1 = 0.46; const L2 = 0.48;
  const tmp = { pelvis: V(0, 0, 0) };
  function pose(t, strikeT) {
    const run = clamp01(t / T);
    // pelvis runs from the start to just behind and left of the ball
    const pelvis = START.clone().lerp(V(-0.2, 0, 0.3), ease(run));
    pelvis.y = hipH - 0.05 - Math.abs(Math.sin(run * Math.PI * 2.5)) * 0.035;
    let footL = footAt('L', t);
    let footR = footAt('R', t);
    let lean = 0.12 + run * 0.1;
    if (t >= T * 0.78) {
      // the kicking leg: cocked back at the plant, through the ball at the strike, then follow through
      const cock = clamp01((t - T * 0.78) / (T * 0.22));
      const back = V(-0.1, 0.42, 0.95);
      footR = steps[4].p.clone().lerp(back, ease(cock));
      if (strikeT != null) {
        const swing = 0.07;
        const k = (t - (strikeT - swing)) / swing; // 0 = start of the swing, 1 = contact
        if (k > 0 && k <= 1) footR = back.clone().lerp(V(0.02, 0.1, 0.16), k * k);
        else if (k > 1) {
          const f = ease(clamp01((k - 1) * swing / 0.28));
          footR = V(0.02, 0.1, 0.16).lerp(V(0.12, 0.75, -0.75), f);
          pelvis.z -= f * 0.25; pelvis.y += f * 0.05; lean = 0.22 - f * 0.35;
        }
      }
    }
    tmp.pelvis.copy(pelvis);
    const hipLp = pelvis.clone().add(V(-0.1, 0, 0)); const hipRp = pelvis.clone().add(V(0.1, 0, 0));
    footL.y += 0.035; footR.y += 0.035;
    const kL = knee(hipLp, footL, L1, L2); const kR = knee(hipRp, footR, L1, L2);
    span(parts.thighL, hipLp, kL); span(parts.shinL, kL, footL);
    span(parts.thighR, hipRp, kR); span(parts.shinR, kR, footR);
    parts.footL.position.copy(footL).add(V(0, 0, -0.06)); parts.footR.position.copy(footR).add(V(0, 0, -0.06));
    const chest = pelvis.clone().add(V(0, 0.52, -lean * 0.52));
    span(torso, pelvis, chest);
    head.position.copy(chest).add(V(0, 0.2, -lean * 0.1));
    const sw = Math.sin(run * Math.PI * 5) * 0.28 * (1 - clamp01((t - T) * 4));
    span(parts.armL, chest.clone().add(V(-0.21, -0.04, 0)), chest.clone().add(V(-0.3, -0.5, -sw - (t > T ? 0.25 : 0))));
    span(parts.armR, chest.clone().add(V(0.21, -0.04, 0)), chest.clone().add(V(0.3 + (t > T ? 0.2 : 0), -0.5 + (t > T ? 0.15 : 0), sw)));
  }
  pose(0, null);
  return { group, pose, reset() { pose(0, null); } };
}

/** Draw a list of collision capsules (core/shot.js standingKeeper) so what you see is what the ball hits. */
export function createCapsuleKeeper(scene, capsules, color = '#f2d21f') {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b98a6b', roughness: 0.7 });
  for (const c of capsules) {
    // physics z points at the goal; the world's z is the other way
    const a = V(c.a.x, c.a.y, -c.a.z); const b = V(c.b.x, c.b.y, -c.b.z);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(c.r, len, 6, 12), c.name === 'head' ? skin : mat);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    m.castShadow = true;
    group.add(m);
  }
  group.visible = false;
  scene.add(group);
  return group;
}
