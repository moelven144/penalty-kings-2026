// Penalty Kings v2 — the stage: a floodlit night stadium, built entirely in code.
// No models, textures or images are loaded: every mesh is generated and every
// texture is drawn on a canvas at start-up. Game logic never imports this file's
// internals; main.js talks to it through createStage()'s small API.

import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { SPOT_DISTANCE, GOAL_HALF_WIDTH, GOAL_HEIGHT, POST_RADIUS, BALL_RADIUS, NET_DEPTH } from './physics.js';

// Physics x = right as the shooter sees it; the camera looks down +z where
// three.js puts screen-right at -x, so drawing mirrors x.
export const W = (x) => -x;
const GOAL_Z = SPOT_DISTANCE;
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...opts.repeat);
  }
  return t;
}

// ------------------------------------------------------------------ figures
const SKIN = ['#f1c7a5', '#d9a07a', '#b97b52', '#8d5a3b', '#5e3b26'];
const HAIR = ['#1b1410', '#3a2618', '#6b4423', '#c9a15a', '#0d0d0d'];

/** A stylised footballer: shaped torso, jointed knees and elbows, shirt number. */
class Figure {
  constructor(scene, { keeper = false, number = 10 } = {}) {
    this.keeper = keeper;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // rotates for dives, sits at the hips
    this.root.add(this.body);
    const mat = (color, rough = 0.65) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    this.shirt = mat('#2563eb', 0.7);
    this.shorts = mat('#ffffff', 0.7);
    this.socks = mat('#2563eb', 0.75);
    this.skin = mat(SKIN[Math.floor(Math.random() * SKIN.length)], 0.8);
    const hair = mat(HAIR[Math.floor(Math.random() * HAIR.length)], 0.95);
    const boots = mat(keeper ? '#111111' : ['#111111', '#f8fafc', '#f43f5e', '#22d3ee'][Math.floor(Math.random() * 4)], 0.35);
    const gloves = mat('#f8fafc', 0.5);
    const dark = mat('#0b0f19', 0.6);

    const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this.body.position.y = 0.95;

    // torso: a lathe profile from waist to shoulders, flattened front to back
    const profile = [[0.0, 0.0], [0.17, 0.0], [0.185, 0.1], [0.2, 0.26], [0.235, 0.42], [0.25, 0.52], [0.21, 0.6], [0.1, 0.64], [0.0, 0.64]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const torso = add(this.body, new THREE.LatheGeometry(profile, 20), this.shirt, 0, 0.08, 0);
    torso.scale.z = 0.6;
    // collar and shoulders
    add(this.body, new THREE.TorusGeometry(0.07, 0.016, 8, 18), dark, 0, 0.715, 0).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) add(this.body, new THREE.SphereGeometry(0.085, 12, 10), this.shirt, sx * 0.24, 0.6, 0).scale.set(1.1, 0.9, 0.9);
    // shorts
    const hips = add(this.body, new THREE.CylinderGeometry(0.19, 0.21, 0.2, 18), this.shorts, 0, 0.0, 0);
    hips.scale.z = 0.68;
    // shirt number on the back
    const numTex = canvasTexture(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.font = '900 104px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(number), w / 2, h / 2 + 6);
    });
    this.numberMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false, toneMapped: false });
    const num = add(this.body, new THREE.PlaneGeometry(0.24, 0.24), this.numberMat, 0, 0.42, -0.142);
    num.rotation.y = Math.PI;
    num.castShadow = false;

    // head: neck, skull, hair, ears and eyes
    this.head = new THREE.Group();
    this.head.position.set(0, 0.74, 0);
    this.body.add(this.head);
    add(this.head, new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10), this.skin, 0, 0.0, 0);
    add(this.head, new THREE.SphereGeometry(0.112, 20, 16), this.skin, 0, 0.13, 0).scale.set(0.93, 1.1, 1);
    const cap = add(this.head, new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), hair, 0, 0.15, -0.012);
    cap.scale.set(0.97, 1.02, 1.05);
    for (const sx of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.022, 8, 6), this.skin, sx * 0.105, 0.125, 0);
      add(this.head, new THREE.SphereGeometry(0.013, 8, 6), dark, sx * 0.04, 0.145, 0.103).castShadow = false;
    }

    // two-segment limbs: [upper pivot] -> [lower pivot at the joint]
    const limb = (x, y, upLen, upR, upMat, lowLen, lowR, lowMat) => {
      const upper = new THREE.Group();
      upper.position.set(x, y, 0);
      this.body.add(upper);
      add(upper, new THREE.CapsuleGeometry(upR, upLen - upR, 4, 10), upMat, 0, -upLen / 2, 0);
      const lower = new THREE.Group();
      lower.position.set(0, -upLen, 0);
      upper.add(lower);
      add(lower, new THREE.SphereGeometry(Math.max(upR, lowR) * 0.98, 10, 8), lowMat, 0, 0, 0); // the joint
      add(lower, new THREE.CapsuleGeometry(lowR, lowLen - lowR, 4, 10), lowMat, 0, -lowLen / 2, 0);
      return [upper, lower];
    };
    const sleeve = keeper ? this.shirt : this.skin; // keepers wear long sleeves
    [this.armL, this.elbowL] = limb(0.285, 0.6, 0.28, 0.056, this.shirt, 0.27, 0.046, sleeve);
    [this.armR, this.elbowR] = limb(-0.285, 0.6, 0.28, 0.056, this.shirt, 0.27, 0.046, sleeve);
    for (const e of [this.elbowL, this.elbowR]) {
      const hand = add(e, new THREE.SphereGeometry(keeper ? 0.082 : 0.05, 12, 10), keeper ? gloves : this.skin, 0, -0.3, 0);
      if (keeper) hand.scale.set(0.9, 1.15, 0.6);
    }
    [this.legL, this.kneeL] = limb(0.105, -0.07, 0.42, 0.088, this.skin, 0.4, 0.068, this.socks);
    [this.legR, this.kneeR] = limb(-0.105, -0.07, 0.42, 0.088, this.skin, 0.4, 0.068, this.socks);
    for (const [leg, knee] of [[this.legL, this.kneeL], [this.legR, this.kneeR]]) {
      add(leg, new THREE.CapsuleGeometry(0.1, 0.12, 4, 10), this.shorts, 0, -0.1, 0); // shorts leg
      const boot = add(knee, new THREE.CapsuleGeometry(0.052, 0.15, 4, 8), boots, 0, -0.425, 0.045);
      boot.rotation.x = Math.PI / 2;
    }
    this.joints = [this.armL, this.armR, this.legL, this.legR, this.elbowL, this.elbowR, this.kneeL, this.kneeR, this.head];
    scene.add(this.root);
  }

  setKit(shirt, shorts, socks = shirt) {
    this.shirt.color.set(shirt);
    this.shorts.color.set(shorts);
    this.socks.color.set(socks);
    const c = this.shirt.color;
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    this.numberMat.color.set(lum > 0.45 ? '#111827' : '#ffffff');
  }

  setOpacity(o) {
    this.root.traverse((m) => {
      if (m.material) {
        m.material.transparent = o < 1;
        m.material.opacity = o;
        m.material.depthWrite = o >= 1;
      }
    });
  }

  reset() {
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0.95, 0);
    for (const j of this.joints) j.rotation.set(0, 0, 0);
  }

  idle(t) {
    this.reset();
    this.body.position.y = 0.95 + Math.sin(t * 2.2) * 0.008;
    this.armL.rotation.z = 0.14;
    this.armR.rotation.z = -0.14;
    this.elbowL.rotation.x = this.elbowR.rotation.x = -0.25;
    this.head.rotation.y = Math.sin(t * 0.8) * 0.15;
  }

  /** Keeper ready stance: crouched, arms wide, bouncing on the toes. */
  ready(t) {
    this.reset();
    const bob = Math.abs(Math.sin(t * 5)) * 0.035;
    this.body.position.y = 0.84 + bob;
    this.body.rotation.x = 0.22;
    for (const [leg, knee, s] of [[this.legL, this.kneeL, 1], [this.legR, this.kneeR, -1]]) {
      leg.rotation.x = -0.62;
      leg.rotation.z = s * 0.2;
      knee.rotation.x = 0.85;
    }
    this.armL.rotation.z = 0.95 + Math.sin(t * 5) * 0.05;
    this.armR.rotation.z = -0.95 - Math.sin(t * 5) * 0.05;
    this.armL.rotation.x = this.armR.rotation.x = -0.35;
    this.elbowL.rotation.x = this.elbowR.rotation.x = -0.7;
    this.head.rotation.x = -0.15;
  }

  /** Running gait, phase in radians. */
  run(phase, lean = 0) {
    this.reset();
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    this.body.position.y = 0.94 + Math.abs(c) * 0.05;
    this.body.rotation.x = 0.16;
    this.body.rotation.z = lean;
    this.legL.rotation.x = s * 0.85;
    this.legR.rotation.x = -s * 0.85;
    this.kneeL.rotation.x = 0.25 + Math.max(0, c) * 1.25; // heel flicks up as the leg recovers
    this.kneeR.rotation.x = 0.25 + Math.max(0, -c) * 1.25;
    this.armL.rotation.x = -s * 0.8;
    this.armR.rotation.x = s * 0.8;
    this.armL.rotation.z = 0.12;
    this.armR.rotation.z = -0.12;
    this.elbowL.rotation.x = this.elbowR.rotation.x = -1.25;
  }

  /** Strike: f 0..1. Plant the left foot, cock the right leg, whip it through. */
  strike(f) {
    this.reset();
    const back = Math.min(1, f / 0.4);
    const through = THREE.MathUtils.clamp((f - 0.4) / 0.3, 0, 1);
    this.legR.rotation.x = 0.95 * back - 2.25 * through;
    this.kneeR.rotation.x = 1.5 * back * (1 - through) + 0.1;
    this.legL.rotation.x = 0.1;
    this.kneeL.rotation.x = 0.3;
    this.body.position.y = 0.92;
    this.body.rotation.x = 0.2 - 0.38 * through;
    this.body.rotation.y = 0.35 * back - 0.6 * through;
    this.armL.rotation.z = 1.25; // balance arm out
    this.armL.rotation.x = 0.4 - 0.8 * through;
    this.armR.rotation.z = -0.45;
    this.armR.rotation.x = -0.5 + 0.9 * through;
    this.elbowL.rotation.x = -0.3;
    this.elbowR.rotation.x = -0.5;
  }

  /**
   * Dive towards render-space (dx, dy) from the keeper's start, progress 0..1.
   * The whole body tips over sideways with both arms reaching past the head.
   */
  dive(dx, dy, progress) {
    this.reset();
    const p = THREE.MathUtils.smoothstep(progress, 0, 1);
    const side = Math.sign(dx) || 1;
    const reach = Math.min(1, Math.abs(dx) / 2.6);
    const high = THREE.MathUtils.clamp((dy + 0.4) / 1.6, 0, 1);
    const tilt = side * p * (0.55 + 1.0 * reach) * (1 - 0.3 * high);
    this.body.rotation.z = -tilt;
    this.body.position.x = dx * p * 0.62;
    this.body.position.y = 0.95 + (dy * 0.5 - 0.2 * reach) * p;
    const up = 2.75 * p;
    this.armL.rotation.z = side > 0 ? up * 0.62 + 0.3 : up;
    this.armR.rotation.z = side > 0 ? -up : -(up * 0.62 + 0.3);
    // the trailing leg kicks up and bends, the leading leg pushes off straight
    const lead = side > 0 ? [this.legR, this.kneeR] : [this.legL, this.kneeL];
    const trail = side > 0 ? [this.legL, this.kneeL] : [this.legR, this.kneeR];
    lead[0].rotation.z = -side * 0.15 * p;
    trail[0].rotation.z = side * 0.55 * p;
    trail[0].rotation.x = -0.4 * p;
    trail[1].rotation.x = 0.9 * p;
    this.head.rotation.z = -side * 0.25 * p;
  }

  celebrate(t) {
    this.reset();
    const jump = Math.max(0, Math.sin(t * 7)) * 0.2;
    this.body.position.y = 0.95 + jump;
    this.armL.rotation.z = 2.6 + Math.sin(t * 14) * 0.15;
    this.armR.rotation.z = -2.6 - Math.sin(t * 14) * 0.15;
    this.elbowL.rotation.x = this.elbowR.rotation.x = -0.35;
    this.kneeL.rotation.x = this.kneeR.rotation.x = jump * 3;
    this.legL.rotation.x = this.legR.rotation.x = -jump * 1.2;
    this.head.rotation.x = -0.3;
  }

  /** Hands on head, slumped. */
  dejected() {
    this.reset();
    this.body.rotation.x = 0.25;
    this.body.position.y = 0.93;
    this.head.rotation.x = 0.45;
    this.armL.rotation.z = 2.3;
    this.armR.rotation.z = -2.3;
    this.elbowL.rotation.z = 1.7;
    this.elbowR.rotation.z = -1.7;
  }
}

// ------------------------------------------------------------------ the stage
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#0b1630', 0.0085);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  // ---- sky: gradient dome + stars
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.1, 1.0);
          vec3 top = vec3(0.012, 0.025, 0.07);
          vec3 mid = vec3(0.04, 0.08, 0.2);
          vec3 glow = vec3(0.22, 0.28, 0.45);
          vec3 c = mix(glow, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.75, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = rand(0.25, 1.4);
      pos.set([Math.cos(th) * Math.cos(ph) * 280, Math.sin(ph) * 280, Math.sin(th) * Math.cos(ph) * 280], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe0ff', size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  }

  // ---- lights: cool moonlight + warm floodlights
  scene.add(new THREE.HemisphereLight('#9fb8ff', '#16301a', 0.55));
  const key = new THREE.DirectionalLight('#fff6e8', 2.4);
  key.position.set(-14, 26, -6);
  key.target.position.set(0, 0, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 16, bottom: -10, near: 1, far: 70 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#cfe0ff', 0.9);
  fill.position.set(16, 20, 30);
  scene.add(fill);

  // ---- pitch: mowed stripes with grain, painted lines
  const grass = canvasTexture(512, 1024, (g, w, h) => {
    const stripes = 16;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#2e7d32' : '#3a8f3d';
      g.fillRect(0, (i * h) / stripes, w, h / stripes);
    }
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      img.data[i] += n * 0.6;
      img.data[i + 1] += n;
      img.data[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: [3, 2] });
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 120),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 0.85, metalness: 0 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.z = 6;
  pitch.receiveShadow = true;
  scene.add(pitch);

  const lineMat = new THREE.MeshStandardMaterial({ color: '#f4f7f2', roughness: 0.6, emissive: '#2a2a2a' });
  const paint = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set(W((x1 + x2) / 2), 0.005, (z1 + z2) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  const box = (half, depth) => {
    paint(-half, GOAL_Z, -half, GOAL_Z - depth);
    paint(half, GOAL_Z, half, GOAL_Z - depth);
    paint(-half, GOAL_Z - depth, half, GOAL_Z - depth);
  };
  paint(-34, GOAL_Z, 34, GOAL_Z);
  box(20.16, 16.5);
  box(9.16, 5.5);
  paint(-34, GOAL_Z, -34, GOAL_Z - 52.5);
  paint(34, GOAL_Z, 34, GOAL_Z - 52.5);
  paint(-34, GOAL_Z - 52.5, 34, GOAL_Z - 52.5);
  { // the "D": arc of radius 9.15 around the spot, outside the box
    const pts = [];
    const lim = Math.acos(5.5 / 9.15);
    for (let a = -lim; a <= lim + 1e-6; a += lim / 16) pts.push([Math.sin(a) * 9.15, -Math.cos(a) * 9.15]);
    for (let i = 1; i < pts.length; i++) paint(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  const spotMesh = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), lineMat);
  spotMesh.rotation.x = -Math.PI / 2;
  spotMesh.position.y = 0.006;
  scene.add(spotMesh);

  // ---- goal frame
  const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.1, emissive: '#3a3a3a' });
  for (const x of [-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 20), frameMat);
    p.position.set(W(x), GOAL_HEIGHT / 2, GOAL_Z);
    p.castShadow = true;
    scene.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HALF_WIDTH * 2 + POST_RADIUS * 2, 20), frameMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL_HEIGHT, GOAL_Z);
  bar.castShadow = true;
  scene.add(bar);
  const stanchionMat = new THREE.MeshStandardMaterial({ color: '#cfd6df', roughness: 0.5 });
  for (const x of [-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, NET_DEPTH, 8), stanchionMat);
    s.rotation.x = Math.PI / 2;
    s.position.set(W(x), 0.02, GOAL_Z + NET_DEPTH / 2);
    scene.add(s);
  }

  // ---- net: alpha-textured planes; the back panel bulges where the ball hits
  const netTex = canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath();
    g.stroke();
  }, { repeat: [1, 1] });
  const netMat = (rx, ry) => {
    const t = netTex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, alphaMap: null, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, color: '#e8eef6', depthWrite: false });
  };
  const backZ = GOAL_Z + NET_DEPTH;
  const backH = GOAL_HEIGHT * 0.75;
  const netBack = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_WIDTH * 2, backH, 40, 14), netMat(36, 12));
  netBack.position.set(0, backH / 2, backZ);
  scene.add(netBack);
  const backBase = netBack.geometry.attributes.position.array.slice();
  {
    // roof: from the crossbar back and slightly down to the back panel
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_WIDTH * 2, Math.hypot(NET_DEPTH, GOAL_HEIGHT - backH)), netMat(36, 10));
    roof.rotation.x = Math.PI / 2 - Math.atan2(GOAL_HEIGHT - backH, NET_DEPTH);
    roof.position.set(0, (GOAL_HEIGHT + backH) / 2, GOAL_Z + NET_DEPTH / 2);
    scene.add(roof);
    for (const x of [-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(NET_DEPTH, 0);
      shape.lineTo(NET_DEPTH, backH);
      shape.lineTo(0, GOAL_HEIGHT);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      // UVs in metres so the mesh pattern matches the other panels
      const uv = geo.attributes.uv;
      const pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / NET_DEPTH, pos.getY(i) / GOAL_HEIGHT);
      const side = new THREE.Mesh(geo, netMat(10, 12));
      side.rotation.y = -Math.PI / 2;
      side.position.set(W(x), 0, GOAL_Z);
      scene.add(side);
    }
  }
  const netState = { x: 0, y: 1, amp: 0, vel: 0 };

  // ---- stands: stepped concrete tiers + instanced crowd + phone lights
  const standMat = new THREE.MeshStandardMaterial({ color: '#1d2433', roughness: 0.95 });
  const seatColors = ['#1e3a8a', '#b91c1c', '#0f766e', '#334155'];
  const crowdSpots = [];
  const ROWS = 16;
  const addSection = (cx, cz, width, facing, seat) => {
    // facing: angle the fans face (towards the pitch)
    const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    for (let r = 0; r < ROWS; r++) {
      const back = r * 0.85;
      const y = 0.9 + r * 0.5;
      const step = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 0.85), standMat);
      const c = new THREE.Vector3(cx, y - 0.25, cz).addScaledVector(dir, -back);
      step.position.copy(c);
      step.rotation.y = facing;
      step.receiveShadow = false;
      scene.add(step);
      const seatsHere = Math.floor(width / 0.62);
      for (let s = 0; s < seatsHere; s++) {
        if (Math.random() < 0.06) continue; // a few empty seats
        const off = -width / 2 + 0.31 + s * 0.62 + rand(-0.06, 0.06);
        const p = c.clone().addScaledVector(right, off);
        p.y = y;
        crowdSpots.push({ p, facing, seat });
      }
    }
    // the rim on top of the stand
    const rim = new THREE.Mesh(new THREE.BoxGeometry(width, 3, 0.6), standMat);
    rim.position.copy(new THREE.Vector3(cx, 0.9 + ROWS * 0.5 + 1.2, cz).addScaledVector(dir, -ROWS * 0.85 - 0.4));
    rim.rotation.y = facing;
    scene.add(rim);
    // strip lights under the roof edge
    const strip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: '#6b6656' }));
    strip.position.copy(rim.position).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(dir, 0.4);
    strip.rotation.y = facing;
    scene.add(strip);
  };
  addSection(0, GOAL_Z + 9, 64, Math.PI, seatColors[0]); // behind the goal
  addSection(-36, 2, 46, Math.PI / 2, seatColors[1]); // left side (render x<0 is shooter's right)
  addSection(36, 2, 46, -Math.PI / 2, seatColors[1]);
  addSection(0, -26, 64, 0, seatColors[2]); // behind the shooter

  const fanGeo = new THREE.CapsuleGeometry(0.17, 0.42, 2, 6);
  fanGeo.translate(0, 0.38, 0);
  const fanMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  fanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = crowdUniforms.uTime;
    shader.uniforms.uExcite = crowdUniforms.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nuniform float uExcite;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float idle = sin(uTime * 1.7 + aPhase * 6.28) * 0.03;
        float jump = max(0.0, sin(uTime * 9.0 + aPhase * 12.0)) * 0.32 * uExcite;
        transformed.y += idle + jump;`);
  };
  const crowd = new THREE.InstancedMesh(fanGeo, fanMat, crowdSpots.length);
  const phases = new Float32Array(crowdSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  crowdSpots.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, f.facing + rand(-0.2, 0.2), 0));
    const s = rand(0.88, 1.12);
    sc.set(s, s * rand(0.9, 1.1), s);
    m4.compose(f.p, q, sc);
    crowd.setMatrixAt(i, m4);
    phases[i] = Math.random();
  });
  fanGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  crowd.instanceMatrix.needsUpdate = true;
  scene.add(crowd);

  // big waving flags held up in the stands, in the two nations' colours
  const flagUniforms = { uTime: crowdUniforms.uTime };
  const flags = [];
  const flagGeo = new THREE.PlaneGeometry(2.6, 1.6, 14, 6);
  flagGeo.translate(1.3, 0, 0); // pivot on the pole
  const poleMat = new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.5 });
  for (let i = 0; i < 26; i++) {
    const f = crowdSpots[Math.floor(Math.random() * crowdSpots.length)];
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: flagUniforms.uTime, uA: { value: new THREE.Color('#ffffff') }, uB: { value: new THREE.Color('#ff0000') }, uPhase: { value: Math.random() * 6.28 } },
      vertexShader: `uniform float uTime; uniform float uPhase; varying vec2 vUv; varying float vShade;
        void main(){ vUv = uv; vec3 p = position;
          float w = sin(p.x * 2.6 - uTime * 5.0 + uPhase) * 0.16 * (p.x / 2.6);
          p.z += w; p.y += w * 0.35; vShade = 0.82 + w * 1.4;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying vec2 vUv; varying float vShade;
        void main(){ vec3 c = vUv.y > 0.5 ? uA : uB; gl_FragColor = vec4(c * vShade, 1.0); }`,
    });
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 6), poleMat);
    pole.position.y = 1.7;
    const cloth = new THREE.Mesh(flagGeo, mat);
    cloth.position.y = 2.55;
    g.add(pole, cloth);
    g.position.copy(f.p);
    g.rotation.y = f.facing + rand(-0.5, 0.5);
    g.rotation.z = rand(-0.2, 0.2);
    g.userData = { behindShooter: f.p.z < -10, base: g.rotation.z, phase: Math.random() * 6 };
    scene.add(g);
    flags.push({ g, mat });
  }
  const paintCrowd = (home, away) => {
    const c = new THREE.Color();
    const neutral = ['#e5e7eb', '#111827', '#374151', '#9ca3af', '#7c2d12'];
    for (let i = 0; i < crowdSpots.length; i++) {
      const behindShooter = crowdSpots[i].p.z < -10;
      const r = Math.random();
      let col;
      if (r < 0.62) col = behindShooter ? (Math.random() < 0.6 ? away.c1 : away.c2) : Math.random() < 0.65 ? home.c1 : home.c2;
      else if (r < 0.8) col = behindShooter ? home.c1 : away.c1;
      else col = neutral[Math.floor(Math.random() * neutral.length)];
      c.set(col).multiplyScalar(rand(0.7, 1.0));
      crowd.setColorAt(i, c);
    }
    crowd.instanceColor.needsUpdate = true;
    for (const { g, mat } of flags) {
      const t = g.userData.behindShooter ? away : home;
      mat.uniforms.uA.value.set(t.c1);
      mat.uniforms.uB.value.set(t.c2);
    }
  };

  // phone lights twinkling in the stands
  const phoneCount = 420;
  const phonePos = new Float32Array(phoneCount * 3);
  for (let i = 0; i < phoneCount; i++) {
    const f = crowdSpots[Math.floor(Math.random() * crowdSpots.length)];
    phonePos.set([f.p.x, f.p.y + 0.95, f.p.z], i * 3);
  }
  const phoneGeo = new THREE.BufferGeometry();
  phoneGeo.setAttribute('position', new THREE.BufferAttribute(phonePos, 3));
  const phoneMat = new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 });
  scene.add(new THREE.Points(phoneGeo, phoneMat));

  // ---- floodlight towers with light shafts
  const glowTex = canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,244,214,0.8)');
    grad.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#fff1cf') } },
    vertexShader: 'varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vH; void main(){ gl_FragColor = vec4(uColor, 0.075 * pow(vH, 1.6)); }',
  });
  const towerMat = new THREE.MeshStandardMaterial({ color: '#2b3443', roughness: 0.7, metalness: 0.3 });
  for (const [tx, tz] of [[-34, GOAL_Z + 14], [34, GOAL_Z + 14], [-34, -24], [34, -24]]) {
    const h = 34;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, h, 10), towerMat);
    mast.position.set(tx, h / 2, tz);
    scene.add(mast);
    const head = new THREE.Group();
    head.position.set(tx, h + 1.6, tz);
    head.lookAt(0, 0, 4);
    scene.add(head);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.4), towerMat);
    head.add(panel);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), new THREE.MeshBasicMaterial({ color: '#fffaf0' }));
        lamp.position.set(-2.5 + c, -1.1 + r * 1.1, 0.21);
        head.add(lamp);
      }
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff4d6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(16, 12, 1);
    glow.position.set(0, 0, 0.8);
    head.add(glow);
    // the light shaft: an open cone from the lamps down to the pitch
    const len = Math.hypot(tx, h, tz - 4);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 11, len, 24, 1, true), shaftMat);
    shaft.geometry.translate(0, -len / 2, 0);
    shaft.geometry.rotateX(-Math.PI / 2);
    shaft.position.copy(head.position);
    shaft.lookAt(0, 0, 4);
    shaft.rotateX(Math.PI);
    scene.add(shaft);
  }

  // ---- LED ad boards around the goal end, scrolling
  // one seamless strip of words: the canvas is exactly as wide as the text
  const adWords = ['PENALTY KINGS', '\u2605', 'SHOOT', '\u00b7', 'SAVE', '\u00b7', 'SEND IT TO YOUR MATES', '\u2605', '100% FREE', '\u2605'];
  const adFont = '900 42px Arial Black, Arial, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = adFont;
  const adWidth = Math.ceil(adWords.reduce((sum, w) => sum + measure.measureText(w).width + 36, 0));
  const adTex = canvasTexture(adWidth, 64, (g, w, h) => {
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, w, h);
    g.font = adFont;
    g.textBaseline = 'middle';
    let x = 18;
    adWords.forEach((word, i) => {
      g.fillStyle = i === 0 || i === 8 ? '#ffcc33' : '#e8f1ff';
      g.fillText(word, x, h / 2 + 2);
      x += g.measureText(word).width + 36;
    });
  }, { repeat: [3, 1] });
  const adMat = new THREE.MeshBasicMaterial({ map: adTex, toneMapped: false });
  adMat.color.setScalar(0.85);
  const boards = [
    { x: 0, z: GOAL_Z + 5, w: 50, ry: Math.PI },
    { x: -26, z: -2, w: 26, ry: Math.PI / 2 },
    { x: 26, z: -2, w: 26, ry: -Math.PI / 2 },
  ];
  for (const b of boards) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.9, 0.12), [towerMat, towerMat, towerMat, towerMat, adMat, adMat]);
    m.position.set(b.x, 0.45, b.z);
    m.rotation.y = b.ry;
    scene.add(m);
  }

  // ---- the ball: modern panel design, drawn on a canvas
  const ballTex = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, w, h);
    const band = (y0, color, thick) => {
      g.strokeStyle = color;
      g.lineWidth = thick;
      g.beginPath();
      for (let x = 0; x <= w; x += 4) g.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 6) * 28);
      g.stroke();
    };
    band(h * 0.32, '#0f172a', 16);
    band(h * 0.36, '#ffcc33', 8);
    band(h * 0.68, '#0f172a', 16);
    band(h * 0.64, '#e11d48', 8);
    g.fillStyle = '#0f172a';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc((i + 0.5) * (w / 6), h / 2, 14, 0, Math.PI * 2);
      g.fill();
    }
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, metalness: 0.05 }));
  ball.castShadow = true;
  scene.add(ball);

  // glowing trail behind a moving ball
  const TRAIL = 26;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.PointsMaterial({ map: glowTex, color: '#ffe08a', size: 0.32, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  let trailHead = 0;

  // ---- confetti
  const CONFETTI = 260;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.05), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
  confetti.frustumCulled = false;
  const bits = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(0, -10, 0), v: new THREE.Vector3(), r: new THREE.Euler(), s: rand(2, 8) }));
  for (let i = 0; i < CONFETTI; i++) confetti.setColorAt(i, new THREE.Color('#ffffff'));
  scene.add(confetti);
  let confettiLife = 0;

  const targets = [];

  // ---- figures
  const keeper = new Figure(scene, { keeper: true, number: 1 });
  const shooter = new Figure(scene);

  // ---- post-processing: bloom for the floodlights
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- camera rig
  const views = {
    shoot: { pos: new THREE.Vector3(0, 1.7, -3.4), look: new THREE.Vector3(0, 1.25, GOAL_Z) },
    keep: { pos: new THREE.Vector3(0, 4.3, -7.2), look: new THREE.Vector3(0, 0.8, GOAL_Z) },
  };
  let view = 'shoot';
  let shake = 0;
  const camBase = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    const v = views[view];
    const dist = GOAL_Z - v.pos.z;
    const halfW = GOAL_HALF_WIDTH + 1.5;
    const vfov = 2 * Math.atan(Math.tan(Math.atan(halfW / dist)) / camera.aspect);
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 34, 80);
    camera.updateProjectionMatrix();
  }

  function setView(name) {
    view = name;
    camBase.copy(views[name].pos);
    camLook.copy(views[name].look);
    resize();
  }

  let clock = 0;
  function update(dt) {
    clock += dt;
    crowdUniforms.uTime.value = clock;
    crowdUniforms.uExcite.value = Math.max(0, crowdUniforms.uExcite.value - dt * 0.35);
    adTex.offset.x = (adTex.offset.x + dt * 0.03) % 1;
    for (const { g } of flags) g.rotation.z = g.userData.base + Math.sin(clock * (1.4 + crowdUniforms.uExcite.value * 5.0) + g.userData.phase) * (0.18 + crowdUniforms.uExcite.value * 0.25);
    phoneMat.opacity = 0.55 + 0.35 * Math.sin(clock * 3.1);

    // net spring
    if (Math.abs(netState.amp) > 1e-4 || Math.abs(netState.vel) > 1e-4) {
      netState.vel += (-60 * netState.amp - 6 * netState.vel) * dt;
      netState.amp += netState.vel * dt;
      const pos = netBack.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = backBase[i * 3];
        const y = backBase[i * 3 + 1] + backH / 2;
        const d2 = (x - W(netState.x)) ** 2 + (y - netState.y) ** 2;
        pos.setZ(i, backBase[i * 3 + 2] + netState.amp * Math.exp(-d2 / 0.6));
      }
      pos.needsUpdate = true;
    }

    // confetti
    if (confettiLife > 0) {
      confettiLife -= dt;
      bits.forEach((b, i) => {
        b.v.y -= 3.2 * dt;
        b.v.multiplyScalar(1 - 0.9 * dt);
        b.p.addScaledVector(b.v, dt);
        b.r.x += b.s * dt;
        b.r.y += b.s * 0.7 * dt;
        m4.compose(b.p, q.setFromEuler(b.r), sc.set(1, 1, 1));
        confetti.setMatrixAt(i, m4);
      });
      confetti.instanceMatrix.needsUpdate = true;
      confetti.visible = true;
    } else confetti.visible = false;

    targets.forEach((r, i) => { if (!r.userData.hit) r.scale.setScalar(1 + 0.05 * Math.sin(clock * 5 + i)); });
    // trail fades when the ball slows
    trailMat.opacity = Math.max(0, trailMat.opacity - dt * 1.2);

    // camera with a little life + shake
    shake = Math.max(0, shake - dt * 2.5);
    camera.position.copy(camBase);
    camera.position.y += Math.sin(clock * 0.7) * 0.015;
    if (shake > 0) camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(shake * 0.06));
    camera.lookAt(camLook);
  }

  return {
    renderer,
    scene,
    camera,
    ball,
    keeper,
    shooter,
    resize,
    setView,
    update,
    render: () => composer.render(),
    /** Ball position from physics state, rolling with its velocity. */
    setBall(p, v, spin, dt, moving) {
      ball.position.set(W(p.x), p.y, p.z);
      ball.rotation.x += v.z * dt * 6;
      ball.rotation.y += spin * dt * 0.6;
      if (moving && Math.hypot(v.x, v.y, v.z) > 8) {
        trailPos.set([W(p.x), p.y, p.z], trailHead * 3);
        trailHead = (trailHead + 1) % TRAIL;
        trailGeo.attributes.position.needsUpdate = true;
        trailMat.opacity = Math.min(0.85, 0.25 + Math.abs(spin) * 0.08);
      }
    },
    clearTrail() {
      trailPos.fill(0);
      trailPos.forEach((_, i) => { if (i % 3 === 2) trailPos[i] = -50; });
      trailGeo.attributes.position.needsUpdate = true;
      trailMat.opacity = 0;
    },
    netImpact(x, y, speed) {
      netState.x = x;
      netState.y = y;
      netState.vel += Math.min(14, speed * 0.55);
    },
    goalCelebration(colors) {
      crowdUniforms.uExcite.value = 1;
      shake = 1;
      confettiLife = 4;
      const c = new THREE.Color();
      bits.forEach((b, i) => {
        b.p.set(rand(-8, 8), rand(6, 12), GOAL_Z + rand(1, 8));
        b.v.set(rand(-2, 2), rand(-1, 2), rand(-3, 0.5));
        c.set(colors[i % colors.length]);
        confetti.setColorAt(i, c);
      });
      confetti.instanceColor.needsUpdate = true;
    },
    crowdReact(level) {
      crowdUniforms.uExcite.value = Math.max(crowdUniforms.uExcite.value, level);
    },
    shake(a) { shake = Math.max(shake, a); },
    /** Low camera beside the post for goal replays. side: -1 / 1 (physics x). */
    setReplayView(side) {
      views.replay = { pos: new THREE.Vector3(W(side * 5.5), 0.9, GOAL_Z - 4.2), look: new THREE.Vector3(W(side * -0.5), 1.2, GOAL_Z + 0.3) };
      setView('replay');
    },
    /** Glowing target rings on the goal mouth (physics coords, metres). */
    showTargets(list) {
      targets.forEach((t) => scene.remove(t));
      targets.length = 0;
      for (const z of list) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(z.r, 0.045, 10, 48),
          new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.95, toneMapped: false }),
        );
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(z.r, 40),
          new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }),
        );
        ring.add(disc);
        ring.position.set(W(z.x), z.y, GOAL_Z - 0.06);
        ring.userData = { name: z.name, hit: false };
        scene.add(ring);
        targets.push(ring);
      }
    },
    hitTarget(name) {
      const t = targets.find((r) => r.userData.name === name);
      if (!t || t.userData.hit) return;
      t.userData.hit = true;
      t.material.color.set('#22c55e');
      t.children[0].material.color.set('#22c55e');
      t.children[0].material.opacity = 0.35;
    },
    paintCrowd,
    /** Screen point -> physics point on the goal plane. */
    goalPointFromScreen(px, py) {
      const ndc = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -GOAL_Z), hit);
      return { x: -hit.x, y: hit.y };
    },
  };
}
