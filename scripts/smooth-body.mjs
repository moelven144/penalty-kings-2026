// Turn the Quaternius "Superhero" body into an ordinary footballer's build: the sculpted muscles
// under the kit are smoothed away (Taubin smoothing, which keeps the volume), and the parts the kit
// covers are pushed out a few millimetres so the shirt and shorts read as cloth, not paint.
// Reads the untouched original from assets-src and writes the game's copy:
//   node scripts/smooth-body.mjs
// Only the body primitive's POSITION and NORMAL change; skinning, UVs and the rest of the file are kept.
import fs from 'node:fs';

const SRC_BIN = 'assets-src/characters/Superhero_Male_FullBody.original.bin';
const GLTF = 'v3/assets/characters/Superhero_Male_FullBody.gltf';
const OUT_BIN = 'v3/assets/characters/Superhero_Male_FullBody.bin';
const BODY = 'Sphere.005_Retopology.004';

// How much each joint's skin is smoothed (0 = untouched) and pushed out as cloth (metres).
const SMOOTH = { spine_01: 1, spine_02: 1, spine_03: 1, clavicle: 1, pelvis: 1, upperarm: 1, neck_01: 0.5, thigh: 0.8, lowerarm: 0.45, calf: 0.35, foot: 1, ball: 1 }; // feet: toes melt into a boot shape
const CLOTH = { spine_01: 0.007, spine_02: 0.007, spine_03: 0.006, clavicle: 0.004, pelvis: 0.009, upperarm: 0.005, thigh: 0.007 };
const ITER = Number(process.env.ITER || 40);
const LAMBDA = 0.5; const MU = -0.53;

const gltf = JSON.parse(fs.readFileSync(GLTF, 'utf8'));
const bin = fs.readFileSync(SRC_BIN);
const view = (i) => {
  const a = gltf.accessors[i]; const v = gltf.bufferViews[a.bufferView];
  const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const stride = v.byteStride ? v.byteStride / T.BYTES_PER_ELEMENT : n;
  if (stride !== n) throw new Error('interleaved data is not handled');
  return new T(bin.buffer, bin.byteOffset + off, a.count * n);
};
const prim = gltf.meshes.find((m) => m.name === BODY).primitives[0];
const P = view(prim.attributes.POSITION); const N = view(prim.attributes.NORMAL);
const J = view(prim.attributes.JOINTS_0); const W = view(prim.attributes.WEIGHTS_0);
const I = view(prim.indices);
const names = gltf.skins[0].joints.map((j) => gltf.nodes[j].name.replace(/_[lr]$/, ''));
const n = P.length / 3;

// per-vertex amounts, blended over the four joints so they change smoothly across the body
const smooth = new Float32Array(n); const cloth = new Float32Array(n);
for (let i = 0; i < n; i++) {
  for (let k = 0; k < 4; k++) {
    const w = W[i * 4 + k]; const name = names[J[i * 4 + k]];
    smooth[i] += w * (SMOOTH[name] || 0);
    let c = CLOTH[name] || 0;
    if (name === 'thigh' && P[i * 3 + 1] < 0.62) c = 0; // the shorts end above the knee
    cloth[i] += w * c;
  }
}
// weld vertices that share a position (UV seams), so seams stay closed
const key = (i) => `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
const groupOf = new Int32Array(n); const groups = []; const map = new Map();
for (let i = 0; i < n; i++) { const k = key(i); let g = map.get(k); if (g == null) { g = groups.length; map.set(k, g); groups.push([]); } groups[g].push(i); groupOf[i] = g; }
const G = groups.length;
const nb = Array.from({ length: G }, () => new Set());
for (let t = 0; t < I.length; t += 3) {
  const a = groupOf[I[t]]; const b = groupOf[I[t + 1]]; const c = groupOf[I[t + 2]];
  nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
}
for (let g = 0; g < G; g++) nb[g].delete(g);
const pos = new Float64Array(G * 3); const ws = new Float32Array(G); const cs = new Float32Array(G);
for (let g = 0; g < G; g++) {
  const i = groups[g][0];
  pos.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], g * 3);
  ws[g] = Math.max(...groups[g].map((v) => smooth[v])); cs[g] = Math.max(...groups[g].map((v) => cloth[v]));
}
// open edges (neck hole, wrists...) stay where they are
const edgeUse = new Map();
for (let t = 0; t < I.length; t += 3) for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
  const a = groupOf[I[t + x]]; const b = groupOf[I[t + y]]; const k = a < b ? `${a}_${b}` : `${b}_${a}`;
  edgeUse.set(k, (edgeUse.get(k) || 0) + 1);
}
const border = new Uint8Array(G);
for (const [k, c] of edgeUse) if (c === 1) { const [a, b] = k.split('_').map(Number); border[a] = border[b] = 1; }

const step = (f) => {
  const next = new Float64Array(pos);
  for (let g = 0; g < G; g++) {
    if (!ws[g] || border[g] || !nb[g].size) continue;
    let x = 0; let y = 0; let z = 0;
    for (const o of nb[g]) { x += pos[o * 3]; y += pos[o * 3 + 1]; z += pos[o * 3 + 2]; }
    const s = 1 / nb[g].size; const k = f * ws[g];
    next[g * 3] += (x * s - pos[g * 3]) * k; next[g * 3 + 1] += (y * s - pos[g * 3 + 1]) * k; next[g * 3 + 2] += (z * s - pos[g * 3 + 2]) * k;
  }
  pos.set(next);
};
for (let it = 0; it < ITER; it++) { step(LAMBDA); step(MU); }

// normals from the smoothed surface (area weighted, welded)
const normals = (p) => {
  const nn = new Float64Array(G * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = groupOf[I[t]]; const b = groupOf[I[t + 1]]; const c = groupOf[I[t + 2]];
    const ux = p[b * 3] - p[a * 3]; const uy = p[b * 3 + 1] - p[a * 3 + 1]; const uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3]; const vy = p[c * 3 + 1] - p[a * 3 + 1]; const vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const g of [a, b, c]) { nn[g * 3] += nx; nn[g * 3 + 1] += ny; nn[g * 3 + 2] += nz; }
  }
  for (let g = 0; g < G; g++) { const l = Math.hypot(nn[g * 3], nn[g * 3 + 1], nn[g * 3 + 2]) || 1; nn[g * 3] /= l; nn[g * 3 + 1] /= l; nn[g * 3 + 2] /= l; }
  return nn;
};
let nn = normals(pos);
for (let g = 0; g < G; g++) if (cs[g]) for (let a = 0; a < 3; a++) pos[g * 3 + a] += nn[g * 3 + a] * cs[g];
nn = normals(pos);

let moved = 0;
for (let i = 0; i < n; i++) {
  const g = groupOf[i];
  const touched = ws[g] > 0 || cs[g] > 0;
  for (let a = 0; a < 3; a++) {
    if (!touched) continue;
    moved = Math.max(moved, Math.abs(pos[g * 3 + a] - P[i * 3 + a]));
    P[i * 3 + a] = pos[g * 3 + a];
    N[i * 3 + a] = nn[g * 3 + a];
  }
}
// keep the accessor bounds true
const acc = gltf.accessors[prim.attributes.POSITION];
acc.min = [0, 1, 2].map((a) => Math.min(...Array.from({ length: n }, (_, i) => P[i * 3 + a])));
acc.max = [0, 1, 2].map((a) => Math.max(...Array.from({ length: n }, (_, i) => P[i * 3 + a])));
fs.writeFileSync(OUT_BIN, bin);
fs.writeFileSync(GLTF, JSON.stringify(gltf));
console.log(`${n} vertices, ${G} welded, ${ITER} Taubin passes, largest move ${(moved * 1000).toFixed(1)} mm`);
