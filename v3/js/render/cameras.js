// Penalty Kings v3 — camera rig: named shots, smooth moves, a title orbit.
import * as THREE from 'three';
import { GOAL_Z } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;

/**
 * fov = preferred vertical field of view; hfov = the horizontal view the shot
 * must keep (so the whole goal stays on screen on a narrow portrait phone).
 */
export const SHOTS = {
  // behind and right of the striker: the whole run-up, the ball and the goal in one frame
  broadcast: { pos: V(1.15, 2.35, 6.6), look: V(-0.1, 2.0, GOAL_Z), fov: 34, hfov: 31 },
  striker: { pos: V(0.6, 1.72, 3.3), look: V(0, 2.6, GOAL_Z), fov: 46, hfov: 34 },
  keeper: { pos: V(0, 1.6, GOAL_Z - 1.7), look: V(0, 1.0, 0), fov: 52, hfov: 70 }, // inside the goal, in front of the back net
  side: { pos: V(10.5, 1.15, GOAL_Z + 5.2), look: V(-0.5, 1.2, GOAL_Z + 0.4), fov: 30, hfov: 34 },
  low: { pos: V(-5.4, 0.45, GOAL_Z + 6.5), look: V(0.6, 1.5, GOAL_Z), fov: 38, hfov: 46 },
  high: { pos: V(0, 30, 44), look: V(0, 0, GOAL_Z + 6), fov: 36, hfov: 60 },
};
export const SHOT_NAMES = [...Object.keys(SHOTS), 'orbit'];

export function createCameraRig(camera) {
  const pos = SHOTS.broadcast.pos.clone();
  const look = SHOTS.broadcast.look.clone();
  let fov = SHOTS.broadcast.fov;
  let shot = 'broadcast';
  let orbitT = 0;
  let shake = 0;
  const tp = V(0, 0, 0);
  const tl = V(0, 0, 0);
  const tmp = V(0, 0, 0);

  const fitFov = (s) => {
    const need = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(deg(s.hfov) / 2) / camera.aspect));
    return THREE.MathUtils.clamp(Math.max(s.fov, need), 20, 85);
  };

  return {
    get shot() { return shot; },
    set(name, cut = false) {
      shot = name;
      if (cut && name !== 'orbit') {
        pos.copy(SHOTS[name].pos);
        look.copy(SHOTS[name].look);
        fov = fitFov(SHOTS[name]);
      }
    },
    shake(a) { shake = Math.max(shake, a); },
    update(dt, t) {
      let target;
      if (shot === 'orbit') {
        orbitT += dt * 0.085;
        const r = 27;
        tp.set(Math.sin(orbitT) * r, 5.5 + Math.sin(orbitT * 0.7) * 2.2, GOAL_Z + 7 + Math.cos(orbitT) * r);
        tl.set(0, 1.6, GOAL_Z + 3);
        target = { fov: 40, hfov: 50 };
      } else {
        const s = SHOTS[shot];
        tp.copy(s.pos);
        tl.copy(s.look);
        target = s;
      }
      const k = 1 - Math.exp(-dt * (shot === 'orbit' ? 2.2 : 5.5));
      pos.lerp(tp, k);
      look.lerp(tl, k);
      fov += (fitFov(target) - fov) * k;
      camera.position.copy(pos);
      // a little handheld life, and shake on big moments
      camera.position.x += Math.sin(t * 0.63) * 0.012;
      camera.position.y += Math.sin(t * 0.47 + 1.3) * 0.01;
      if (shake > 0.001) {
        shake *= Math.exp(-dt * 6);
        tmp.set(Math.sin(t * 61), Math.sin(t * 53 + 2), 0).multiplyScalar(shake * 0.07);
        camera.position.add(tmp);
      }
      camera.lookAt(look);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
    refit() { fov = fitFov(shot === 'orbit' ? { fov: 40, hfov: 50 } : SHOTS[shot]); },
  };
}
