// Penalty Kings v3 — textures: loaded CC0 maps plus everything drawn in code.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const BASE = new URL('../../assets/textures/', import.meta.url).href;

export function loadTexture(name, { srgb = false, repeat = null, anisotropy = 4 } = {}) {
  const t = loader.load(BASE + name);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  return t;
}

export function canvasTexture(w, h, draw, { srgb = true, repeat = null, anisotropy = 4, mip = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = mip;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Soft radial glow sprite for lamps and flares. */
export function glowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,250,235,0.75)');
    grad.addColorStop(0.5, 'rgba(255,244,214,0.18)');
    grad.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Net: a diamond mesh with soft knots, tiled. Alpha-tested. */
export function netTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath();
    g.stroke();
  }, { srgb: true });
}

/**
 * A classic panelled football as an equirectangular map: 12 dark pentagons
 * (icosahedron vertices), 20 light hexagons, stitched seams. Original artwork.
 */
export function ballTexture(size = 512) {
  const w = size;
  const h = size / 2;
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) verts.push([0, a, b], [a, b, 0], [b, 0, a]);
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const pent = verts.map(norm);
  // hexagon centres = centroids of the 20 faces (triples of mutually adjacent vertices)
  const hex = [];
  const adj = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - 0.4472) < 0.01;
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    if (adj(pent[i], pent[j]) && adj(pent[j], pent[k]) && adj(pent[i], pent[k])) {
      hex.push(norm([0, 1, 2].map((n) => pent[i][n] + pent[j][n] + pent[k][n])));
    }
  }
  const centres = [...pent.map((c) => ({ c, pent: true, k: 1.0 })), ...hex.map((c) => ({ c, pent: false, k: 1 }))];
  return canvasTexture(w, h, (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const th = (y + 0.5) / h * Math.PI;
      for (let x = 0; x < w; x++) {
        const ph = (x + 0.5) / w * Math.PI * 2;
        const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        let best = -2; let second = -2; let bi = 0;
        for (let i = 0; i < centres.length; i++) {
          const c = centres[i].c;
          const dot = (d[0] * c[0] + d[1] * c[1] + d[2] * c[2]) * centres[i].k;
          if (dot > best) { second = best; best = dot; bi = i; } else if (dot > second) second = dot;
        }
        const seam = best - second < 0.006;
        const isPent = centres[bi].pent;
        const shade = 0.92 + 0.08 * Math.sin(x * 12.9898 + y * 78.233) * 0.5;
        let r; let gg; let b;
        if (seam) { r = gg = b = 38; } else if (isPent) { r = 18; gg = 22; b = 30; } else { r = 244 * shade; gg = 246 * shade; b = 250 * shade; }
        const o = (y * w + x) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { anisotropy: 8 });
}

/** Scrolling LED board strip with our own branding only. Seamless. */
export function ledTexture() {
  const words = ['PENALTY KINGS', '♛', 'SHOOT', '·', 'SAVE', '·', 'SEND IT TO YOUR MATES', '♛', '100% FREE', '·', 'NO ADS', '♛'];
  const font = '900 44px "Arial Black", Arial, sans-serif';
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const gap = 40;
  const width = Math.ceil(words.reduce((s, t) => s + m.measureText(t).width + gap, 0));
  return canvasTexture(width, 64, (g, w, h) => {
    g.fillStyle = '#03060c';
    g.fillRect(0, 0, w, h);
    g.font = font;
    g.textBaseline = 'middle';
    let x = gap / 2;
    words.forEach((t, i) => {
      g.fillStyle = t === 'PENALTY KINGS' || t === '♛' ? '#ffc933' : '#eaf2ff';
      g.fillText(t, x, h / 2 + 2);
      x += g.measureText(t).width + gap;
    });
    // LED dot grid
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let yy = 0; yy < h; yy += 4) g.fillRect(0, yy, w, 1);
    for (let xx = 0; xx < w; xx += 4) g.fillRect(xx, 0, 1, h);
  }, { repeat: [1, 1], anisotropy: 8 });
}

/** Four seated/standing supporter silhouettes in one atlas (white, tinted per person). */
export function crowdAtlas() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cw = w / 4;
    const person = (i, armsUp, lean) => {
      const cx = i * cw + cw / 2 + lean;
      // lit from above: shoulders bright, lap in the shadow of the row in front
      const shade = g.createLinearGradient(0, h * 0.4, 0, h);
      shade.addColorStop(0, '#ffffff'); shade.addColorStop(0.45, '#c9c9c9'); shade.addColorStop(1, '#6e6e6e');
      g.fillStyle = shade;
      // torso
      g.beginPath();
      g.moveTo(cx - 19, h); g.lineTo(cx - 21, h * 0.52); g.quadraticCurveTo(cx, h * 0.38, cx + 21, h * 0.52); g.lineTo(cx + 19, h);
      g.fill();
      // arms
      g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = '#e2e2e2';
      g.beginPath();
      if (armsUp === 2) { g.moveTo(cx - 19, h * 0.55); g.lineTo(cx - 25, h * 0.2); g.moveTo(cx + 19, h * 0.55); g.lineTo(cx + 25, h * 0.2); }
      else if (armsUp === 1) { g.moveTo(cx + 19, h * 0.55); g.lineTo(cx + 27, h * 0.22); g.moveTo(cx - 19, h * 0.56); g.lineTo(cx - 23, h * 0.86); }
      else { g.moveTo(cx - 20, h * 0.56); g.lineTo(cx - 23, h * 0.88); g.moveTo(cx + 20, h * 0.56); g.lineTo(cx + 23, h * 0.88); }
      g.stroke();
      // head (skin tone baked darker so the tint reads as a shirt, not a face)
      g.fillStyle = '#b89a86';
      g.beginPath(); g.arc(cx, h * 0.3, 11.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a2c24';
      g.beginPath(); g.arc(cx, h * 0.27, 11.8, Math.PI, Math.PI * 2); g.fill();
    };
    person(0, 0, 0); person(1, 0, 2); person(2, 1, -1); person(3, 2, 0);
  }, { anisotropy: 2 });
}
