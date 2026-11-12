// Penalty Kings v3 — the stadium: an invented two-tier bowl with a cantilever
// roof, roof-edge lighting, four corner floodlight rigs and LED boards.
// Everything is modelled in code; surfaces use CC0 concrete maps (see ASSETS.md).
import * as THREE from 'three';
import { ringPoint, RING_LENGTH, STAND, PITCH_CZ, GOAL_Z, standPoint } from './layout.js';
import { loadTexture, canvasTexture, glowTexture, ledTexture } from './textures.js';

const SEG = 144; // segments around the ring

/** Sweep a cross-section polyline around the ring into one mesh. */
function sweep(profile, material, { uvScale = 6, flip = false, fixed = false } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const P = profile.length;
  let acc = 0;
  const vs = profile.map((p, i) => {
    if (i) acc += Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1]);
    return acc / uvScale;
  });
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    for (let j = 0; j < P; j++) {
      const sp = fixed ? { d: profile[j][0], y: profile[j][1] } : standPoint(t, profile[j][0], profile[j][1]);
      const p = ringPoint(t, sp.d);
      pos.push(p.x, sp.y, p.z);
      uv.push((t * RING_LENGTH) / uvScale, vs[j]);
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j;
      const b = a + P;
      if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

export function createStadium(scene, tier) {
  const group = new THREE.Group();
  scene.add(group);
  const aniso = tier.anisotropy;

  // ---- sky: gradient dome with a faint horizon glow, plus stars
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.2, 1.0);
          vec3 zenith = vec3(0.004, 0.009, 0.03);
          vec3 mid = vec3(0.012, 0.03, 0.085);
          vec3 haze = vec3(0.07, 0.10, 0.19);
          vec3 c = mix(haze, mid, smoothstep(0.0, 0.2, h));
          c = mix(c, zenith, smoothstep(0.2, 0.8, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  sky.userData.tag = 'sky';
  group.add(sky);
  {
    const n = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = 0.3 + Math.random() * 1.2;
      p.set([Math.cos(th) * Math.cos(ph) * 560, Math.sin(ph) * 560, Math.sin(th) * Math.cos(ph) * 560], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.8, 2.4), size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7, depthWrite: false })));
  }

  // ---- materials
  const concrete = new THREE.MeshStandardMaterial({
    map: loadTexture('concrete_diff.jpg', { srgb: true, anisotropy: aniso }),
    normalMap: loadTexture('concrete_normal.jpg', { anisotropy: aniso }),
    roughnessMap: loadTexture('concrete_rough.jpg', { anisotropy: aniso }),
    color: '#8d949e', roughness: 1, side: THREE.DoubleSide,
  });
  const seatTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#0d1524'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2942';
    for (let x = 4; x < w; x += 16) g.fillRect(x, 10, 10, 34); // seat backs
    g.fillStyle = '#060a12'; g.fillRect(0, 50, w, 14); // step shadow
  }, { repeat: [1, 1], anisotropy: aniso });
  seatTex.wrapS = seatTex.wrapT = THREE.RepeatWrapping;
  const seats = new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.85, side: THREE.DoubleSide });
  const roofTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#141a24'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a3445'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, h); g.stroke(); // trusses run inward
    g.strokeStyle = '#1e2634'; g.lineWidth = 2;
    for (let y = 16; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, { repeat: [1, 1], anisotropy: aniso });
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
  const roofUnder = new THREE.MeshStandardMaterial({ map: roofTex, emissiveMap: roofTex, emissive: new THREE.Color(0.2, 0.23, 0.3), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: '#0b0f17', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide });

  // ---- the bowl
  const add = (m, shadows = false) => { m.receiveShadow = shadows; m.castShadow = false; group.add(m); return m; };
  add(sweep(STAND.frontWall, concrete, { uvScale: 5 }));
  add(sweep(STAND.lowerTier, seats, { uvScale: 0.85 }));
  add(sweep(STAND.midWall, concrete, { uvScale: 5 }));
  add(sweep(STAND.upperTier, seats, { uvScale: 0.85 }));
  add(sweep(STAND.backWall, dark, { uvScale: 8 }));
  add(sweep(STAND.roofUnder, roofUnder, { uvScale: 6 }));
  add(sweep(STAND.roofFascia, new THREE.MeshStandardMaterial({ color: '#2a3344', emissive: new THREE.Color(0.02, 0.025, 0.035), roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }), { uvScale: 8 }));
  add(sweep(STAND.roofTop, dark, { uvScale: 8 }));

  // ---- roof-edge floodlights: a continuous run of lamps under the inner edge
  const lampCount = 220;
  const lampGeo = new THREE.BoxGeometry(0.7, 0.2, 0.45);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3.25, 2.95) }); // HDR: blooms, without merging into one white bar
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < lampCount; i++) {
    const lt = (i + 0.5) / lampCount;
    const p = ringPoint(lt, STAND.roofFascia[0][0] + 0.6);
    q.setFromEuler(new THREE.Euler(0.5, Math.atan2(p.nx, p.nz), 0, 'YXZ'));
    m4.compose(v.set(p.x, standPoint(lt, 4.6, 30.0).y, p.z), q, one);
    lamps.setMatrixAt(i, m4);
  }
  lamps.userData.tag = 'lamps';
  group.add(lamps);

  // ---- four corner floodlight rigs above the roof, with glow and light shafts
  const glowTex = glowTexture();
  const mastMat = new THREE.MeshStandardMaterial({ color: '#1b212c', roughness: 0.6, metalness: 0.6 });
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.95, 0.84) } },
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0001, 1.0), 1.5); gl_FragColor = vec4(uColor * 0.022 * pow(clamp(vH, 0.0001, 1.0), 1.6) * rim, 1.0); }',
  });
  const rigs = [];
  for (const t of [0.105, 0.395, 0.605, 0.895]) {
    const p = ringPoint(t, 33);
    const H = 52;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, H, 10), mastMat);
    mast.position.set(p.x, H / 2, p.z);
    group.add(mast);
    const head = new THREE.Group();
    head.position.set(p.x, H + 2.5, p.z);
    head.lookAt(0, 0, PITCH_CZ * 0.35);
    group.add(head);
    head.add(new THREE.Mesh(new THREE.BoxGeometry(9, 5.6, 0.5), mastMat));
    const bulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.6, 7.5) }), 40);
    let k = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      m4.makeTranslation(-3.85 + c * 1.1, -2.2 + r * 1.1, 0.27);
      bulbs.setMatrixAt(k++, m4);
    }
    head.add(bulbs);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.3, 1.2, 1.0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.set(34, 26, 1);
    glow.position.set(0, 0, 1.2);
    glow.userData.tag = 'glow';
    head.add(glow);
    const len = Math.hypot(p.x, H, p.z - PITCH_CZ * 0.35);
    const shaftGeo = new THREE.CylinderGeometry(2.6, 20, len, 28, 1, true);
    shaftGeo.translate(0, -len / 2, 0);
    shaftGeo.rotateX(-Math.PI / 2);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.copy(head.position);
    shaft.lookAt(0, 0, PITCH_CZ * 0.35);
    shaft.rotateX(Math.PI);
    shaft.renderOrder = 5;
    shaft.userData.tag = 'shafts';
    group.add(shaft);
    rigs.push(head);
  }

  // ---- LED boards: one ring around the pitch, our own branding, scrolling
  const led = ledTexture();
  const ledAspect = led.image.width / led.image.height;
  const boardH = 0.95;
  const ledMat = new THREE.MeshBasicMaterial({ map: led, color: new THREE.Color(2.0, 2.0, 2.0), side: THREE.DoubleSide });
  const board = sweep([[STAND.ledD, 0.02], [STAND.ledD, 0.02 + boardH]], ledMat, { fixed: true });
  {
    // a whole number of repeats around the ring (no seam), v 0..1 over the height
    const reps = Math.round(RING_LENGTH / (boardH * ledAspect));
    const uv = board.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.floor(i / 2) / SEG) * reps, i % 2);
    uv.needsUpdate = true;
  }
  board.userData.tag = 'led';
  group.add(board);
  const boardBack = sweep([[STAND.ledD + 0.12, 0], [STAND.ledD + 0.12, boardH + 0.05]], dark, { uvScale: 8, fixed: true });
  group.add(boardBack);

  // ---- lights that actually illuminate the penalty area
  scene.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.68, 1.0), new THREE.Color(0.06, 0.12, 0.06), 0.28));
  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.96, 0.88), 2.6);
  key.position.set(-20, 36, 14);
  key.target.position.set(0, 0, -6);
  key.castShadow = true;
  key.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 12, bottom: -12, near: 10, far: 80 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 2.5;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0.86, 0.92, 1.0), 0.9);
  fill.position.set(24, 30, 22);
  fill.target.position.set(0, 0, -6);
  scene.add(fill, fill.target);
  const rim = new THREE.DirectionalLight(new THREE.Color(1.0, 0.97, 0.9), 1.1);
  rim.position.set(12, 28, -46);
  rim.target.position.set(0, 1, -6);
  scene.add(rim, rim.target);

  scene.fog = new THREE.FogExp2(new THREE.Color(0.012, 0.022, 0.05), 0.0026);

  return {
    group,
    update(dt) {
      led.offset.x = (led.offset.x + dt * 0.012) % 1;
    },
    /** Bake the lit stadium into the scene's reflection/ambient environment. */
    bakeEnvironment(renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const prevFog = scene.fog;
      scene.fog = null;
      const rt = pmrem.fromScene(scene, 0.03, 0.5, 700, { size: tier.envSize, position: new THREE.Vector3(0, 1.5, GOAL_Z + 5) });
      scene.fog = prevFog;
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.35;
      pmrem.dispose();
    },
  };
}
