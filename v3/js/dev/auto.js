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
 * Plays whole games through the real code on the device: a quick shootout, then Road to Glory
 * levels 1 to 3 (score, targets, keep). The "player" swipes at random spots when shooting and
 * dives at the ball when keeping. This checks that the build works and how fast it runs; it does
 * not replace a person judging the feel.
 */
async function playScript(ctx, tag) {
  const { match, app, gfx, canvas } = ctx;
  const THREE = await import('three');
  const cam = window.__pk3.camera;
  const nosnap = new URLSearchParams(location.search).has('nosnap');
  const deltas = []; let lastFrame = 0; let recording = true;
  const rec = (t) => { if (lastFrame) deltas.push(t - lastFrame); lastFrame = t; if (recording) requestAnimationFrame(rec); };
  requestAnimationFrame(rec);
  let shots = 0;
  const snap = async (name) => {
    if (nosnap) return;
    gfx.render();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (blob) await post(`/__shot?name=${tag}${name}`, blob, 'image/jpeg');
  };
  async function drive(label, until) {
    const log = [];
    const t0 = performance.now();
    let seen = null;
    while (!until() && performance.now() - t0 < 150000) {
      await frames(1);
      const k = match.kick;
      if (!k) continue;
      if (match.state === 'aim') {
        const b = match.ballOnScreen();
        const v = new THREE.Vector3((Math.random() * 2 - 1) * 2.9, 0.3 + Math.random() * 1.7, -11).project(cam);
        const e = { x: ((v.x + 1) / 2) * (innerWidth / innerHeight), y: (1 - v.y) / 2 };
        const bend = Math.random() < 0.3 ? (Math.random() - 0.5) * 0.5 : 0;
        const len = Math.hypot(e.x - b.x, e.y - b.y); const nx = -(e.y - b.y) / len; const ny = (e.x - b.x) / len;
        const pts = [{ x: b.x, y: b.y, t: 0 }, { x: b.x, y: b.y, t: 0.7 }];
        for (let i = 1; i <= 24; i++) { const q = i / 24; const off = bend * len * Math.sin(Math.PI * q); pts.push({ x: b.x + (e.x - b.x) * q + nx * off, y: b.y + (e.y - b.y) * q + ny * off, t: 0.7 + 0.2 * q }); }
        match.autoShoot(pts);
      } else if (k.keeperHuman && !k.dived && match.state === 'flight' && k.sim.t > 0.04) {
        const c = k.crossAtKeeper || { x: 0, y: 1 };
        match.autoDive({ x: c.x * (Math.random() < 0.7 ? 1 : -1), y: c.y }, k.sim.t);
      }
      if (k.result && seen !== k) {
        seen = k;
        log.push(`${k.shooterHuman ? 'me' : 'cpu'}:${k.result.outcome}/${k.result.reason}`);
        if (shots < 8) { await wait(120); await snap(`${label}_${shots++}`); }
      }
      if (match.state === 'replay' && shots < 12 && !k.snappedReplay) { k.snappedReplay = true; await wait(900); await snap(`${label}_replay${shots++}`); }
    }
    return log;
  }
  await wait(500);
  await snap('menu');
  app.start('quick');
  const quick = await drive('quick', () => app.game.phase === 'over');
  await wait(600); await snap('quick_end');
  await post('/__report', JSON.stringify({ kind: 'play', tag, mode: 'quick', title: document.getElementById('panel-title').textContent, kicks: quick }), 'application/json');
  for (const n of [1, 2, 3]) {
    app.startLevel(n);
    const log = await drive(`glory${n}`, () => app.game.phase === 'over');
    await wait(400);
    await post('/__report', JSON.stringify({ kind: 'play', tag, mode: `glory ${n} (${app.game.level.type})`, title: document.getElementById('panel-title').textContent, kicks: log }), 'application/json');
  }
  recording = false;
  deltas.sort((x, y) => x - y);
  const avg = deltas.reduce((x, y) => x + y, 0) / deltas.length;
  const rate = { fps: +(1000 / avg).toFixed(1), low1: +(1000 / deltas[Math.floor(deltas.length * 0.99)]).toFixed(1), over20ms: deltas.filter((x) => x > 20).length, frames: deltas.length };
  await post('/__report', JSON.stringify({ kind: 'play-done', tag, tier: gfx.tierName, snapshots: !nosnap, rate }), 'application/json');
}
