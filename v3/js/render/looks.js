// Penalty Kings v3.1 — cosmetic looks from the locker: ball designs and trails,
// and weather (rain, snow, neon). Looks only: nothing here touches the physics.
import * as THREE from 'three';
import { ballTexture } from './textures.js';

const ballCache = new Map();

/** Dress the ball. @param look item look from core/modes.js ITEMS */
export function setBallLook(ball, look = {}) {
  const key = JSON.stringify(look);
  if (!ballCache.has(key)) ballCache.set(key, ballTexture(512, look));
  const m = ball.material;
  if (m.map !== ballCache.get(key)) { m.map = ballCache.get(key); m.needsUpdate = true; }
  m.metalness = look.metal ? 0.85 : 0;
  m.roughness = look.metal ? 0.22 : 0.38;
  m.emissive = new THREE.Color(look.glow || '#000000');
  m.emissiveIntensity = look.glow ? 0.9 : 0;
  m.emissiveMap = look.glow ? m.map : null;
  ball.userData.trail = look.trail || null;
}

/** A short glowing trail behind the ball while it flies (fire and ice balls). */
export function createTrail(scene) {
  const N = 26;
  const pos = new Float32Array(N * 3);
  const age = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
  const color = { value: new THREE.Color('#ff6a00') };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uColor: color, uScale: { value: 1 } },
    vertexShader: 'attribute float aAge; uniform float uScale; varying float vA; void main(){ vA = 1.0 - aAge; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uScale * (0.26 * vA + 0.05) / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor * 2.2, (1.0 - d * 2.0) * vA * 0.8); }',
  }));
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);
  let head = 0; let last = null;
  return {
    /** @param ball the ball mesh; active while it flies; pxPerUnit = drawing-buffer height / (2 tan(fov/2)) */
    update(ball, active, pxPerUnit) {
      const c = ball.userData.trail;
      if (!c || !active) { pts.visible = false; last = null; return; }
      pts.visible = true;
      color.value.set(c);
      pts.material.uniforms.uScale.value = pxPerUnit;
      const p = ball.position;
      if (!last || last.distanceToSquared(p) > 0.0025) {
        pos.set([p.x, p.y, p.z], head * 3);
        age[head] = 0;
        head = (head + 1) % N;
        last = (last || new THREE.Vector3()).copy(p);
      }
      for (let i = 0; i < N; i++) age[i] = Math.min(1, age[i] + 1 / N);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAge.needsUpdate = true;
    },
    clear() { age.fill(1); geo.attributes.aAge.needsUpdate = true; pts.visible = false; last = null; },
  };
}

/** Rain or snow falling around the penalty area. Counts scale with the quality level. */
export function createWeather(scene, tier) {
  const box = { x: 26, y: 22, z0: -26, z1: 14 };
  const dens = { low: 0.4, medium: 0.7, high: 1, ultra: 1.2 }[tier.label.toLowerCase()] || 1;
  // rain: short streaks
  const rainN = Math.round(2600 * dens);
  const rp = new Float32Array(rainN * 6);
  const seedR = new Float32Array(rainN * 3);
  for (let i = 0; i < rainN; i++) { seedR[i * 3] = (Math.random() - 0.5) * box.x * 2; seedR[i * 3 + 1] = Math.random() * box.y; seedR[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0); }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0.75, 0.82, 0.95), transparent: true, opacity: 0.32, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false;
  // snow: soft flakes
  const snowN = Math.round(2200 * dens);
  const sp = new Float32Array(snowN * 3);
  for (let i = 0; i < snowN; i++) { sp[i * 3] = (Math.random() - 0.5) * box.x * 2; sp[i * 3 + 1] = Math.random() * box.y; sp[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0); }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.4, 1.45, 1.55), size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
  snow.frustumCulled = false; snow.visible = false;
  scene.add(rain, snow);
  let kind = 'clear'; let clock = 0;
  const wrap = (v, lo, hi) => (v < lo ? v + (hi - lo) : v);
  return {
    get kind() { return kind; },
    set(k) { kind = k; rain.visible = k === 'rain'; snow.visible = k === 'snow'; },
    update(dt) {
      clock += dt;
      if (kind === 'rain') {
        for (let i = 0; i < rainN; i++) {
          let y = seedR[i * 3 + 1] - dt * 19;
          y = wrap(y, 0, box.y);
          seedR[i * 3 + 1] = y;
          const x = seedR[i * 3] + y * 0.04; const z = seedR[i * 3 + 2];
          const o = i * 6;
          rp[o] = x; rp[o + 1] = y; rp[o + 2] = z; rp[o + 3] = x + 0.02; rp[o + 4] = y + 0.45; rp[o + 5] = z;
        }
        rainGeo.attributes.position.needsUpdate = true;
      } else if (kind === 'snow') {
        for (let i = 0; i < snowN; i++) {
          const o = i * 3;
          sp[o + 1] = wrap(sp[o + 1] - dt * (0.8 + (i % 7) * 0.08), 0, box.y);
          sp[o] += Math.sin(clock * 0.9 + i) * dt * 0.25;
        }
        snowGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}

/** Shirt, shorts and socks for the player's own team in a given kit style. */
export function kitFor(team, style = 'home', pattern = 'plain') {
  switch (style) {
    case 'away': return { shirt: team.c2, shirt2: team.c1, shorts: team.c1, socks: team.c2, pattern };
    case 'retro': return { shirt: team.c1, shirt2: team.c2, shorts: '#f1ead6', socks: team.c1, pattern: 'hoops' };
    case 'black': return { shirt: '#15171d', shirt2: team.c1, shorts: '#15171d', socks: team.c1, pattern: 'sash' };
    case 'neon': return { shirt: '#b6ff2e', shirt2: '#14161c', shorts: '#14161c', socks: '#b6ff2e', pattern: 'plain' };
    default: return { shirt: team.c1, shirt2: team.c2, shorts: team.c2, socks: team.c1, pattern };
  }
}
