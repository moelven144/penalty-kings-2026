// Penalty Kings v3 — skinned players. The body is the CC0 Quaternius base
// character (see ASSETS.md); the kit is painted onto it in the shader from each
// nation's two colours (no crest, no maker's mark, no sponsor); the pose is
// solved every frame to the joint targets in game/choreo.js.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/addons/utils/SkeletonUtils.js';

const BASE = new URL('../../assets/characters/', import.meta.url).href;
const Y = new THREE.Vector3(0, 1, 0);
const q1 = new THREE.Quaternion(); const q2 = new THREE.Quaternion(); const q3 = new THREE.Quaternion();
const v1 = new THREE.Vector3(); const v2 = new THREE.Vector3(); const v3 = new THREE.Vector3(); const v4 = new THREE.Vector3();

/** Load the body and hair once. Resolves to templates that createPlayer() clones. */
export function loadCharacters() {
  const loader = new GLTFLoader();
  const load = (file) => new Promise((resolve, reject) => loader.load(BASE + file, resolve, undefined, reject));
  return Promise.all([load('Superhero_Male_FullBody.gltf'), load('hair/Hair_Buzzed.gltf'), load('hair/Hair_SimpleParted.gltf')])
    .then(([body, buzz, parted]) => ({ body: body.scene, hair: [hairGeometry(buzz.scene), hairGeometry(parted.scene)] }));
}
function hairGeometry(scene) {
  let found = null;
  scene.traverse((o) => { if (o.isMesh && !found) found = o; });
  return { geometry: found.geometry, material: found.material };
}

// Which part of the kit each joint's skin belongs to: 0 skin, 1 shirt, 2 shorts, 3 socks, 4 boots, 5 gloves/sleeves (keeper)
function kitPart(joint, y, keeper) {
  if (/^(spine|clavicle|upperarm)/.test(joint)) return 1;
  if (joint === 'pelvis') return 2;
  if (/^thigh/.test(joint)) return y > 0.6 ? 2 : 0;
  if (/^calf/.test(joint)) return y < 0.43 ? 3 : 0;
  if (/^(foot|ball)/.test(joint)) return 4;
  if (keeper && /^lowerarm/.test(joint)) return 1;
  if (keeper && /^(hand|index|middle|ring|pinky|thumb)/.test(joint)) return 5;
  return 0;
}

/** Per-vertex kit part, from the skin weights (the strongest joint decides). */
function kitAttribute(mesh, keeper) {
  const g = mesh.geometry;
  const si = g.attributes.skinIndex; const sw = g.attributes.skinWeight; const pos = g.attributes.position;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let best = 0; let bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    out[i] = kitPart(names[best], pos.getY(i), keeper);
  }
  return new THREE.BufferAttribute(out, 1);
}

const PATTERNS = { plain: 0, sash: 1, hoops: 2 };
/** One of three generic shirt templates, chosen by a hash of the country code. */
export function patternFor(code) {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ['plain', 'sash', 'hoops'][h % 3];
}

function kitMaterial(src, uniforms) {
  const m = src.clone();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKit;\nflat out float vKit;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKit = aKit;\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        flat in float vKit; varying vec3 vBind;
        uniform vec3 uShirt; uniform vec3 uShirt2; uniform vec3 uShorts; uniform vec3 uSocks; uniform vec3 uBoots; uniform vec3 uGloves; uniform vec3 uSkin; uniform float uPattern;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float shade = dot(diffuseColor.rgb, vec3(0.33)) * 1.6 + 0.25; // keep the body's painted shading under the cloth
        diffuseColor.rgb *= uSkin;
        float part = floor(vKit + 0.5);
        if (part == 1.0) {
          vec3 c = uShirt;
          if (uPattern > 1.5) c = mix(uShirt, uShirt2, step(0.5, fract(vBind.y * 7.0)));           // hoops
          else if (uPattern > 0.5) c = mix(uShirt, uShirt2, 1.0 - step(0.075, abs(vBind.x * 0.9 + (vBind.y - 1.25)))); // sash
          // collar and cuffs in the second colour
          c = mix(c, uShirt2, step(1.475, vBind.y) * step(abs(vBind.x), 0.12));
          diffuseColor.rgb = c * shade;
        } else if (part == 2.0) diffuseColor.rgb = uShorts * shade;
        else if (part == 3.0) diffuseColor.rgb = mix(uSocks, uShirt2, step(0.38, vBind.y)) * shade;
        else if (part == 4.0) diffuseColor.rgb = uBoots * shade;
        else if (part == 5.0) diffuseColor.rgb = uGloves * shade;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vKit > 0.5) roughnessFactor = 0.82;');
  };
  return m;
}

/**
 * A player: striker or keeper.
 * @returns {{group, setKit, solve, bones}}
 */
export function createPlayer(scene, assets, { keeper = false, hair = 0 } = {}) {
  const group = new THREE.Group();
  const model = cloneSkinned(assets.body);
  group.add(model);
  scene.add(group);

  const uniforms = {
    uShirt: { value: new THREE.Color('#c8102e') }, uShirt2: { value: new THREE.Color('#ffffff') },
    uShorts: { value: new THREE.Color('#ffffff') }, uSocks: { value: new THREE.Color('#c8102e') },
    uBoots: { value: new THREE.Color('#0d0f13') }, uGloves: { value: new THREE.Color('#f2f2f2') },
    uSkin: { value: new THREE.Color(1, 1, 1) }, uPattern: { value: 0 },
  };
  const bones = {};
  let bodyMesh = null;
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.castShadow = true; o.frustumCulled = false;
      if (/Superhero/.test(o.material.name)) {
        bodyMesh = o;
        o.geometry = o.geometry.clone();
        o.geometry.setAttribute('aKit', kitAttribute(o, keeper));
        o.material = kitMaterial(o.material, uniforms);
      } else if (/Hair/.test(o.material.name)) {
        o.material = o.material.clone(); // eyebrows
      }
    }
  });

  // rest pose (the model's T-pose), in the character's own space
  group.updateMatrixWorld(true);
  const rest = {};
  for (const [name, b] of Object.entries(bones)) {
    rest[name] = { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(new THREE.Vector3()), local: b.quaternion.clone(), lp: b.position.clone() };
  }
  const len = (a, b) => rest[a].p.distanceTo(rest[b].p);
  const L = { thigh: len('thigh_l', 'calf_l'), calf: len('calf_l', 'foot_l'), upper: len('upperarm_l', 'lowerarm_l'), fore: len('lowerarm_l', 'hand_l') };

  // hair: a rigid mesh on the head bone
  const hairSrc = assets.hair[hair % assets.hair.length];
  const hairMesh = new THREE.Mesh(hairSrc.geometry, hairSrc.material.clone());
  hairMesh.castShadow = true;
  {
    const inv = new THREE.Matrix4().compose(rest.Head.p, rest.Head.q, new THREE.Vector3(1, 1, 1)).invert();
    hairMesh.applyMatrix4(inv);
    bones.Head.add(hairMesh);
  }

  const gq = new THREE.Quaternion(); // the group's world rotation (yaw)
  /** Point a bone's length (+Y) along a world direction, keeping its rest twist; optional extra rotation first. */
  function aim(name, dir, pre = null) {
    const b = bones[name];
    q1.copy(gq).multiply(rest[name].q); // rest orientation, turned with the body
    if (pre) q1.premultiply(pre);
    v1.set(0, 1, 0).applyQuaternion(q1); // where the bone points at rest
    q2.setFromUnitVectors(v1, v2.copy(dir).normalize()).multiply(q1); // swing it onto the target
    b.parent.getWorldQuaternion(q3).invert();
    b.quaternion.copy(q3.multiply(q2));
    b.updateWorldMatrix(false, false);
  }
  /** Set a bone to its rest orientation turned by a world rotation. */
  function orient(name, worldRot) {
    const b = bones[name];
    q1.copy(gq).multiply(rest[name].q);
    if (worldRot) q1.premultiply(worldRot);
    b.parent.getWorldQuaternion(q3).invert();
    b.quaternion.copy(q3.multiply(q1));
    b.updateWorldMatrix(false, false);
  }
  const keep = (name) => { bones[name].quaternion.copy(rest[name].local); bones[name].updateWorldMatrix(false, false); };
  /** Two-bone chain: root joint `a` to target, bending towards `pole`. Returns nothing; sets both bones. */
  function limb(upper, lower, l1, l2, target, pole) {
    const root = bones[upper].getWorldPosition(v3);
    const d = v4.copy(target).sub(root);
    const dist = Math.min(d.length(), l1 + l2 - 0.002);
    d.normalize();
    const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const bend = v2.copy(pole).addScaledVector(d, -pole.dot(d));
    if (bend.lengthSq() < 1e-6) bend.set(0, 0, 1);
    bend.normalize();
    const joint = new THREE.Vector3().copy(root).addScaledVector(d, along).addScaledVector(bend, out);
    aim(upper, new THREE.Vector3().copy(joint).sub(root));
    const end = new THREE.Vector3().copy(root).addScaledVector(d, dist);
    aim(lower, end.sub(joint));
  }

  const yawQ = new THREE.Quaternion(); const twistQ = new THREE.Quaternion(); const tmpQ = new THREE.Quaternion();
  const fwd = new THREE.Vector3(); const pole = new THREE.Vector3(); const tgt = new THREE.Vector3(); const up = new THREE.Vector3();
  /**
   * Solve the skeleton to joint targets in world space (see game/choreo.js).
   */
  function solve(p) {
    // the body's heading
    group.position.set(0, 0, 0);
    group.rotation.set(0, Math.PI + (p.yaw || 0), 0); // the model faces +z; yaw 0 = facing the goal (-z)
    group.updateWorldMatrix(false, false);
    model.updateWorldMatrix(false, false);
    for (const n of ['root']) if (bones[n]) { bones[n].updateWorldMatrix(true, false); }
    gq.setFromAxisAngle(Y, Math.PI + (p.yaw || 0));
    fwd.set(0, 0, 1).applyQuaternion(gq); // the way the body faces

    // pelvis: position, lean along the torso direction, twist of the hips
    const pel = bones.pelvis;
    up.set(p.torso.x, p.torso.y, p.torso.z).normalize();
    pel.position.copy(pel.parent.worldToLocal(tgt.set(p.pelvis.x, p.pelvis.y, p.pelvis.z)));
    twistQ.setFromAxisAngle(Y, p.hipTwist || 0);
    // the pelvis bone's length runs up the spine in this rig
    aim('pelvis', up, twistQ);
    // spine follows the pelvis, turning back a little so the chest stays more square than the hips
    tmpQ.setFromAxisAngle(up, -(p.hipTwist || 0) * 0.5);
    for (const n of ['spine_01', 'spine_02', 'spine_03']) {
      if (!bones[n]) continue;
      const b = bones[n];
      b.quaternion.copy(rest[n].local);
      b.updateWorldMatrix(false, false);
    }
    for (const n of ['neck_01', 'Head', 'clavicle_l', 'clavicle_r']) keep(n);

    // legs: knees bend the way the body faces
    for (const s of ['l', 'r']) {
      const foot = s === 'l' ? p.footL : p.footR;
      pole.copy(fwd).multiplyScalar(1).addScaledVector(up, 0.25);
      limb(`thigh_${s}`, `calf_${s}`, L.thigh, L.calf, tgt.set(foot.x, foot.y, foot.z), pole);
      // feet: flat, pointing along their yaw; the toe drops when the leg is swung or stretched
      const fy = s === 'l' ? p.footYawL : p.footYawR;
      const toe = (s === 'l' ? p.toeL : p.toeR) || 0;
      yawQ.setFromAxisAngle(Y, Math.PI + (fy == null ? (p.yaw || 0) : fy)).multiply(tmpQ.setFromAxisAngle(v1.set(1, 0, 0), toe));
      const b = bones[`foot_${s}`];
      q1.copy(yawQ).multiply(rest[`foot_${s}`].q);
      b.parent.getWorldQuaternion(q3).invert();
      b.quaternion.copy(q3.multiply(q1));
      b.updateWorldMatrix(false, false);
    }
    // arms: elbows point down and back
    for (const s of ['l', 'r']) {
      const hand = s === 'l' ? p.handL : p.handR;
      bones[`clavicle_${s}`].updateWorldMatrix(false, false);
      pole.copy(fwd).multiplyScalar(-0.8).addScaledVector(up, -1).addScaledVector(v1.set(s === 'l' ? 1 : -1, 0, 0).applyQuaternion(gq), 0.5);
      limb(`upperarm_${s}`, `lowerarm_${s}`, L.upper, L.fore, tgt.set(hand.x, hand.y, hand.z), pole);
      keep(`hand_${s}`);
    }
  }

  return {
    group, bones, uniforms,
    /**
     * @param kit {shirt, shirt2, shorts, socks, pattern, gloves, skin}
     */
    setKit(kit) {
      uniforms.uShirt.value.set(kit.shirt);
      uniforms.uShirt2.value.set(kit.shirt2 || '#ffffff');
      uniforms.uShorts.value.set(kit.shorts || kit.shirt2 || '#ffffff');
      uniforms.uSocks.value.set(kit.socks || kit.shirt);
      uniforms.uPattern.value = PATTERNS[kit.pattern] || 0;
      if (kit.gloves) uniforms.uGloves.value.set(kit.gloves);
      const t = kit.skin == null ? 1 : kit.skin; // 1 = as painted, lower = darker
      uniforms.uSkin.value.setRGB(t, t * (0.92 + 0.08 * t), t * (0.86 + 0.14 * t));
      hairMesh.material.color.setScalar(kit.hairTone == null ? 0.35 : kit.hairTone);
    },
    solve,
    set visible(vis) { group.visible = vis; },
    get visible() { return group.visible; },
  };
}
