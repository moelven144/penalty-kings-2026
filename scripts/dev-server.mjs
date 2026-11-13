// Development server for device testing. Serves the repo with caching off, and
// collects what a phone sends back during an automatic run:
//   POST /__report          text or JSON  -> .tmp/device/reports.jsonl (one line each)
//   POST /__shot?name=x     JPEG/PNG body -> .tmp/device/x.jpg
// Development only: nothing in the shipped game talks to it (the game is offline).
//   node scripts/dev-server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp', 'device');
fs.mkdirSync(out, { recursive: true });
const port = Number(process.argv[2]) || 8000;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};

function body(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/__report') {
    const text = (await body(req)).toString('utf8');
    fs.appendFileSync(path.join(out, 'reports.jsonl'), text.replace(/\n/g, ' ') + '\n');
    console.log('[report]', text.slice(0, 400));
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'POST' && url.pathname === '/__shot') {
    const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '_');
    fs.writeFileSync(path.join(out, name + '.jpg'), await body(req));
    console.log('[shot]', name);
    res.writeHead(204).end();
    return;
  }
  if (process.env.LOG_GETS && !/\.(js|jpg|css)$/.test(url.pathname)) console.log('[get]', req.socket.remoteAddress, req.url);
  let p = path.normalize(decodeURIComponent(url.pathname));
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }).end(); return; }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '::', () => console.log(`serving ${root} on port ${port} (IPv4 and IPv6)`));
