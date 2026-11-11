// Penalty Kings v2 — playable prototype.
// Real physics, swipe controls, fair keeper and challenge links, drawn with
// PLACEHOLDER 3D. The art pass (stadium, players, crowd, lighting, replays)
// replaces everything in the "scene" section without touching game logic.

import * as THREE from 'three';
import {
  SPOT_DISTANCE, GOAL_HALF_WIDTH, GOAL_HEIGHT, POST_RADIUS, BALL_RADIUS, NET_DEPTH,
  initialState, step, predictCrossing,
} from './physics.js';
import { handsAt, cpuKeeperPlan, runUpTell, playerKeeperPlan, KEEPER_START } from './keeper.js';
import { swipeToKick, cpuKick, resolveKick } from './kick.js';
import { newShootout, record, winner, nextTeam, score, isSuddenDeath } from './rules.js';
import { encodeChallenge, readChallengeFromLocation, quantise } from './challenge.js';
import { TEAMS, teamIndex, cpuStats } from './teams.js';
import { makeRng } from './rng.js';
import { loadProfile, saveProfile, recordKick, recordShootout, styleOf, levelFromXp } from './profile.js';
import { ClipRecorder, momentScore, shareClip } from './clip.js';

const PLAY_URL = 'https://moelven144.github.io/penalty-kings-2026/v2/';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- scene
// Physics x is "right as the shooter sees it". The camera looks down +z,
// where three.js puts screen-right at -x, so we mirror x when drawing.
const W = (x) => -x;

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a1830');
scene.fog = new THREE.Fog('#0a1830', 30, 70);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
const CAM_POS = new THREE.Vector3(0, 1.7, -3.4);
const CAM_LOOK = new THREE.Vector3(0, 1.3, SPOT_DISTANCE);

scene.add(new THREE.HemisphereLight('#cfe3ff', '#1b3a1b', 0.9));
const sun = new THREE.DirectionalLight('#ffffff', 1.4);
sun.position.set(-6, 14, -4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
scene.add(sun);

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#2f8a3a' : '#349a41';
    g.fillRect(0, i * 64, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  return t;
}
const pitch = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.MeshLambertMaterial({ map: stripeTexture() }));
pitch.rotation.x = -Math.PI / 2;
pitch.position.z = 10;
pitch.receiveShadow = true;
scene.add(pitch);

const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff' });
function groundLine(points) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(W(x), 0.01, z)));
  scene.add(new THREE.Line(g, lineMat));
}
groundLine([[-20.16, SPOT_DISTANCE], [20.16, SPOT_DISTANCE]]); // goal line
groundLine([[-20.16, SPOT_DISTANCE], [-20.16, SPOT_DISTANCE - 16.5], [20.16, SPOT_DISTANCE - 16.5], [20.16, SPOT_DISTANCE]]);
groundLine([[-9.16, SPOT_DISTANCE], [-9.16, SPOT_DISTANCE - 5.5], [9.16, SPOT_DISTANCE - 5.5], [9.16, SPOT_DISTANCE]]);
const spot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
spot.rotation.x = -Math.PI / 2;
spot.position.y = 0.012;
scene.add(spot);

const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
function post(x) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 16), white);
  m.position.set(W(x), GOAL_HEIGHT / 2, SPOT_DISTANCE);
  m.castShadow = true;
  scene.add(m);
}
post(-GOAL_HALF_WIDTH);
post(GOAL_HALF_WIDTH);
const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HALF_WIDTH * 2 + POST_RADIUS * 2, 16), white);
bar.rotation.z = Math.PI / 2;
bar.position.set(0, GOAL_HEIGHT, SPOT_DISTANCE);
bar.castShadow = true;
scene.add(bar);

// net: a grid of lines over back, sides and roof
(function net() {
  const pts = [];
  const zb = SPOT_DISTANCE + NET_DEPTH;
  const step = 0.25;
  for (let x = -GOAL_HALF_WIDTH; x <= GOAL_HALF_WIDTH + 1e-6; x += step) {
    pts.push(W(x), 0, zb, W(x), GOAL_HEIGHT * 0.8, zb); // back verticals
    pts.push(W(x), GOAL_HEIGHT, SPOT_DISTANCE, W(x), GOAL_HEIGHT * 0.8, zb); // roof
  }
  for (let y = 0; y <= GOAL_HEIGHT * 0.8 + 1e-6; y += step) pts.push(W(-GOAL_HALF_WIDTH), y, zb, W(GOAL_HALF_WIDTH), y, zb);
  for (const sx of [-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH]) {
    for (let z = SPOT_DISTANCE; z <= zb + 1e-6; z += step) {
      const yTop = GOAL_HEIGHT - ((z - SPOT_DISTANCE) / NET_DEPTH) * GOAL_HEIGHT * 0.2;
      pts.push(W(sx), 0, z, W(sx), yTop, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#dfe7f2', transparent: true, opacity: 0.45 })));
})();

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#111827';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.arc((i * 53) % 256, 20 + ((i * 37) % 90), 12, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.5 }));
ball.castShadow = true;
scene.add(ball);

// placeholder people: capsule body + head, team colours
function person(kit) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: kit, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c99a78', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 6, 12), shirt);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
  head.position.y = 1.72;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 4, 8), shirt);
  const armR = armL.clone();
  armL.position.set(-0.32, 1.25, 0);
  armR.position.set(0.32, 1.25, 0);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), new THREE.MeshStandardMaterial({ color: '#111827' }));
  legs.position.y = 0.4;
  for (const m of [body, head, armL, armR, legs]) { m.castShadow = true; g.add(m); }
  g.userData = { shirt, armL, armR };
  scene.add(g);
  return g;
}
const keeper = person('#f59e0b');
const shooter = person('#3b82f6');

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the whole goal (plus a margin) in view in portrait and landscape
  const halfW = GOAL_HALF_WIDTH + 1.4;
  const dist = SPOT_DISTANCE - CAM_POS.z;
  const vfov = 2 * Math.atan(Math.tan(Math.atan(halfW / dist)) / camera.aspect);
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 34, 78);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- game state
const rng = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
const challenge = readChallengeFromLocation(location.hash);
const storage = (() => { try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; } })();
const profile = loadProfile(storage);
const clips = new ClipRecorder(canvas);

function homeNation() {
  // the player's country from the device region, shown as a flag; fallback Brazil
  const region = (navigator.language || '').split('-')[1];
  if (region && region.length === 2) {
    const flag = String.fromCodePoint(...[...region.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
    const t = TEAMS.find((x) => x.flag === flag);
    if (t) return t;
  }
  return TEAMS[teamIndex('BRA')];
}

const game = {
  mode: challenge ? 'challenge' : 'quick',
  me: (profile.nation && TEAMS[teamIndex(profile.nation)]) || homeNation(),
  them: null,
  playerTeam: 0, // index in the shootout (0 kicks first)
  shootout: null,
  myKicks: [], // the player's kicks, for sharing as a challenge
  phase: 'idle', // aim | runup | flight | result | over
  kick: null,
  plan: null,
  crossing: null,
  outcome: null,
  sim: null,
  strikeAt: 0, // seconds (performance clock) of the strike
  shooterIsMe: true,
};

function start() {
  game.shootout = newShootout();
  game.recorded = false;
  clips.reset();
  game.myKicks = [];
  if (challenge) {
    game.them = TEAMS[challenge.nation] || TEAMS[0];
    game.playerTeam = 1; // the challenger kicked first
  } else {
    do game.them = rng.pick(TEAMS); while (game.them.code === game.me.code);
    game.playerTeam = 0;
  }
  setTeams();
  $('panel').hidden = true;
  nextKick();
}

function setTeams() {
  const order = game.playerTeam === 0 ? [game.me, game.them] : [game.them, game.me];
  order.forEach((t, i) => ($(`team${i}`).querySelector('.name').textContent = `${t.flag} ${t.code}`));
  keeper.userData.shirt.color.set('#f59e0b');
}

function updateScoreboard() {
  const [a, b] = score(game.shootout);
  $('score').textContent = `${a} – ${b}`;
  [0, 1].forEach((team) => {
    const kicks = game.shootout.kicks[team];
    const n = Math.max(5, kicks.length);
    $(`team${team}`).querySelector('.dots').innerHTML = Array.from({ length: n }, (_, i) =>
      `<span class="dot ${i < kicks.length ? (kicks[i] ? 'goal' : 'miss') : ''}"></span>`).join('');
  });
}

function resetPositions() {
  game.sim = null;
  ball.position.set(0, BALL_RADIUS, 0);
  ball.rotation.set(0, 0, 0);
  keeper.position.set(W(KEEPER_START.x), 0, SPOT_DISTANCE - 0.05);
  keeper.rotation.set(0, Math.PI, 0);
  shooter.position.set(W(-0.6), 0, -1.6);
  shooter.rotation.set(0, 0, 0);
}

// Shooting: low, first person behind the ball.
// Keeping: a raised broadcast angle behind the shooter, so in portrait you
// see the whole goal, your keeper and the run-up at once.
const KEEP_CAM_POS = new THREE.Vector3(0, 3.4, -5.2);
const KEEP_CAM_LOOK = new THREE.Vector3(0, 0.9, SPOT_DISTANCE);
function setCamera(shooting) {
  camera.position.copy(shooting ? CAM_POS : KEEP_CAM_POS);
  camera.lookAt(shooting ? CAM_LOOK : KEEP_CAM_LOOK);
  shooter.visible = !shooting; // you are the shooter: no body in front of the camera
}

function nextKick() {
  updateScoreboard();
  if (game.extra) return extraKick();
  const w = winner(game.shootout);
  if (w !== null) return finish(w);
  resetPositions();
  const team = nextTeam(game.shootout);
  game.shooterIsMe = team === game.playerTeam;
  const shootingNation = game.shooterIsMe ? game.me : game.them;
  const keepingNation = game.shooterIsMe ? game.them : game.me;
  shooter.userData.shirt.color.set(shootingNation.c1);
  keeper.userData.shirt.color.set(keepingNation.c2 === '#ffffff' ? '#f59e0b' : keepingNation.c2);
  game.plan = { start: 99, x: 0, y: 1 };
  setCamera(game.shooterIsMe);
  if (game.shooterIsMe) {
    game.phase = 'aim';
    clips.start();
    hint(isSuddenDeath(game.shootout) ? 'Sudden death. Swipe up to shoot' : 'Swipe up from the ball to shoot. Curve your swipe to bend it');
  } else {
    // CPU (or the challenger's recorded kick) is shooting; you keep
    const theirIndex = game.shootout.kicks[1 - game.playerTeam].length;
    game.kick = challenge && theirIndex < 5
      ? challenge.kicks[theirIndex]
      : cpuKick(cpuStats(game.them).finishing, rng);
    game.tell = runUpTell(game.kick.aimX, cpuStats(game.them).disguise, rng);
    game.phase = 'runup';
    clips.start();
    game.strikeAt = now() + 1.2;
    hint('Watch the run-up, then swipe where you want to dive');
  }
}

function strike() {
  game.crossing = predictCrossing(game.kick);
  game.sim = initialState(game.kick);
  game.outcome = null;
  game.phase = 'flight';
  if (game.shooterIsMe) {
    const tell = runUpTell(game.kick.aimX, 0.45, rng);
    game.plan = cpuKeeperPlan(game.crossing, tell, cpuStats(game.them).keeper, rng);
    game.strikeAt = now();
  }
}

const REASONS = {
  read: 'The keeper read it',
  reaction: 'Great reflexes',
  body: 'Straight at the keeper',
  fingertips: 'Just past the fingertips!',
  beaten: '',
  over: 'Over the bar',
  wide: 'Wide',
  post: 'Off the post',
  bar: 'Off the bar',
  'in-off-post': 'In off the post!',
  'in-off-bar': 'In off the bar!',
  short: 'Not enough power',
};

function settle() {
  // decide the kick with whatever dive plan exists at the moment of crossing
  const r = resolveKick(game.kick, game.plan);
  game.outcome = r;
  const scored = r.outcome === 'goal';
  const team = game.shooterIsMe ? game.playerTeam : 1 - game.playerTeam;
  if (!game.extra) record(game.shootout, team, scored);
  else game.extraGoals = (game.extraGoals || 0) + (scored ? 1 : 0);
  if (game.shooterIsMe && game.myKicks.length < 5) game.myKicks.push(quantise(game.kick));
  const good = game.shooterIsMe ? scored : !scored;
  const styles = game.shooterIsMe && scored ? styleOf(game.kick, r.crossing) : [];
  const earned = recordKick(profile, game.shooterIsMe ? 'shooter' : 'keeper', r.outcome, styles);
  saveProfile(storage, profile);
  const STYLE_NAMES = { topCorner: 'Top bins!', curve: 'What a bend!', panenka: 'Panenka!' };
  const word = styles.length ? STYLE_NAMES[styles[0]] : { goal: 'GOAL!', save: 'SAVED!', miss: 'MISS', post: 'POST!' }[r.outcome];
  banner(word, good);
  const reward = earned.xp ? `  +${earned.xp} XP` : '';
  hint((REASONS[r.reason] || '') + reward + (earned.levelUp ? `  Level ${earned.levelUp}!` : ''));
  // keep the clip if this is the best moment so far
  const moment = momentScore({ outcome: r.outcome, playerShooting: game.shooterIsMe, styles, suddenDeath: isSuddenDeath(game.shootout), decisive: winner(game.shootout) !== null });
  const label = game.shooterIsMe ? word : 'Huge save!';
  setTimeout(() => clips.stop(moment, label), 1300);
  if (navigator.vibrate) navigator.vibrate(good ? [30, 40, 60] : 25);
  game.phase = 'result';
  setTimeout(nextKick, 1700);
}

function finish(w) {
  game.phase = 'over';
  const won = w === game.playerTeam;
  if (!game.recorded) {
    game.recorded = true;
    recordShootout(profile, won);
    saveProfile(storage, profile);
  }
  const clipBtn = $('btn-clip');
  clipBtn.hidden = !clips.best;
  clipBtn.textContent = clips.best ? `Share your best moment: ${clips.best.label}` : '';
  clipBtn.onclick = async () => {
    const { text, url } = challengeLink();
    const how = await shareClip(clips.best, text, url);
    if (how === 'downloaded') clipBtn.textContent = 'Clip saved';
  };
  const [a, b] = score(game.shootout);
  const mine = game.playerTeam === 0 ? a : b;
  const theirs = game.playerTeam === 0 ? b : a;
  $('panel-title').textContent = won ? `${game.me.flag} You win ${mine}–${theirs}!` : `${game.them.flag} Lost ${mine}–${theirs}`;
  $('panel-text').textContent = game.mode === 'challenge'
    ? (won ? 'You beat their challenge. Send one back!' : 'They got you. Send them a rematch.')
    : 'Send your 5 penalties to a friend. Can they save them?';
  const share = $('btn-primary');
  share.hidden = false;
  if (game.myKicks.length >= 5) {
    share.textContent = 'Challenge a friend';
    share.onclick = shareChallenge;
  } else {
    // the shootout ended early: take the rest of your 5 so the challenge is complete
    const left = 5 - game.myKicks.length;
    share.textContent = `Take ${left} more to challenge a friend`;
    share.onclick = () => { game.extra = true; game.winnerTeam = w; $('panel').hidden = true; extraKick(); };
  }
  const again = $('btn-secondary');
  again.textContent = 'Play again';
  again.hidden = false;
  again.onclick = () => { history.replaceState(null, '', location.pathname); location.reload(); };
  $('panel').hidden = false;
  hint('');
}

// bonus kicks after an early finish: they only build the challenge, not the score
function extraKick() {
  if (game.myKicks.length >= 5) { game.extra = false; return finish(game.winnerTeam); }
  resetPositions();
  game.shooterIsMe = true;
  game.plan = { start: 99, x: 0, y: 1 };
  setCamera(true);
  game.phase = 'aim';
  clips.start();
  hint(`Challenge kick ${game.myKicks.length + 1} of 5. Swipe up`);
}

function challengeLink() {
  const base = /^https?:/.test(location.protocol) ? location.origin + location.pathname : PLAY_URL;
  if (game.myKicks.length < 5) return { text: `Penalty Kings: shoot, save, beat your mates. ${game.me.flag}`, url: base };
  const scored = game.shootout.kicks[game.playerTeam].slice(0, 5).filter(Boolean).length + (game.extraGoals || 0);
  if (!game.code) game.code = encodeChallenge({ nation: teamIndex(game.me.code), scored, seed: (rng.next() * 2 ** 32) >>> 0, kicks: game.myKicks });
  return {
    url: `${base}#c=${game.code}`,
    text: `I scored ${scored}/5 for ${game.me.name} ${game.me.flag} in Penalty Kings. Can you save them?`,
  };
}

async function shareChallenge() {
  const { text, url } = challengeLink();
  try {
    if (navigator.share) await navigator.share({ title: 'Penalty Kings', text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      $('btn-primary').textContent = 'Link copied!';
    }
  } catch { /* share sheet closed */ }
}

// ---------------------------------------------------------------- HUD helpers
let bannerTimer;
function banner(text, good) {
  const el = $('banner');
  el.textContent = text;
  el.style.color = good ? '#ffcc33' : '#ffffff';
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1300);
}
const hint = (t) => ($('hint').textContent = t);
const now = () => performance.now() / 1000;

// ---------------------------------------------------------------- input
let swipe = null;
const toPoint = (e) => ({ x: e.clientX / window.innerHeight, y: e.clientY / window.innerHeight, t: now() });

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase === 'aim' || game.phase === 'runup' || game.phase === 'flight') swipe = [toPoint(e)];
});
canvas.addEventListener('pointermove', (e) => { if (swipe) swipe.push(toPoint(e)); });
canvas.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  swipe.push(toPoint(e));
  const pts = swipe;
  swipe = null;
  if (game.phase === 'aim' && game.shooterIsMe) {
    const k = swipeToKick(pts);
    if (!k) return hint('Swipe UP from the ball');
    game.kick = k;
    strike();
  } else if (!game.shooterIsMe && (game.phase === 'runup' || game.phase === 'flight') && game.plan.start === 99) {
    // dive towards where the swipe ends, projected onto the goal mouth
    const end = pts[pts.length - 1];
    const g = goalPointFromScreen(end.x * window.innerHeight, end.y * window.innerHeight);
    game.plan = playerKeeperPlan(g.x, g.y, now() - game.strikeAt);
  }
});

const raycaster = new THREE.Raycaster();
const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -SPOT_DISTANCE);
function goalPointFromScreen(px, py) {
  const ndc = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(goalPlane, hit);
  return { x: -hit.x, y: hit.y };
}

// ---------------------------------------------------------------- loop
let last = now();
function frame() {
  const t = now();
  const dt = Math.min(0.05, t - last);
  last = t;

  if (game.phase === 'runup') {
    // shooter jogs in, leaning towards the side the run-up "tells"
    const left = game.strikeAt - t;
    const f = 1 - Math.max(0, left) / 1.2;
    shooter.position.set(W(-1.4 + 1.1 * f), 0, -2.6 + 2.35 * f);
    shooter.rotation.y = 0;
    shooter.rotation.z = W(game.tell) * 0.12 * f;
    if (left <= 0) strike();
  }

  if (game.sim && (game.phase === 'flight' || game.phase === 'result')) {
    const s = game.sim;
    for (let acc = dt; acc > 0; acc -= 1 / 240) {
      const prevZ = s.p.z;
      step(s, Math.min(1 / 240, acc));
      if (game.phase === 'flight' && prevZ < SPOT_DISTANCE && s.p.z >= SPOT_DISTANCE) {
        settle();
        const o = game.outcome.outcome;
        if (o === 'save') { s.v.z = -Math.abs(s.v.z) * 0.3; s.v.x += (s.p.x > 0 ? 1 : -1) * 2.5; s.v.y *= 0.4; s.spin = 0; }
        if (o === 'post') { s.v.z = -Math.abs(s.v.z) * 0.45; s.v.x *= -0.5; s.spin = 0; }
      }
      // the net catches goals
      if (s.p.z > SPOT_DISTANCE + NET_DEPTH - 0.2 && Math.abs(s.p.x) < GOAL_HALF_WIDTH) {
        s.p.z = SPOT_DISTANCE + NET_DEPTH - 0.2;
        s.v.z *= -0.1; s.v.x *= 0.3; s.v.y *= 0.3;
      }
    }
    if (game.phase === 'flight' && s.t > 3) settle(); // ball stopped short
    ball.position.set(W(s.p.x), s.p.y, s.p.z);
    ball.rotation.x += s.v.z * dt * 4;
    ball.rotation.y += s.spin * dt;
  }

  // keeper follows its dive plan (time relative to the strike)
  if (game.phase === 'flight' || game.phase === 'result' || game.phase === 'runup') {
    const h = handsAt(game.plan, t - game.strikeAt);
    keeper.position.set(W(h.x * 0.8), Math.max(0, (h.y - KEEPER_START.y) * 0.6), SPOT_DISTANCE - 0.05);
    keeper.rotation.z = W(h.x) * 0.38;
    keeper.userData.armL.rotation.z = keeper.userData.armR.rotation.z = h.progress * 2.4 * Math.sign(W(h.x) || 1);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
resetPositions();
setCamera(true);
requestAnimationFrame(frame);
if (challenge) {
  const them = TEAMS[challenge.nation] || TEAMS[0];
  $('panel-title').textContent = `${them.flag} ${them.name} challenges you`;
  $('panel-text').textContent = `They scored ${challenge.scored}/5. Save their exact kicks, then take yours.`;
} else {
  $('panel-title').textContent = 'Penalty Kings';
  $('panel-text').textContent = `${game.me.flag} ${game.me.name}: swipe to shoot, swipe to save. Best of five.`;
}
$('btn-primary').textContent = 'Kick off';
$('btn-primary').onclick = start;
$('btn-secondary').hidden = true;
$('btn-clip').hidden = true;
$('panel').hidden = false;
