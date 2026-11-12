// Development only: automatic device runs driven from the URL, reporting back
// to scripts/dev-server.mjs. Never active without an explicit ?auto= option.
//   ?auto=bench            benchmark every quality level in turn (page reloads per level)
//   ?auto=shots&tm=aces    capture every camera shot at the current level and tone mapping
//   ?auto=soak&tier=high   run for 4 minutes and report fps every 10 s (heat / throttling)
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
