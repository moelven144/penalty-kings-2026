// Penalty Kings v3 — milestone (b): the shooting loop. Touch the ball, the
// striker runs up, swipe at the goal, release on the plant. The ball then
// flies under core/ball.js; the net, crowd, camera and haptics react to what
// actually happens to it.
import * as THREE from 'three';
import { GOAL_Z, BALL_R } from '../render/layout.js';
import { RULES, canStart, readSwipe } from '../core/gesture.js';
import { launchFor, standingKeeper, SHOT_TYPES } from '../core/shot.js';
import { newBall, stepBall, ballDone, simulate, STEP } from '../core/ball.js';
import { hashSeed } from '../core/rng.js';
import { createShootInput } from './input.js';
import { haptics } from './haptics.js';

const GRADE_TEXT = { perfect: 'PERFECT STRIKE', clean: 'Clean', rushed: 'Rushed', scuffed: 'Scuffed' };
const RESULT_TEXT = {
  goal: { clean: 'GOAL', 'in-off-post': 'GOAL · in off the post', 'in-off-bar': 'GOAL · in off the bar' },
  post: { post: 'POST', bar: 'BAR' },
  miss: { over: 'OVER', wide: 'WIDE', short: 'SHORT' },
  save: { body: 'SAVED', hands: 'SAVED', legs: 'SAVED', head: 'SAVED' },
};

/**
 * @param w {{canvas, scene, camera, rig, gfx, ball, crowd, net, striker, keeperMesh, hud}}
 *   hud: {result(text, kind), detail(text), hint(text)}
 */
export function createShooting(w) {
  const { canvas, scene, camera, rig, ball, crowd, net, striker, keeperMesh, hud } = w;
  const session = (Date.now() & 0xffffff) >>> 0;
  let kickNo = 0;
  let state = 'idle'; // idle | runup | flight | result
  let t0 = 0; // touch timestamp (ms, performance clock)
  let shot = null; // read swipe, waiting for the strike
  let strikeAt = 0; // seconds after the touch
  let sim = null; // live ball state
  let simClock = 0;
  let outcome = null;
  let seenEvents = 0;
  let resultT = 0;
  let keeperOn = false;
  let aidOn = true;
  const keeper = standingKeeper();
  const stats = { shots: 0, goals: 0 };

  // ---- screen <-> goal plane (rule 3)
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  /** A screen point in screen heights -> metres on the goal plane (x from centre, y from the ground). */
  function project(x, y) {
    ndc.set((x * window.innerHeight / window.innerWidth) * 2 - 1, -(y * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const d = ray.ray.direction; const o = ray.ray.origin;
    if (d.z > -1e-4) return { x: d.x * 1e3, y: 50 }; // pointing away from the goal: nowhere near it
    const k = (GOAL_Z - o.z) / d.z;
    return { x: o.x + d.x * k, y: o.y + d.y * k };
  }
  /** Where the ball is on screen, in screen heights. */
  function ballOnScreen() {
    tmp.set(0, BALL_R, 0).project(camera);
    return { x: ((tmp.x + 1) / 2) * (window.innerWidth / window.innerHeight), y: (1 - tmp.y) / 2 };
  }

  // ---- aids: the timing ring round the ball and the aim marker on the goal plane
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.1), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.visible = false;
  const ringGoal = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.215, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.2, 1.2), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  ringGoal.rotation.x = -Math.PI / 2; ringGoal.position.y = 0.011; ringGoal.visible = false;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.0), transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  marker.visible = false; marker.renderOrder = 20;
  scene.add(ring, ringGoal, marker);

  const input = createShootInput(canvas, {
    canStart: (p) => state === 'idle' && canStart(p, ballOnScreen()),
    onStart(p, timeStamp) {
      state = 'runup'; t0 = timeStamp; shot = null;
      haptics.play('runup');
      hud.result('', ''); hud.detail(''); hud.hint('Swipe at the goal · let go as the foot plants');
      ring.visible = ringGoal.visible = aidOn;
    },
    onMove(samples) {
      if (!aidOn || samples.length < 2) return;
      const last = samples[samples.length - 1];
      const a = project(last.x, last.y);
      marker.position.set(a.x, Math.max(0.05, a.y), GOAL_Z + 0.02);
      marker.visible = Math.abs(a.x) < 12 && a.y < 8;
    },
    onEnd(samples) {
      marker.visible = false;
      if (state !== 'runup') return;
      const seed = hashSeed(`${session}:${kickNo}`);
      shot = readSwipe(samples, project, seed);
      if (!shot) { cancel('Touch the ball, then swipe towards the goal'); return; }
      if (shot.timing.offset > RULES.lateLimit) { cancel('Too late: the striker pulled out. Touch the ball to go again'); return; }
      strikeAt = shot.timing.strikeT + 0.07; // the leg swings through after the release
    },
    onCancel() { marker.visible = false; cancel(''); },
  });

  function cancel(hint) {
    state = 'idle'; shot = null; input.cancel();
    ring.visible = ringGoal.visible = false;
    striker.reset();
    hud.hint(hint || 'Touch the ball to start the run-up');
  }

  function strike() {
    const launch = launchFor(shot);
    const obstacles = keeperOn ? keeper : null;
    outcome = simulate(launch, obstacles); // decided here, by physics; the flight below replays the same steps
    sim = newBall(launch);
    simClock = 0; seenEvents = 0; kickNo++;
    state = 'flight';
    ring.visible = ringGoal.visible = false;
    const g = shot.timing.grade;
    haptics.play(g === 'perfect' ? 'perfect' : g === 'clean' ? 'strike' : 'mishit');
    const ms = Math.round(shot.timing.offset * 1000);
    hud.result(GRADE_TEXT[g], g);
    hud.detail(`${SHOT_TYPES[shot.type].label} · ${Math.round(launch.speed * 3.6)} km/h · released ${ms >= 0 ? '+' : ''}${ms} ms`);
    hud.hint('');
    if (g === 'perfect') rig.shake(0.25);
  }

  function onEvent(e) {
    if (e.type === 'post' || e.type === 'bar') { haptics.play('post'); rig.shake(Math.min(1, e.speed / 25)); net.wake(); }
    else if (e.type === 'goal') { haptics.play('goal'); crowd.react(1, 0.1); rig.shake(0.8); }
    else if (e.type === 'out') crowd.react(0.15, 0.7);
    else if (keeper.some((k) => k.name === e.type)) { haptics.play('save'); crowd.react(0.2, 0.9); rig.shake(0.4); }
  }

  function finish() {
    state = 'result'; resultT = 0;
    stats.shots++; if (outcome.outcome === 'goal') stats.goals++;
    const text = (RESULT_TEXT[outcome.outcome] || {})[outcome.reason] || outcome.outcome.toUpperCase();
    hud.result(text, outcome.outcome);
    hud.detail(`${hud.lastDetail()} · ${stats.goals}/${stats.shots} scored`);
  }

  const spinAxis = new THREE.Vector3();
  return {
    get state() { return state; },
    get input() { return input; },
    get keeperOn() { return keeperOn; },
    set keeperOn(v) { keeperOn = !!v; keeperMesh.visible = keeperOn; },
    get aidOn() { return aidOn; },
    set aidOn(v) { aidOn = !!v; },
    project, ballOnScreen,
    /** For automatic test runs: play a recorded swipe as if a finger had made it. */
    autoShoot(samples) {
      if (state !== 'idle') return false;
      state = 'runup'; t0 = performance.now();
      const seed = hashSeed(`${session}:${kickNo}`);
      shot = readSwipe(samples, project, seed);
      if (!shot) { cancel(''); return false; }
      strikeAt = shot.timing.strikeT + 0.07;
      return true;
    },
    get lastShot() { return shot; },
    get sim() { return sim; },
    get lastOutcome() { return outcome; },
    /** @param now performance clock in ms, dt in seconds */
    update(now, dt) {
      if (state === 'runup') {
        const t = (now - t0) / 1000;
        striker.pose(t, shot ? strikeAt : null);
        const k = Math.min(1, t / RULES.runUp);
        const r = 1 - 0.8 * k; // the ring closes onto the ball exactly at the plant
        ring.scale.setScalar(r);
        const inWindow = Math.abs(t - RULES.runUp) <= RULES.perfect;
        ring.material.color.setRGB(inWindow ? 0.6 : 1.6, inWindow ? 2.4 : 1.5, inWindow ? 0.8 : 1.1);
        ring.material.opacity = t > RULES.runUp + RULES.clean ? 0.3 : 0.8;
        if (shot && t >= strikeAt) strike();
        else if (!shot && t > RULES.runUp + RULES.lateLimit) cancel('Too late: the striker pulled out. Touch the ball to go again');
      } else if (state === 'flight') {
        striker.pose((now - t0) / 1000, strikeAt);
        simClock += dt;
        while (simClock >= STEP && !ballDone(sim)) { stepBall(sim, keeperOn ? keeper : null); simClock -= STEP; }
        for (; seenEvents < sim.events.length; seenEvents++) onEvent(sim.events[seenEvents]);
        ball.position.set(sim.p.x, sim.p.y, -sim.p.z);
        // roll and spin: turn the ball about the axis its motion and spin give it
        const sp = Math.hypot(sim.v.x, sim.v.z);
        spinAxis.set(-sim.v.z, sim.sideSpin * 0.02, -sim.v.x);
        if (spinAxis.lengthSq() > 1e-6) ball.rotateOnWorldAxis(spinAxis.normalize(), (sp / BALL_R) * dt * 0.35 + Math.abs(sim.topSpin) * dt * 0.2);
        // show the result once the ball has settled, or 1.5 s after the moment that decided it
        const deciding = sim.events.find((e) => e.type === 'goal' || e.type === 'out' || e.type === 'post' || e.type === 'bar' || keeper.some((k) => k.name === e.type));
        if (ballDone(sim) || sim.t > 4.5 || (deciding && sim.t > deciding.t + 1.5)) finish();
      } else if (state === 'result') {
        resultT += dt;
        if (sim && !ballDone(sim)) {
          simClock += dt;
          while (simClock >= STEP && !ballDone(sim)) { stepBall(sim, keeperOn ? keeper : null); simClock -= STEP; }
          ball.position.set(sim.p.x, sim.p.y, -sim.p.z);
        }
        if (resultT > 1.4) {
          ball.position.set(0, BALL_R, 0);
          sim = null; striker.reset(); state = 'idle';
          hud.hint('Touch the ball to start the run-up');
        }
      }
      net.update(dt, sim ? ball.position : null, !!(sim && sim.inGoal));
    },
  };
}
