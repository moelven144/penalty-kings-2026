// Take the six App Store screenshots from the real game, in headless Chrome at the exact
// pixel sizes (iPhone 6.9": 440x956 @3x = 1320x2868; iPad 13": 1024x1366 @2x = 2048x2732),
// then add the captions with scripts/store_screenshots.py.
//   node scripts/dev-server.mjs 8000 &      (serves the game)
//   node scripts/store-shots.mjs            -> .tmp/store-raw/{iphone,ipad}/<scene>.png
//   python3 scripts/store_screenshots.py .tmp/store-raw screenshots/v3
// Each scene is a real game moment set up by app.stage() (v3/js/game/app.js) and held still.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.PK_URL || 'http://localhost:8000/v3/';
const OUT = '.tmp/store-raw';
const PORT = 9333;
const SCENES = ['flight', 'save', 'end', 'party', 'map', 'title'];
const DEVICES = [
  { name: 'iphone', width: 440, height: 956, scale: 3 },
  { name: 'ipad', width: 1024, height: 1366, scale: 2 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=/private/tmp/pk-store-chrome',
  '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}
const ws = new WebSocket(await connect());
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

await send('Page.enable');
for (const dev of DEVICES) {
  fs.mkdirSync(path.join(OUT, dev.name), { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.scale, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  for (const scene of SCENES) {
    await send('Page.navigate', { url: `${BASE}?stage=${scene}&debug&shots&tier=high&noprobe&nowatchdog` });
    let ok = false;
    for (let i = 0; i < 240 && !ok; i++) { await sleep(250); ok = await evaluate('window.__pk3StageReady === true'); }
    if (!ok) { console.log(`${dev.name}/${scene}: NOT READY (${await evaluate("document.getElementById('loading-note').textContent")})`); continue; }
    await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, dev.name, scene + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log(`${dev.name}/${scene}: ${await evaluate("document.querySelector('canvas').width + 'x' + document.querySelector('canvas').height")} canvas, gpu ${await evaluate("window.__pk3.gfx.gpuName()")}`);
  }
}
ws.close();
chrome.kill();
process.exit(0);
