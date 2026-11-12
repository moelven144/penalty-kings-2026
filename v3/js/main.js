// Penalty Kings v3 — milestone (b): shooting practice in the stadium.
// ?viewer opens the milestone (a) viewer instead (camera shots, quality levels,
// benchmark), which is also what the automatic device runs use.
import * as THREE from 'three';
import { TIERS, TIER_ORDER, guessTier, refineTier, makeWatchdog } from './core/quality.js';
import { createRenderer } from './render/renderer.js';
import { createStadium } from './render/stadium.js';
import { createPitch, createGoal, createBall } from './render/pitch.js';
import { createCrowd } from './render/crowd.js';
import { createCameraRig, SHOT_NAMES, SHOTS } from './render/cameras.js';
import { autoParams, runAuto } from './dev/auto.js';
import { createNet } from './render/net.js';
import { createStriker, createCapsuleKeeper } from './render/standin.js';
import { createShooting } from './game/shooting.js';
import { haptics } from './game/haptics.js';
import { standingKeeper } from './core/shot.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

// ---- pick a quality tier: URL > saved choice > device guess (refined by a probe)
const device = {
  width: window.screen.width, height: window.screen.height, dpr: window.devicePixelRatio || 1,
  cores: navigator.hardwareConcurrency || 4,
  isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  isMobile: /Mobi|Android|iPhone|iPad/.test(navigator.userAgent),
};
const saved = storage && storage.getItem('pk3_tier');
const auto = autoParams(params); // development-only automatic device runs
const forced = (auto && auto.tier) || (TIER_ORDER.includes(params.get('tier')) ? params.get('tier') : null);
let tierName = forced || (TIER_ORDER.includes(saved) ? saved : guessTier(device));
const needsProbe = !forced && !saved && !auto;
const tier = TIERS[tierName];

// ---- build the world
const canvas = $('stage');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 900);
const gfx = createRenderer(canvas, scene, camera, tierName);
const stadium = createStadium(scene, tier);
const pitch = createPitch(scene, tier);
createGoal(scene);
const net = createNet(scene, tier);
const ball = createBall(scene);
const crowd = createCrowd(scene, tier);
crowd.paint({ c1: '#ba0c2f', c2: '#00205b' }, { c1: '#fcd116', c2: '#003893' });
const rig = createCameraRig(camera);
rig.set(params.get('shot') && SHOT_NAMES.includes(params.get('shot')) ? params.get('shot') : 'broadcast', true);

window.addEventListener('resize', () => { gfx.resize(); rig.refit(); });

// ---- play mode (milestone b) or the viewer
const viewer = params.has('viewer') || (!!auto && auto.mode !== 'play' && !params.has('play'));
let shooting = null;
if (!viewer) {
  const striker = createStriker(scene);
  const keeperMesh = createCapsuleKeeper(scene, standingKeeper());
  let detail = '';
  const hud = {
    result(text, kind) { $('result').textContent = text; $('result').className = kind || ''; },
    detail(text) { detail = text; $('detail').textContent = text; },
    lastDetail: () => detail,
    hint(text) { $('hint').textContent = text; },
  };
  shooting = createShooting({ canvas, scene, camera, rig, gfx, ball, crowd, net, striker, keeperMesh, hud });
  const toggle = (id, get, set, label) => {
    const b = $(id);
    const paint = () => { b.classList.toggle('on', !!get()); if (label) b.textContent = label(get()); };
    b.onclick = () => { set(!get()); paint(); };
    paint();
  };
  toggle('t-keeper', () => shooting.keeperOn, (v) => { shooting.keeperOn = v; }, (on) => `Keeper: ${on ? 'on' : 'off'}`);
  toggle('t-aid', () => shooting.aidOn, (v) => { shooting.aidOn = v; });
  toggle('t-haptics', () => haptics.enabled, (v) => { haptics.enabled = v; if (v) haptics.play('strike'); });
  toggle('t-probe', () => shooting.input.probe, (v) => { shooting.input.probe = v; });
  const views = ['broadcast', 'striker'];
  $('t-view').onclick = () => { rig.set(views[(views.indexOf(rig.shot) + 1) % views.length]); };
}

// ---- frame loop with a rolling frame-time window
const frameTimes = [];
let bench = null;
let last = performance.now();
let clock = 0;
let secondAcc = 0;
let secondFrames = 0;
let lastFps = 0;
const watchdog = makeWatchdog(tier.targetFps);
function frame(now) {
  const dtMs = now - last;
  last = now;
  const dt = Math.min(0.05, dtMs / 1000);
  clock += dt;
  frameTimes.push(dtMs);
  if (frameTimes.length > 240) frameTimes.shift();
  if (bench) bench.samples.push(dtMs);

  stadium.update(dt);
  pitch.update(dt, clock);
  crowd.update(dt);
  rig.update(dt, clock);
  if (shooting) shooting.update(now, dt);
  else { ball.rotation.y += dt * 0.2; net.update(dt, null); }
  gfx.render();
  if (shooting) shooting.input.render(gfx.renderer, performance.now());

  secondAcc += dtMs;
  secondFrames++;
  if (secondAcc >= 1000) {
    const fps = (secondFrames * 1000) / secondAcc;
    lastFps = fps;
    if (!bench && !auto && !params.has('nowatchdog') && watchdog.sample(fps)) gfx.setDynamicScale(watchdog.scale);
    updateStats(fps);
    if (shooting) {
      const l = shooting.input.latency();
      const f = (v) => (v ? `${v.avg.toFixed(0)} ms (worst ${v.worst.toFixed(0)})` : 'touch the screen');
      $('latency').textContent = `${gfx.tier.label} · ${fps.toFixed(0)} fps\ntouch to code: ${f(l.handler)}\ntouch to frame sent: ${f(l.frame)}\nhaptics: ${haptics.native ? 'native' : haptics.available ? 'vibration' : 'not on this device'}`;
    }
    secondAcc = 0;
    secondFrames = 0;
  }
  if (bench && now - bench.start >= bench.duration) finishBenchmark();
  requestAnimationFrame(frame);
}

function updateStats(fps) {
  const info = gfx.renderer.info.render;
  $('stats').textContent =
    `${gfx.tier.label} · ${fps.toFixed(0)} fps · ${gfx.size.width}x${gfx.size.height}` +
    ` · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · crowd ${crowd.count.toLocaleString()} (${crowd.meshCount.toLocaleString()} 3D)`;
}

// ---- developer overlay
function button(parent, label, onClick, on = false) {
  const b = document.createElement('button');
  b.textContent = label;
  if (on) b.classList.add('on');
  b.onclick = onClick;
  parent.appendChild(b);
  return b;
}
function buildOverlay() {
  $('shots').replaceChildren();
  for (const name of SHOT_NAMES) {
    button($('shots'), name, () => { rig.set(name); buildOverlay(); }, rig.shot === name);
  }
  $('tiers').replaceChildren();
  for (const name of TIER_ORDER) {
    button($('tiers'), TIERS[name].label, () => {
      if (storage) storage.setItem('pk3_tier', name);
      const u = new URL(location.href);
      u.searchParams.delete('tier');
      location.href = u.toString(); // world detail (crowd, grass, shadows) is built per tier
    }, name === tierName);
  }
}
$('cheer').onclick = () => { crowd.react(1, 0.15); rig.shake(1); };
$('groan').onclick = () => crowd.react(0.0, 0.9);

// ---- benchmark: 10 s title orbit, then a report to copy and send back
function startBenchmark() {
  rig.set('orbit');
  buildOverlay();
  gfx.setDynamicScale(1);
  $('bench').textContent = 'Running 10 s';
  $('report').hidden = true;
  return new Promise((done) => { bench = { start: performance.now(), duration: 10000, samples: [], done }; });
}
function finishBenchmark() {
  const s = bench.samples.slice(5).sort((a, b) => a - b);
  const done = bench.done;
  bench = null;
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const gpuMs = gfx.measureFrameMs(10);
  gfx.render(); // one clean frame so the draw-call and triangle counts are per frame
  const info = gfx.renderer.info.render;
  const lines = [
    'Penalty Kings v3 benchmark (milestone a)',
    `tier: ${gfx.tier.label}`,
    `avg fps: ${(1000 / avg).toFixed(1)}`,
    `1% low fps: ${(1000 / pct(0.99)).toFixed(1)}`,
    `median frame: ${pct(0.5).toFixed(1)} ms, worst: ${s[s.length - 1].toFixed(1)} ms`,
    `gpu frame cost: ${gpuMs.toFixed(1)} ms`,
    `render size: ${gfx.size.width}x${gfx.size.height} (screen ${device.width}x${device.height} @${device.dpr}x)`,
    `draw calls: ${info.calls}, triangles: ${info.triangles}`,
    `crowd: ${crowd.count} (${crowd.meshCount} as 3D people)`,
    `gpu: ${gfx.gpuName()}`,
    `ua: ${navigator.userAgent}`,
  ];
  $('report').textContent = lines.join('\n');
  $('report').hidden = false;
  $('bench').textContent = 'Run benchmark';
  if (navigator.clipboard) navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
  window.__pk3Report = lines;
  done(lines);
}
$('bench').onclick = startBenchmark;

// ---- boot: wait for textures, bake reflections, probe the GPU once, then show
THREE.DefaultLoadingManager.onLoad = () => {
  gfx.render();
  stadium.bakeEnvironment(gfx.renderer);
  if (needsProbe) {
    const ms = gfx.measureFrameMs(8);
    const better = refineTier(tierName, ms);
    if (storage) storage.setItem('pk3_tier', better);
    if (better !== tierName && !params.has('noprobe')) { location.reload(); return; }
  }
  buildOverlay();
  $('dev').hidden = params.has('clean') || !viewer;
  $('hud').hidden = viewer || params.has('clean');
  $('loading').classList.add('done');
  window.__pk3Ready = true;
  requestAnimationFrame((t) => { last = t; frame(t); });
  if (auto) runAuto({ params, gfx, rig, canvas, shooting, runBenchmark: startBenchmark, fps: () => lastFps, shotNames: SHOT_NAMES });
};
window.__pk3 = { rig, crowd, gfx, scene, camera, net, ball, SHOTS, get shooting() { return shooting; } };
