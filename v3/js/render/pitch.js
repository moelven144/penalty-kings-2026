// Penalty Kings v3 — pitch, markings, near-camera grass, goal and ball.
import * as THREE from 'three';
import { GOAL_Z, GOAL_HALF_W, GOAL_H, POST_R, BALL_R, NET_DEPTH, PITCH_HALF_W, PITCH_LEN, PITCH_CZ } from './layout.js';
import { loadTexture, netTexture, ballTexture } from './textures.js';

// Mowing bands: 5.5 m wide, running across the pitch. Shared by the pitch
// shader and the grass blades so they always match.
const BAND = 5.5;
const GRASS_DARK = new THREE.Color(0.085, 0.25, 0.06);
const GRASS_LIGHT = new THREE.Color(0.17, 0.42, 0.11);
const bandAt = (z) => (Math.floor((z - GOAL_Z) / BAND) % 2 + 2) % 2;

export function createPitch(scene, tier) {
  const group = new THREE.Group();
  scene.add(group);
  const aniso = tier.anisotropy;

  // ---- turf
  const W = 100;
  const L = 132;
  const detail = loadTexture('grass_detail.jpg', { srgb: true, repeat: [W / 2.2, L / 2.2], anisotropy: aniso });
  const normal = loadTexture('grass_normal.jpg', { repeat: [W / 2.2, L / 2.2], anisotropy: aniso });
  const turf = new THREE.MeshStandardMaterial({ map: detail, normalMap: normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.9, metalness: 0 });
  turf.onBeforeCompile = (shader) => {
    shader.uniforms.uDark = { value: GRASS_DARK };
    shader.uniforms.uLight = { value: GRASS_LIGHT };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPitch;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPitch = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPitch; uniform vec3 uDark; uniform vec3 uLight;`)
      .replace('#include <map_fragment>', `
        vec4 det = texture2D(map, vMapUv);
        float lum = dot(det.rgb, vec3(0.3, 0.5, 0.2));
        float tone = clamp(0.55 + lum * 1.9, 0.6, 1.45);
        // broad mottling so distant turf never goes flat
        float mott = sin(vPitch.x * 0.9 + sin(vPitch.z * 0.7) * 2.0) * sin(vPitch.z * 1.3 + sin(vPitch.x * 0.5) * 2.0);
        tone *= 1.0 + mott * 0.07;
        float band = mod(floor((vPitch.z - (${GOAL_Z.toFixed(1)})) / ${BAND.toFixed(1)}), 2.0);
        // soften the band edge a little
        float edge = abs(fract((vPitch.z - (${GOAL_Z.toFixed(1)})) / ${BAND.toFixed(1)}) - 0.5) * 2.0;
        vec3 grass = mix(uDark, uLight, band);
        grass = mix(grass, (uDark + uLight) * 0.5, smoothstep(0.985, 1.0, edge) * 0.6);
        // outside the lines: a flatter, slightly duller apron
        float inX = step(abs(vPitch.x), ${PITCH_HALF_W.toFixed(1)});
        float inZ = step(${GOAL_Z.toFixed(1)}, vPitch.z) * step(vPitch.z, ${(GOAL_Z + PITCH_LEN).toFixed(1)});
        grass = mix((uDark + uLight) * 0.46, grass, inX * inZ);
        // wear: the penalty spot and the goal mouth are scuffed and paler
        float spot = 1.0 - smoothstep(0.25, 1.5, length(vPitch.xz));
        float mouth = (1.0 - smoothstep(2.6, 4.6, abs(vPitch.x))) * (1.0 - smoothstep(0.2, 2.4, abs(vPitch.z - (${(GOAL_Z + 0.9).toFixed(1)}))));
        float wear = clamp(max(spot * 0.75, mouth * 0.6) * (0.55 + lum * 1.6), 0.0, 1.0);
        grass = mix(grass, vec3(0.2, 0.19, 0.09), wear * 0.55);
        diffuseColor.rgb *= grass * tone;`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, L), turf);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, PITCH_CZ);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- markings: thin painted quads just above the turf
  const paintMat = new THREE.MeshStandardMaterial({ color: '#c9cfc4', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lineGeo = [];
  const paint = (x1, z1, x2, z2, w = 0.12) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const g = new THREE.PlaneGeometry(w, len + w);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(x2 - x1, z2 - z1));
    g.translate((x1 + x2) / 2, 0.004, (z1 + z2) / 2);
    lineGeo.push(g);
  };
  const farZ = GOAL_Z + PITCH_LEN;
  paint(-PITCH_HALF_W, GOAL_Z, PITCH_HALF_W, GOAL_Z);
  paint(-PITCH_HALF_W, farZ, PITCH_HALF_W, farZ);
  paint(-PITCH_HALF_W, GOAL_Z, -PITCH_HALF_W, farZ);
  paint(PITCH_HALF_W, GOAL_Z, PITCH_HALF_W, farZ);
  paint(-PITCH_HALF_W, PITCH_CZ, PITCH_HALF_W, PITCH_CZ);
  for (const [gz, s] of [[GOAL_Z, 1], [farZ, -1]]) {
    for (const [half, depth] of [[20.16, 16.5], [9.16, 5.5]]) {
      paint(-half, gz, -half, gz + s * depth);
      paint(half, gz, half, gz + s * depth);
      paint(-half, gz + s * depth, half, gz + s * depth);
    }
    // the "D": part of a 9.15 m circle around the spot that lies outside the box
    const spotZ = gz + s * 11;
    const lim = Math.acos(5.5 / 9.15);
    let prev = null;
    for (let i = 0; i <= 24; i++) {
      const a = -lim + (i / 24) * 2 * lim;
      const p = [Math.sin(a) * 9.15, spotZ + s * Math.cos(a) * 9.15];
      if (prev) paint(prev[0], prev[1], p[0], p[1]);
      prev = p;
    }
  }
  { // centre circle
    let prev = null;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const p = [Math.sin(a) * 9.15, PITCH_CZ + Math.cos(a) * 9.15];
      if (prev) paint(prev[0], prev[1], p[0], p[1]);
      prev = p;
    }
  }
  const merged = mergeGeometries(lineGeo);
  const lines = new THREE.Mesh(merged, paintMat);
  lines.receiveShadow = true;
  group.add(lines);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), paintMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.005;
  spot.receiveShadow = true;
  group.add(spot);

  // ---- grass blades near the camera (the last few metres read as real turf)
  let blades = null;
  if (tier.grassBlades > 0) {
    const n = tier.grassBlades;
    const bladeGeo = new THREE.BufferGeometry();
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.008, 0, 0, 0.008, 0, 0, 0, 1, 0], 3));
    bladeGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const uni = { uTime: { value: 0 } };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uni.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float tip = position.y;
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          transformed.x += tip * tip * 0.012 * sin(uTime * 1.3 + ph);`)
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= (0.8 + 0.35 * position.y);');
    };
    blades = new THREE.InstancedMesh(bladeGeo, mat, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // denser close to the shooting camera, thinning out towards the goal
      const u = Math.random();
      const z = 7.5 - Math.pow(u, 0.6) * 13.5;
      const x = (Math.random() - 0.5) * (9 + (7.5 - z) * 0.9);
      const h = 0.035 + Math.random() * 0.04;
      e.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
      m4.compose(new THREE.Vector3(x, 0, z), q.setFromEuler(e), new THREE.Vector3(1 + Math.random(), h, 1));
      blades.setMatrixAt(i, m4);
      c.copy(bandAt(z) ? GRASS_LIGHT : GRASS_DARK).multiplyScalar(1.3 + Math.random() * 0.45);
      blades.setColorAt(i, c);
    }
    blades.receiveShadow = true;
    blades.userData.uni = uni;
    group.add(blades);
  }

  return {
    group,
    update(dt, t) { if (blades) blades.userData.uni.uTime.value = t; },
  };
}

function mergeGeometries(list) {
  let count = 0;
  for (const g of list) count += g.index.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const ng = g.toNonIndexed();
    pos.set(ng.attributes.position.array, o);
    nor.set(ng.attributes.normal.array, o);
    o += ng.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

export function createGoal(scene, tier) {
  const group = new THREE.Group();
  scene.add(group);
  const frame = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.3, metalness: 0.25 });
  const tube = (len, r = POST_R) => new THREE.CylinderGeometry(r, r, len, 24);
  const part = (geo, x, y, z, rx = 0, rz = 0, mat = frame) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  for (const sx of [-1, 1]) part(tube(GOAL_H), sx * GOAL_HALF_W, GOAL_H / 2, GOAL_Z);
  part(tube(GOAL_HALF_W * 2 + POST_R * 2), 0, GOAL_H, GOAL_Z, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    part(new THREE.SphereGeometry(POST_R, 16, 12), sx * GOAL_HALF_W, GOAL_H, GOAL_Z);
  }
  // box-net supports: thin rear uprights, top rails and a ground bar
  const thin = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.4, metalness: 0.6 });
  const backZ = GOAL_Z - NET_DEPTH;
  for (const sx of [-1, 1]) {
    part(tube(GOAL_H, 0.022), sx * GOAL_HALF_W, GOAL_H / 2, backZ, 0, 0, thin);
    part(tube(NET_DEPTH, 0.022), sx * GOAL_HALF_W, GOAL_H, GOAL_Z - NET_DEPTH / 2, Math.PI / 2, 0, thin);
    part(tube(NET_DEPTH, 0.03), sx * GOAL_HALF_W, 0.03, GOAL_Z - NET_DEPTH / 2, Math.PI / 2, 0, thin);
  }
  part(tube(GOAL_HALF_W * 2, 0.022), 0, GOAL_H, backZ, 0, Math.PI / 2, thin);
  part(tube(GOAL_HALF_W * 2, 0.03), 0, 0.03, backZ, 0, Math.PI / 2, thin);

  // static net panels for milestone (a); replaced by simulated cloth in (b)
  const tex = netTexture();
  const panel = (w, h, rx, ry) => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 0.12, h / 0.12);
    t.anisotropy = tier.anisotropy;
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.06, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9, color: '#f4f7fb' }));
    m.rotation.set(rx, ry, 0);
    group.add(m);
    return m;
  };
  panel(GOAL_HALF_W * 2, GOAL_H, 0, 0).position.set(0, GOAL_H / 2, backZ);
  panel(GOAL_HALF_W * 2, NET_DEPTH, Math.PI / 2, 0).position.set(0, GOAL_H, GOAL_Z - NET_DEPTH / 2);
  for (const sx of [-1, 1]) panel(NET_DEPTH, GOAL_H, 0, Math.PI / 2).position.set(sx * GOAL_HALF_W, GOAL_H / 2, GOAL_Z - NET_DEPTH / 2);
  return { group };
}

export function createBall(scene) {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 40, 28),
    new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  );
  ball.position.set(0, BALL_R, 0);
  ball.castShadow = true;
  scene.add(ball);
  return ball;
}
