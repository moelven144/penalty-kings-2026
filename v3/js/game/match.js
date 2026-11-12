// Penalty Kings v3 — one kick, start to finish, with a person or the computer
// on either side. The app (game/app.js) decides who shoots and what the kick
// counts for; this file runs the run-up, the strike, the flight and the dive,
// and reports what really happened to the ball.
import * as THREE from 'three';
import { GOAL_Z, BALL_R } from '../render/layout.js';
import { RULES, canStart, readSwipe } from '../core/gesture.js';
import { launchFor, SHOT_TYPES } from '../core/shot.js';
import { newBall, stepBall, ballDone, classify, STEP, SPOT_DISTANCE, GOAL_HALF_WIDTH, GOAL_HEIGHT, BALL_RADIUS, OBSTACLE_PARTS } from '../core/ball.js';
import { KEEPER, playerDive, stayPut, keeperBody } from '../core/save.js';
import { strikerPlan, strikerReact, strikerShot, keeperDive, keeperCrossing, firstCommit } from '../core/ai.js';
import { strikerPose, idlePose, celebratePose, dejectedPose, keeperPose, SWING } from './choreo.js';
import { createShootInput } from './input.js';
import { haptics } from './haptics.js';

const NO_DIVE = { moves: [], boost: 1, grade: 'none' };
const STRIKER_HOME = { x: -1.55, z: 2.75 };

/**
 * @param w {{canvas, scene, camera, rig, ball, crowd, net, striker, keeper, sfx, onHint(text), reducedMotion}}
 */
export function createMatch(w) {
  const { canvas, scene, camera, rig, ball, crowd, net, striker, keeper, sfx } = w;
  let state = 'idle'; // idle | aim | runup | flight | after | replay
  let k = null; // the kick in progress
  let last = null; // the last finished kick, for the replay
  let clock = 0;
  let aidOn = true;

  // ---- screen <-> goal plane
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  /** A screen point in screen heights -> metres on the goal plane (x from the centre, y from the ground). */
  function project(x, y) {
    ndc.set((x * window.innerHeight / window.innerWidth) * 2 - 1, -(y * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const d = ray.ray.direction; const o = ray.ray.origin;
    if (d.z > -1e-4) return { x: d.x * 1e3, y: 50 };
    const s = (GOAL_Z - o.z) / d.z;
    return { x: o.x + d.x * s, y: o.y + d.y * s };
  }
  function ballOnScreen() {
    tmp.set(0, BALL_R, 0).project(camera);
    return { x: ((tmp.x + 1) / 2) * (window.innerWidth / window.innerHeight), y: (1 - tmp.y) / 2 };
  }

  // ---- aids and markers
  const basic = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, ...extra });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), basic(new THREE.Color(1.6, 1.5, 1.1), 0.8));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.visible = false;
  const ringGoal = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.215, 48), basic(new THREE.Color(1.2, 1.2, 1.2), 0.55));
  ringGoal.rotation.x = -Math.PI / 2; ringGoal.position.y = 0.011; ringGoal.visible = false;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), basic(new THREE.Color(1.5, 1.4, 1.0), 0.6, { depthTest: false }));
  marker.visible = false; marker.renderOrder = 20;
  scene.add(ring, ringGoal, marker);
  const targets = new THREE.Group(); // Road to Glory target zones on the goal plane
  scene.add(targets);

  const input = createShootInput(canvas, {
    canStart: (p) => {
      if (!k) return false;
      if (state === 'aim') return canStart(p, ballOnScreen());
      return k.keeperHuman && !k.dived && (state === 'runup' || state === 'flight');
    },
    onStart(p, timeStamp) {
      if (w.onTouch) w.onTouch();
      if (state !== 'aim') return; // a keeper's swipe: nothing happens until it is released
      state = 'runup'; k.t0 = timeStamp;
      haptics.play('runup');
      w.onHint('Swipe at the goal · let go as the foot plants');
      ring.visible = ringGoal.visible = aidOn;
    },
    onMove(samples) {
      if (!k || k.keeperHuman || !aidOn || samples.length < 2) return;
      const p = samples[samples.length - 1];
      const a = project(p.x, p.y);
      marker.position.set(a.x, Math.max(0.05, a.y), GOAL_Z + 0.02);
      marker.visible = Math.abs(a.x) < 12 && a.y < 8;
    },
    onEnd(samples, endStamp) {
      marker.visible = false;
      if (!k) return;
      if (k.keeperHuman) { playerSwipe(samples, endStamp); return; }
      if (state !== 'runup' || k.shot) return;
      const shot = readSwipe(samples, project, k.seed);
      if (!shot) { cancelRun('Touch the ball, then swipe towards the goal'); return; }
      if (shot.timing.offset > RULES.lateLimit) { cancelRun('Too late: the striker pulled out. Touch the ball to go again'); return; }
      k.shot = shot;
      k.side = Math.abs(shot.target.x) < 0.5 ? 0 : Math.sign(shot.target.x);
      k.strikeAt = shot.timing.strikeT + SWING;
    },
    onCancel() { marker.visible = false; if (state === 'runup' && k && k.shooterHuman && !k.shot) cancelRun(''); },
  });

  function cancelRun(hint) {
    state = 'aim'; input.cancel();
    ring.visible = ringGoal.visible = false;
    poseStriker(0, null);
    w.onHint(hint || 'Touch the ball to start the run-up');
  }

  /** The player in goal: the swipe's direction and length, on the goal plane, from where the keeper stands. */
  function playerSwipe(samples, endStamp) {
    if (k.dived || samples.length < 2) return;
    const a = samples[0]; const b = samples[samples.length - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.03) return; // a tap is not a dive
    const pa = project(a.x, a.y); const pb = project(b.x, b.y);
    const target = { x: KEEPER.ready.x + (pb.x - pa.x), y: KEEPER.ready.y + (pb.y - pa.y) };
    const rel = (endStamp - k.t0) / 1000 - k.strikeAt; // seconds relative to the strike
    k.dive = playerDive(target, rel);
    k.dived = true;
    // going early against a striker who can read it: he switches side
    if (state === 'runup' && k.plan) {
      const p2 = strikerReact(k.plan, rel, target.x);
      if (p2 !== k.plan) { k.plan = p2; k.side = p2.side; k.switched = true; }
    }
    if (k.dive.grade === 'perfect') haptics.play('perfect'); else haptics.play('runup');
  }

  const cues = () => ({ approach: k.approach, side: k.side, hipsFrom: k.hipsFrom });
  function poseStriker(t, strikeT) { striker.solve(strikerPose(t, strikeT, k ? cues() : {})); }

  function strike() {
    const shot = k.shooterHuman ? k.shot : (k.fixedShot || strikerShot(k.plan));
    k.shotUsed = shot;
    k.launch = launchFor(shot);
    k.crossAtKeeper = keeperCrossing(k.launch);
    if (k.keeperMode === 'cpu') {
      // the computer keeper: reads what the striker showed, judges the ball only after its reaction time
      const seen = k.plan || { cues: { approach: k.approach }, side: k.side || 1, traits: { hipsLead: 0.15 } };
      const dive = keeperDive(k.keeperSkill, seen, k.crossAtKeeper, k.rng);
      // it cannot have moved before the run-up let it: an early commit starts no sooner than the release
      const earliest = k.shooterHuman ? -(k.strikeAt - Math.min(k.strikeAt, k.shot.timing.offset + RULES.runUp)) - 0.02 : -9;
      for (const m of dive.moves) if (m.at < earliest) m.at = earliest;
      k.dive = k.alwaysDives ? { moves: [{ at: -0.05, x: k.rng.sign() * k.rng.range(1.8, 2.8), y: k.rng.range(0.4, 1.4) }], boost: 1, grade: 'cpu' } : dive;
    }
    k.sim = newBall(k.launch);
    k.simClock = 0; k.seen = 0; k.track = []; k.crossing = null;
    state = 'flight';
    ring.visible = ringGoal.visible = false;
    sfx.kick(shot.power); sfx.hush();
    if (k.shooterHuman) {
      const g = shot.timing.grade;
      haptics.play(g === 'perfect' ? 'perfect' : g === 'clean' ? 'strike' : 'mishit');
      if (g === 'perfect') rig.shake(0.25);
      if (w.onStrike) w.onStrike({ grade: g, type: shot.type, kmh: Math.round(k.launch.speed * 3.6), offsetMs: Math.round(shot.timing.offset * 1000) });
    } else haptics.play('strike');
  }

  const obstacles = (t) => (k.keeperMode === 'none' ? [] : keeperBody(k.dive || NO_DIVE, t).capsules);

  function onEvent(e) {
    if (e.type === 'post' || e.type === 'bar') { haptics.play('post'); sfx.post(); rig.shake(Math.min(1, e.speed / 25)); net.wake(); }
    else if (e.type === 'net') sfx.net();
    else if (e.type === 'goal') { rig.shake(0.8); }
    else if (OBSTACLE_PARTS.includes(e.type)) { sfx.glove(); haptics.play('save'); rig.shake(0.4); }
  }

  function decide() {
    const res = classify(k.sim, k.crossing);
    const shot = k.shotUsed;
    k.result = {
      ...res,
      crossing: k.crossing || { x: k.sim.p.x, y: k.sim.p.y, t: k.sim.t },
      shot, launch: k.launch, shooterHuman: k.shooterHuman, keeperHuman: k.keeperHuman,
      diveGrade: k.dive ? k.dive.grade : 'none', switched: !!k.switched,
      // the kick in the shape the v2 rules, styles and levels use
      kick: {
        aimX: shot.target.x / (GOAL_HALF_WIDTH - BALL_RADIUS), aimY: (shot.target.y - BALL_RADIUS) / (GOAL_HEIGHT - 2 * BALL_RADIUS),
        power: shot.power, curve: shot.curve, type: shot.type,
      },
    };
    const scored = res.outcome === 'goal';
    // the end behind the goal is the shooter's own supporters
    if (scored) { crowd.react(1, 0.1); sfx.roar(); haptics.play('goal'); }
    else if (res.outcome === 'save') { crowd.react(0.25, 1); sfx.roar(); }
    else { crowd.react(0.1, 0.7); sfx.groan(); }
    state = 'after'; k.afterT = 0;
    last = k;
    const done = k.onDone; k.onDone = null;
    if (done) done(k.result);
  }

  function stepFlight(dt) {
    const s = k.sim;
    k.simClock += dt;
    while (k.simClock >= STEP && !ballDone(s)) {
      const pz = s.p.z;
      stepBall(s, obstacles);
      k.simClock -= STEP;
      if (!k.crossing && pz < SPOT_DISTANCE && s.p.z >= SPOT_DISTANCE) k.crossing = { x: s.p.x, y: s.p.y, t: s.t };
      // a keeper who has not moved puts his hands to a ball that comes near him
      if (k.keeperHuman && !k.dived && !k.reflexed && s.t >= KEEPER.reflex) { k.reflexed = true; k.dive = stayPut(k.crossAtKeeper); }
    }
    for (; k.seen < s.events.length; k.seen++) onEvent(s.events[k.seen]);
    ball.position.set(s.p.x, s.p.y, -s.p.z);
    const sp = Math.hypot(s.v.x, s.v.z);
    tmp.set(-s.v.z, s.sideSpin * 0.02, -s.v.x);
    if (tmp.lengthSq() > 1e-6) ball.rotateOnWorldAxis(tmp.normalize(), (sp / BALL_R) * dt * 0.35 + Math.abs(s.topSpin) * dt * 0.2);
    if (k.track.length < 900) k.track.push({ t: s.t, x: s.p.x, y: s.p.y, z: s.p.z });
  }

  function poseKeeper(t) {
    if (k.keeperMode === 'none') return;
    keeper.solve(keeperPose(k.dive || NO_DIVE, t, clock));
  }

  return {
    get state() { return state; },
    get input() { return input; },
    get kick() { return k; },
    get lastKick() { return last; },
    set aidOn(v) { aidOn = !!v; },
    get aidOn() { return aidOn; },
    project, ballOnScreen,

    /**
     * Start a kick.
     * @param o {{shooterHuman, keeperMode:'cpu'|'human'|'none', strikerSkill, keeperSkill, rng, seed,
     *   fixedShot?, alwaysDives?, delay?}} fixedShot = a recorded kick (a friend's challenge)
     * @param onDone called once with the result when the kick is decided
     */
    startKick(o, onDone) {
      k = {
        ...o, onDone, keeperHuman: o.keeperMode === 'human', t0: 0, shot: null, dive: null, dived: false, side: 0,
        approach: 1, hipsFrom: 0.25, strikeAt: RULES.runUp + SWING, plan: null,
      };
      if (!o.shooterHuman) {
        k.plan = strikerPlan(o.strikerSkill, o.rng);
        if (o.fixedShot) {
          // a friend's recorded kick: the body tells the truth about where it is going
          k.plan = { ...k.plan, side: Math.abs(o.fixedShot.target.x) < 0.5 ? 0 : Math.sign(o.fixedShot.target.x), traits: { ...k.plan.traits, readWindow: 0 } };
          k.plan.cues = { approach: k.plan.side || 1 };
        }
        k.side = k.plan.side; k.approach = k.plan.cues.approach; k.hipsFrom = k.plan.traits.hipsLead;
      }
      ball.position.set(0, BALL_R, 0);
      ball.rotation.set(0, 0, 0);
      keeper.visible = o.keeperMode !== 'none';
      striker.visible = true;
      marker.visible = ring.visible = ringGoal.visible = false;
      rig.set(k.keeperHuman ? 'keep' : 'broadcast');
      poseStriker(0, null);
      poseKeeper(-1);
      if (o.shooterHuman) state = 'aim';
      else { state = 'runup'; k.t0 = performance.now() + (o.delay == null ? 900 : o.delay); }
    },

    /** Development: play a recorded swipe as if a finger had made it (the player must be the shooter). */
    autoShoot(samples) {
      if (state !== 'aim') return false;
      const shot = readSwipe(samples, project, k.seed);
      if (!shot) return false;
      state = 'runup'; k.t0 = performance.now();
      k.shot = shot; k.side = Math.abs(shot.target.x) < 0.5 ? 0 : Math.sign(shot.target.x); k.strikeAt = shot.timing.strikeT + SWING;
      return true;
    },
    /** Development: dive as if the player had swiped (the player must be in goal). rel = seconds relative to the strike. */
    autoDive(target, rel) {
      if (!k || !k.keeperHuman || k.dived) return false;
      k.dive = playerDive(target, rel); k.dived = true;
      return true;
    },

    /** Slow-motion replay of the last kick from beside the post. Calls onEnd when it is over. */
    replay(onEnd) {
      if (!last || !last.track || last.track.length < 2) { onEnd(); return; }
      k = last;
      state = 'replay';
      k.replayT = -0.3; k.onReplayEnd = onEnd;
      const cx = k.crossing ? k.crossing.x : 0;
      rig.set(cx >= 0 ? 'replayR' : 'replayL', true);
      net.wake();
    },

    /** Road to Glory target zones: [{name, x, y, r}] in goal-plane metres. */
    showTargets(list) {
      targets.clear();
      for (const z of list) {
        const m = new THREE.Mesh(new THREE.RingGeometry(z.r * 0.82, z.r, 40), basic(new THREE.Color(1.6, 1.3, 0.3), 0.85));
        m.position.set(z.x, z.y, GOAL_Z + 0.03);
        m.userData.name = z.name;
        targets.add(m);
      }
    },
    hitTarget(name) {
      for (const m of targets.children) if (m.userData.name === name) m.material.color.setRGB(0.4, 2.2, 0.6);
    },

    /** Put both players at rest (menus, between kicks). */
    rest() {
      state = 'idle'; k = null;
      ball.position.set(0, BALL_R, 0);
      ring.visible = ringGoal.visible = marker.visible = false;
    },

    /** @param now performance clock (ms); dt seconds */
    update(now, dt) {
      clock += dt;
      if (state === 'idle' || !k) {
        striker.solve(idlePose(STRIKER_HOME, clock, -1));
        keeper.solve(keeperPose(NO_DIVE, -1, clock));
      } else if (state === 'aim') {
        poseStriker(0, null);
        poseKeeper(-1);
      } else if (state === 'runup') {
        const t = (now - k.t0) / 1000;
        if (t < 0) { poseStriker(0, null); poseKeeper(-1); } else {
          const known = !k.shooterHuman || k.shot;
          poseStriker(t, known ? k.strikeAt : null);
          poseKeeper(t - k.strikeAt);
          if (k.shooterHuman) {
            const kk = Math.min(1, t / RULES.runUp);
            ring.scale.setScalar(1 - 0.8 * kk);
            const inWindow = Math.abs(t - RULES.runUp) <= RULES.perfect;
            ring.material.color.setRGB(inWindow ? 0.6 : 1.6, inWindow ? 2.4 : 1.5, inWindow ? 0.8 : 1.1);
            ring.material.opacity = t > RULES.runUp + RULES.clean ? 0.3 : 0.8;
          }
          if (known && t >= k.strikeAt) strike();
          else if (!known && t > RULES.runUp + RULES.lateLimit) cancelRun('Too late: the striker pulled out. Touch the ball to go again');
        }
      } else if (state === 'flight') {
        stepFlight(dt);
        poseStriker((now - k.t0) / 1000, k.strikeAt);
        poseKeeper(k.sim.t);
        const s = k.sim;
        const deciding = s.events.find((e) => e.type === 'goal' || e.type === 'out' || e.type === 'post' || e.type === 'bar' || OBSTACLE_PARTS.includes(e.type));
        // a touched ball may still creep in: give it a moment before calling it
        const wait = deciding && (deciding.type === 'goal' || deciding.type === 'out') ? 0.12 : 0.7;
        if (ballDone(s) || s.t > 4.5 || (deciding && s.t > deciding.t + wait)) decide();
      } else if (state === 'after') {
        k.afterT += dt;
        if (!ballDone(k.sim)) stepFlight(dt);
        const st = (now - k.t0) / 1000;
        const scored = k.result.outcome === 'goal';
        const sp = strikerPose(Math.min(st, k.strikeAt + 0.45), k.strikeAt, cues());
        if (k.afterT > 0.5) striker.solve((scored ? celebratePose : dejectedPose)({ x: sp.pelvis.x, z: sp.pelvis.z }, clock, -1));
        else striker.solve(sp);
        if (k.keeperMode !== 'none') {
          if (k.result.outcome === 'save' && k.afterT > 0.9) keeper.solve(celebratePose({ x: 0, z: -KEEPER.lineZ }, clock, 1));
          else poseKeeper(k.sim.t);
        }
      } else if (state === 'replay') {
        k.replayT += dt * 0.32;
        const tr = k.track;
        let i = tr.findIndex((p) => p.t >= k.replayT);
        if (i < 0) i = tr.length - 1;
        const p = tr[Math.max(0, i)];
        if (k.replayT >= 0) ball.position.set(p.x, p.y, -p.z); else ball.position.set(0, BALL_R, 0);
        striker.solve(strikerPose(k.strikeAt + k.replayT, k.strikeAt, cues()));
        if (k.keeperMode !== 'none') keeper.solve(keeperPose(k.dive || NO_DIVE, k.replayT, clock));
        const endT = Math.min(tr[tr.length - 1].t, (k.crossing ? k.crossing.t : 1) + 0.55);
        if (k.replayT > endT) { const f = k.onReplayEnd; k.onReplayEnd = null; state = 'after'; k.afterT = 9; if (f) f(); }
      }
      const inPlay = k && k.sim && (state === 'flight' || state === 'after' || state === 'replay');
      net.update(dt, inPlay ? ball.position : null, !!(inPlay && (state === 'replay' ? k.sim.scored && ball.position.z < GOAL_Z : k.sim.inGoal)));
    },
  };
}
export { SHOT_TYPES };
