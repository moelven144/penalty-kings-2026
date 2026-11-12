// Development only: automatic device runs driven from the URL, reporting back
// to scripts/dev-server.mjs. Never active without an explicit ?auto= option.
//   ?auto=bench            benchmark every quality level in turn (page reloads per level)
//   ?auto=shots&tm=aces    capture every camera shot at the current level and tone mapping
//   ?auto=soak&tier=high   run for 4 minutes and report fps every 10 s (heat / throttling)
//   ?auto=play             milestone (b): play a set of scripted swipes through the real shooting code
//   &next=shots,soak       chain further modes after the first one finishes
import { TIER_ORDER } from '../core/quality.js';

// In the iOS app there is no server to post to, so everything is also written
// to the console, which `devicectl ... launch --console` streams to the Mac.
const native = location.protocol === 'capacitor:';
async function post(path, body, type = 'text/plain') {
  if (!native) return fetch(path, { method: 'POST', body, headers: { 'Content-Type': type } }).catch(() => {});
  if (typeof body === 'string') { console.log('PK3REPORT ' + body); return; }
  const bytes = new Uint8Array(await body.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const name = new URLSearchParams(path.split('?')[1]).get('name');
  const n = Math.ceil(b64.length / 3600);
  for (let i = 0; i < n; i++) console.log(`PK3SHOT ${name} ${i} ${n} ${b64.slice(i * 3600, (i + 1) * 3600)}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });

/** Start the next mode listed in ?next=, if any. */
function chain(params) {
  const next = (params.get('next') || '').split(',').filter(Boolean);
  if (!next.length) return false;
  const u = new URL(location.href);
  for (const k of ['i', 'j', 'tm']) u.searchParams.delete(k);
  u.searchParams.set('auto', next.shift());
  if (next.length) u.searchParams.set('next', next.join(',')); else u.searchParams.delete('next');
  if (!u.searchParams.get('tier')) u.searchParams.set('tier', 'ultra');
  location.href = u.toString();
  return true;
}

export function autoParams(params) {
  const mode = params.get('auto');
  if (!mode) return null;
  const i = Number(params.get('i') || 0);
  return { mode, i, tier: mode === 'bench' ? TIER_ORDER[i] : null };
}

/** @param ctx {{params, gfx, rig, canvas, runBenchmark:()=>Promise<string[]>, fps:()=>number, shotNames:string[]}} */
export async function runAuto(ctx) {
  const { params, gfx, rig, canvas } = ctx;
  const mode = params.get('auto');
  const tag = params.get('tag') || '';
  // keep the phone awake during a run (no touches happen)
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch { /* not supported: keep the phone awake by hand */ }
  await wait(1500);
  if (mode === 'bench') {
    const i = Number(params.get('i') || 0);
    const lines = await ctx.runBenchmark();
    await post('/__report', JSON.stringify({ kind: 'bench', tag, tier: TIER_ORDER[i], lines }), 'application/json');
    const u = new URL(location.href);
    if (i + 1 < TIER_ORDER.length) { u.searchParams.set('i', String(i + 1)); location.href = u.toString(); }
    else { await post('/__report', JSON.stringify({ kind: 'bench-done', tag }), 'application/json'); chain(params); }
  } else if (mode === 'shots') {
    // every camera shot under each tone mapping in turn (the page reloads per tone mapping)
    const TMS = ['aces', 'agx', 'neutral'];
    const j = Number(params.get('j') || 0);
    const tm = params.get('tm') || TMS[0];
    if (!params.get('tm')) { const u = new URL(location.href); u.searchParams.set('tm', tm); location.replace(u.toString()); return; }
    for (const name of ctx.shotNames) {
      rig.set(name, true);
      await frames(name === 'orbit' ? 120 : 20);
      gfx.render();
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
      if (blob) await post(`/__shot?name=${tag}${gfx.tierName}_${tm}_${name}`, blob, 'image/jpeg');
    }
    await post('/__report', JSON.stringify({ kind: 'shots', tag, tm, tier: gfx.tierName }), 'application/json');
    const u = new URL(location.href);
    if (j + 1 < TMS.length) { u.searchParams.set('j', String(j + 1)); u.searchParams.set('tm', TMS[j + 1]); location.href = u.toString(); }
    else { await post('/__report', JSON.stringify({ kind: 'shots-done', tag }), 'application/json'); chain(params); }
  } else if (mode === 'cams') {
    // Does each camera shot hold 60 fps? Real presented frames over 8 s per shot. (The blocking
    // "frame cost" swings between 8 and 17 ms on an iPhone as it scales its clocks, so it cannot answer this.)
    const out = {};
    for (const name of (params.get('cams') || 'broadcast,striker,keeper,side,low').split(',')) {
      rig.set(name, true);
      await frames(40);
      const d = [];
      let last = 0;
      await new Promise((done) => {
        const t0 = performance.now();
        const f = (t) => { if (last) d.push(t - last); last = t; if (t - t0 < 8000) requestAnimationFrame(f); else done(); };
        requestAnimationFrame(f);
      });
      d.sort((x, y) => x - y);
      const avg = d.reduce((x, y) => x + y, 0) / d.length;
      out[name] = { fps: +(1000 / avg).toFixed(1), low1: +(1000 / d[Math.floor(d.length * 0.99)]).toFixed(1), over20ms: d.filter((x) => x > 20).length, frames: d.length };
    }
    await post('/__report', JSON.stringify({ kind: 'cams', tag, tier: gfx.tierName, play: !!ctx.shooting, size: `${gfx.size.width}x${gfx.size.height}`, out }), 'application/json');
    const order = ['low', 'medium', 'high', 'ultra'];
    const want = (params.get('tiers') || '').split(',').filter(Boolean);
    const i = want.indexOf(gfx.tierName);
    if (i >= 0 && i + 1 < want.length && order.includes(want[i + 1])) { const u = new URL(location.href); u.searchParams.set('tier', want[i + 1]); location.href = u.toString(); return; }
    await post('/__report', JSON.stringify({ kind: 'cams-done', tag }), 'application/json');
    chain(params);
  } else if (mode === 'ab') {
    // what costs what: frame cost in a gameplay view with one thing switched off at a time
    const scene = window.__pk3.scene;
    const tags = {};
    scene.traverse((o) => { if (o.userData && o.userData.tag) (tags[o.userData.tag] = tags[o.userData.tag] || []).push(o); });
    const measure = async () => { await frames(8); return +gfx.measureFrameMs(12).toFixed(2); };
    for (const shotName of ['broadcast', 'keeper']) {
      rig.set(shotName, true);
      await frames(30);
      const out = { base: await measure() };
      for (const [name, list] of Object.entries(tags)) {
        for (const o of list) o.visible = false;
        out['-' + name] = await measure();
        for (const o of list) o.visible = true;
      }
      scene.traverse((o) => { if (o.isLight && o.castShadow) { o.castShadow = false; o.userData.wasShadow = true; } });
      out['-shadows'] = await measure();
      scene.traverse((o) => { if (o.userData.wasShadow) o.castShadow = true; });
      const fog = scene.fog; scene.fog = null; out['-fog'] = await measure(); scene.fog = fog;
      for (const [k, o] of [['-bloom', { bloom: false }], ['msaa2', { msaa: 2 }], ['msaa0', { msaa: 0 }], ['msaa0-bloom', { msaa: 0, bloom: false }]]) {
        gfx.setOverride(o); out[k] = await measure();
      }
      gfx.setOverride(null);
      out.again = await measure();
      await post('/__report', JSON.stringify({ kind: 'ab', tag, tier: gfx.tierName, shot: shotName, play: !!ctx.shooting, size: `${gfx.size.width}x${gfx.size.height}`, ms: out }), 'application/json');
    }
    chain(params);
  } else if (mode === 'play') {
    await playScript(ctx, tag);
    chain(params);
  } else if (mode === 'soak') {
    rig.set('orbit');
    const t0 = performance.now();
    while (performance.now() - t0 < 240000) {
      await wait(10000);
      await post('/__report', JSON.stringify({ kind: 'soak', tag, tier: gfx.tierName, t: Math.round((performance.now() - t0) / 1000), fps: +ctx.fps().toFixed(1), frameMs: +gfx.measureFrameMs(6).toFixed(2), size: `${gfx.size.width}x${gfx.size.height}` }), 'application/json');
    }
    await post('/__report', JSON.stringify({ kind: 'soak-done', tag }), 'application/json');
    chain(params);
  }
}

/**
 * Scripted swipes, built backwards from where each should point on the goal
 * plane, sent through the same code a finger uses (readSwipe -> launch -> ball).
 * This checks the build on the device; it does not replace a human judging the feel.
 */
async function playScript(ctx, tag) {
  const { shooting, gfx, canvas } = ctx;
  const THREE = await import('three');
  const cam = window.__pk3.camera;
  const toScreen = (x, y) => {
    const v = new THREE.Vector3(x, y, -11).project(cam);
    return { x: ((v.x + 1) / 2) * (innerWidth / innerHeight), y: (1 - v.y) / 2 };
  };
  // name, aim on the goal plane (m), swipe speed (screen heights/s), bulge, release time (s), rest (s), keeper
  const script = [
    ['centre, perfect timing', 0, 1.2, 2.0, 0, 0.9, 0, false],
    ['top right corner, clean', 3.0, 2.0, 2.4, 0, 0.98, 0, false],
    ['low left, rushed', -3.0, 0.4, 2.2, 0, 0.45, 0, false],
    ['curler to the left post', -2.6, 1.4, 2.3, 0.2, 0.9, 0, false],
    ['chip down the middle', 0.3, 1.9, 1.1, 0, 0.9, 0.14, false],
    ['driven low right', 2.6, 0.35, 3.0, 0, 0.92, 0, false],
    ['blast at the top corner', 3.1, 2.2, 3.6, 0, 0.9, 0, false],
    ['wide right', 5.0, 1.0, 2.0, 0, 0.9, 0, false],
    ['at the keeper', 0, 1.2, 2.2, 0, 0.9, 0, true],
    ['past the keeper', 3.0, 0.5, 2.4, 0, 0.9, 0, true],
  ];
  const results = [];
  const nosnap = new URLSearchParams(location.search).has('nosnap'); // measure frame rate without the screenshots
  const deltas = [];
  let lastFrame = 0; let recording = true;
  const rec = (t) => { if (lastFrame) deltas.push(t - lastFrame); lastFrame = t; if (recording) requestAnimationFrame(rec); };
  requestAnimationFrame(rec);
  for (const [name, ax, ay, speed, bulge, releaseT, rest, keeper] of script) {
    shooting.keeperOn = keeper;
    const a = shooting.ballOnScreen();
    const b = toScreen(ax, ay);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dur = len / speed;
    const start = releaseT - rest - dur;
    const pts = [{ x: a.x, y: a.y, t: 0 }, { x: a.x, y: a.y, t: Math.max(0.001, start) }];
    const nx = -(b.y - a.y) / len; const ny = (b.x - a.x) / len; // sideways to the swipe
    for (let i = 1; i <= 30; i++) {
      const k = i / 30; const off = bulge * len * Math.sin(Math.PI * k);
      pts.push({ x: a.x + (b.x - a.x) * k - nx * off, y: a.y + (b.y - a.y) * k - ny * off, t: start + dur * k });
    }
    for (let t = 1 / 120; t <= rest + 1e-9; t += 1 / 120) pts.push({ x: b.x, y: b.y, t: start + dur + t });
    shooting.autoShoot(pts);
    let deepest = 0; let snapped = false; let clothMax = 0; let prevDepth = 0;
    const netObj = window.__pk3.net;
    const t0 = performance.now();
    while (shooting.state !== 'idle' && performance.now() - t0 < 9000) {
      await frames(1);
      const sim = shooting.sim;
      if (sim && sim.netDepth > deepest) deepest = sim.netDepth;
      clothMax = Math.max(clothMax, netObj.backBulge());
      // one picture per kick: just after the moment that decided it
      const ev = sim && sim.events.find((e) => ['goal', 'post', 'bar', 'out', 'body', 'hands', 'legs', 'head'].includes(e.type));
      // goals are pictured when the net is stretched furthest; everything else just after it is decided
      const peak = sim && sim.scored && sim.netDepth > 0.1 && sim.netDepth < prevDepth;
      prevDepth = sim ? sim.netDepth : 0;
      if (!nosnap && !snapped && ev && (peak || sim.t > ev.t + (sim.scored ? 0.5 : 0.06))) {
        snapped = true;
        gfx.render();
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (blob) await post(`/__shot?name=${tag}play_${results.length}`, blob, 'image/jpeg');
      }
    }
    const s = shooting.lastShot; const o = shooting.lastOutcome;
    results.push({ name, type: s.type, grade: s.timing.grade, power: +s.power.toFixed(2), curve: +s.curve.toFixed(2),
      aim: [+s.aim.x.toFixed(2), +s.aim.y.toFixed(2)], outcome: o.outcome, reason: o.reason,
      crossing: o.crossing && [+o.crossing.x.toFixed(2), +o.crossing.y.toFixed(2), +o.crossing.t.toFixed(2)], net: +deepest.toFixed(2), cloth: +clothMax.toFixed(2) });
    await post('/__report', JSON.stringify({ kind: 'play', tag, ...results[results.length - 1] }), 'application/json');
    await wait(300);
  }
  recording = false;
  deltas.sort((x, y) => x - y);
  const avg = deltas.reduce((x, y) => x + y, 0) / deltas.length;
  const rate = { fps: +(1000 / avg).toFixed(1), low1: +(1000 / deltas[Math.floor(deltas.length * 0.99)]).toFixed(1), over20ms: deltas.filter((x) => x > 20).length, frames: deltas.length };
  await wait(2500);
  await post('/__report', JSON.stringify({ kind: 'play-done', tag, snapshots: !nosnap, rate, netAsleep: !window.__pk3.net.awake, clothAtRest: +window.__pk3.net.backBulge().toFixed(3), fps: +ctx.fps().toFixed(1), frameMs: +gfx.measureFrameMs(6).toFixed(2) }), 'application/json');
}
