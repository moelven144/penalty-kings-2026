// Penalty Kings v3 — the crowd: every seat is an instanced card with a painted
// supporter, animated in the vertex shader. Stands react separately (home end
// behind the goal, away end opposite), and flags wave in the nations' colours.
import * as THREE from 'three';
import { ringPoint, ringLengthAt, STAND, tierY, PITCH_CZ, standPoint } from './layout.js';
import { crowdAtlas } from './textures.js';

const NEUTRAL = ['#d8dbe0', '#14181f', '#3b4250', '#8b93a1', '#6d3b1f', '#2f4a36'];

export function createCrowd(scene, tier) {
  const seats = [];
  const rowStep = 0.85;
  const seatStep = 0.58;
  for (const t of [STAND.lowerTier, STAND.upperTier]) {
    for (let d = t[0][0] + 0.6; d < t[1][0] - 0.3; d += rowStep) {
      const n = Math.floor(ringLengthAt(d) / seatStep);
      const y = tierY(t, d) + 0.12;
      for (let i = 0; i < n; i++) {
        if (Math.random() > tier.crowdDensity * 0.94) continue;
        const rt = (i + Math.random() * 0.3) / n;
        const sp = standPoint(rt, d, y);
        // where the upper tier is squeezed at the goal ends, keep only some rows
        if (sp.d !== d && Math.random() > (sp.d - 13) / (d - 13) + 0.05) continue;
        const p = ringPoint(rt, sp.d);
        seats.push({ x: p.x, y: sp.y, z: p.z, nx: p.nx, nz: p.nz });
      }
    }
  }

  const geo = new THREE.PlaneGeometry(0.66, 1.02);
  geo.translate(0, 0.5, 0);
  const uni = { uTime: { value: 0 }, uExcite: { value: new THREE.Vector2(0, 0) } };
  const mat = new THREE.MeshLambertMaterial({ map: crowdAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uni.uTime;
    shader.uniforms.uExcite = uni.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSeed;\nuniform float uTime;\nuniform vec2 uExcite;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        float ex = mix(uExcite.x, uExcite.y, aSeed.y);
        float r1 = fract(aSeed.x * 13.37);
        float r2 = fract(aSeed.x * 71.13);
        // calm: two seated poses. excited: more and more people throw their arms up
        float up = step(1.0 - ex * 0.92, r2);
        float frame = mix(floor(r1 * 2.0), 2.0 + floor(r1 * 2.0), up);
        vMapUv.x = (uv.x + frame) / 4.0;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = aSeed.x * 6.2831;
        float idle = sin(uTime * 1.5 + ph * 3.0) * 0.015;
        float jump = max(0.0, sin(uTime * (7.0 + r1 * 2.5) + ph * 4.0)) * 0.3 * ex * up;
        float stand = 0.22 * up * ex;
        transformed.y += idle + jump + stand;`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, seats.length);
  const seed = new Float32Array(seats.length * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  seats.forEach((f, i) => {
    e.set(0, Math.atan2(-f.nx, -f.nz) + (Math.random() - 0.5) * 0.25, 0);
    const k = 0.9 + Math.random() * 0.2;
    m4.compose(p.set(f.x, f.y, f.z), q.setFromEuler(e), s.set(k, k * (0.94 + Math.random() * 0.12), k));
    mesh.setMatrixAt(i, m4);
    seed[i * 2] = Math.random();
    seed[i * 2 + 1] = f.z > PITCH_CZ ? 1 : 0; // 0 = goal end (home), 1 = far end (away)
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // flags on poles, scattered through both ends
  const flags = [];
  const flagGeo = new THREE.PlaneGeometry(2.8, 1.7, 14, 6);
  flagGeo.translate(1.4, 0, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < tier.flags; i++) {
    const f = seats[Math.floor(Math.random() * seats.length)];
    const fm = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: uni.uTime, uA: { value: new THREE.Color('#ffffff') }, uB: { value: new THREE.Color('#c00000') }, uPhase: { value: Math.random() * 6.28 } },
      vertexShader: `uniform float uTime; uniform float uPhase; varying vec2 vUv; varying float vShade;
        void main(){ vUv = uv; vec3 p = position; float k = p.x / 2.8;
          float w = sin(p.x * 2.4 - uTime * 5.0 + uPhase) * 0.18 * k;
          p.z += w; p.y += w * 0.3 - k * k * 0.12; vShade = 0.8 + w * 1.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying vec2 vUv; varying float vShade;
        void main(){ vec3 c = vUv.y > 0.5 ? uA : uB; gl_FragColor = vec4(c * vShade * 1.6, 1.0); }`,
    });
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.6, 6), poleMat);
    pole.position.y = 1.8;
    const cloth = new THREE.Mesh(flagGeo, fm);
    cloth.position.y = 2.7;
    g.add(pole, cloth);
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = Math.atan2(-f.nx, -f.nz) + (Math.random() - 0.5);
    g.userData = { away: f.z > PITCH_CZ, base: (Math.random() - 0.5) * 0.4, phase: Math.random() * 6 };
    scene.add(g);
    flags.push({ g, fm });
  }

  const target = new THREE.Vector2(0, 0);
  let clock = 0;
  const c = new THREE.Color();
  return {
    count: seats.length,
    /** Dress the stands: the goal end in the home nation's colours, the far end in the away nation's. */
    paint(home, away) {
      for (let i = 0; i < seats.length; i++) {
        const isAway = seed[i * 2 + 1] > 0.5;
        const side = Math.abs(seats[i].x) > 30; // side stands are mixed
        const team = side ? (Math.random() < 0.5 ? home : away) : isAway ? away : home;
        const r = Math.random();
        const col = r < 0.5 ? team.c1 : r < 0.72 ? team.c2 : NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)];
        c.set(col).multiplyScalar(0.55 + Math.random() * 0.5);
        mesh.setColorAt(i, c);
      }
      mesh.instanceColor.needsUpdate = true;
      for (const { g, fm } of flags) {
        const t = g.userData.away ? away : home;
        fm.uniforms.uA.value.set(t.c1);
        fm.uniforms.uB.value.set(t.c2);
      }
    },
    /** Raise excitement (0..1) at the home end, the away end, or both. */
    react(home, away = home) {
      target.x = Math.max(target.x, home);
      target.y = Math.max(target.y, away);
    },
    update(dt) {
      clock += dt;
      uni.uTime.value = clock;
      const ex = uni.uExcite.value;
      ex.x += (target.x - ex.x) * Math.min(1, dt * 5);
      ex.y += (target.y - ex.y) * Math.min(1, dt * 5);
      target.x = Math.max(0, target.x - dt * 0.28);
      target.y = Math.max(0, target.y - dt * 0.28);
      for (const { g } of flags) {
        const k = g.userData.away ? ex.y : ex.x;
        g.rotation.z = g.userData.base + Math.sin(clock * (1.3 + k * 5) + g.userData.phase) * (0.16 + k * 0.3);
      }
    },
  };
}
