// Penalty Kings v3 — touch input for shooting, the finger trail, and the
// touch-latency probe. Nothing here awaits or touches layout during a touch.
import * as THREE from 'three';

const TRAIL_SECONDS = 0.38;
const MAX_POINTS = 96;

/**
 * @param canvas the game canvas
 * @param handlers {canStart(pt) -> bool, onStart(pt, timeStamp), onMove(samples), onEnd(samples), onCancel()}
 *   points and samples are in screen heights: {x, y, t} with t in seconds since the touch
 */
export function createShootInput(canvas, handlers) {
  let active = null; // { id, t0, samples }
  const unit = (e) => ({ x: e.clientX / window.innerHeight, y: e.clientY / window.innerHeight });
  // latency: how long from the touch (its hardware timestamp) to our handler and to the next frame we draw
  const lat = { handler: [], frame: [], pending: null };
  const flash = document.getElementById('flash');
  let probe = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (active) return;
    const now = performance.now();
    lat.handler.push(now - e.timeStamp);
    lat.pending = e.timeStamp;
    if (probe && flash) { flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 60); }
    const p = unit(e);
    if (!handlers.canStart(p)) return;
    active = { id: e.pointerId, t0: e.timeStamp, samples: [{ ...p, t: 0 }] };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable: moves still arrive */ }
    handlers.onStart(p, e.timeStamp);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    // coalesced events give every touch sample (120 Hz on recent iPhones), not one per frame
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const c of list.length ? list : [e]) {
      const t = (c.timeStamp - active.t0) / 1000;
      const last = active.samples[active.samples.length - 1];
      if (t > last.t) active.samples.push({ ...unit(c), t });
    }
    handlers.onMove(active.samples);
  });
  const end = (e, cancelled) => {
    if (!active || e.pointerId !== active.id) return;
    const t = (e.timeStamp - active.t0) / 1000;
    const last = active.samples[active.samples.length - 1];
    if (!cancelled && t > last.t) active.samples.push({ ...unit(e), t });
    const samples = active.samples;
    active = null;
    if (cancelled) handlers.onCancel(); else handlers.onEnd(samples, e.timeStamp);
  };
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));

  // ---- the trail: a tapering ribbon in screen space, drawn in the same GL frame as the game
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
  const pos = new Float32Array(MAX_POINTS * 2 * 3);
  const alpha = new Float32Array(MAX_POINTS * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < MAX_POINTS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const ribbon = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.96, 0.82, vA * 0.75); }',
  }));
  ribbon.frustumCulled = false;
  scene.add(ribbon);
  let trail = []; // {x, y, t (seconds, performance clock)} in CSS pixels

  return {
    get active() { return !!active; },
    /** Seconds since the current touch began (from the touch's own timestamp). */
    elapsed(now) { return active ? (now - active.t0) / 1000 : 0; },
    cancel() { active = null; },
    set probe(v) { probe = !!v; },
    get probe() { return probe; },
    /** Latency numbers in ms: touch -> handler, and touch -> the next frame we submitted. */
    latency() {
      const stat = (a) => (a.length ? { avg: a.reduce((s, v) => s + v, 0) / a.length, worst: Math.max(...a), n: a.length } : null);
      return { handler: stat(lat.handler.slice(-20)), frame: stat(lat.frame.slice(-20)) };
    },
    /** Call once per frame, after the game has rendered. */
    render(renderer, now) {
      if (lat.pending != null) { lat.frame.push(now - lat.pending); lat.pending = null; }
      const w = window.innerWidth; const h = window.innerHeight;
      if (active) {
        const s = active.samples;
        const lastT = s[s.length - 1].t;
        trail = s.filter((p) => p.t >= lastT - TRAIL_SECONDS).slice(-MAX_POINTS).map((p) => ({ x: p.x * h, y: p.y * h, age: lastT - p.t }));
        for (const p of trail) p.fade = 1 - p.age / TRAIL_SECONDS;
      } else if (trail.length) {
        for (const p of trail) p.fade -= 0.09; // fades out after the release
        trail = trail.filter((p) => p.fade > 0);
      }
      if (trail.length < 2) return;
      camera.right = w; camera.bottom = h; camera.updateProjectionMatrix();
      const n = trail.length;
      for (let i = 0; i < n; i++) {
        const p = trail[i]; const q = trail[Math.min(n - 1, i + 1)]; const r = trail[Math.max(0, i - 1)];
        let dx = q.x - r.x; let dy = q.y - r.y; const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        const half = (1.5 + 5.5 * (i / (n - 1))) * Math.max(0, p.fade);
        const o = i * 6;
        pos[o] = p.x - dy * half; pos[o + 1] = p.y + dx * half; pos[o + 2] = 0;
        pos[o + 3] = p.x + dy * half; pos[o + 4] = p.y - dx * half; pos[o + 5] = 0;
        alpha[i * 2] = alpha[i * 2 + 1] = Math.max(0, p.fade);
      }
      geo.setDrawRange(0, (n - 1) * 6);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      renderer.autoClear = auto;
    },
  };
}
