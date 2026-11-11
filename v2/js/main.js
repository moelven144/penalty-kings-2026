// Penalty Kings v2 — game flow, input and HUD.
// All drawing lives in scene.js (the floodlit stadium) and all sound in
// audio.js; this file only runs the shootout and tells them what happened.

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
import { loadProfile, saveProfile, recordKick, recordShootout, recordDaily, styleOf, levelFromXp, dayKey } from './profile.js';
import { dailyFixture, gloryLevel, starsFor, isUnlocked, hitsZone, ZONES, REGIONS, LEVEL_COUNT } from './modes.js';
import { recordGlory, totalStars } from './profile.js';
import { ClipRecorder, momentScore, shareClip } from './clip.js';
import { createStage, W } from './scene.js';
import { unlock as unlockAudio, sfx, setMuted } from './audio.js';

const PLAY_URL = 'https://moelven144.github.io/penalty-kings-2026/v2/';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- stage
const canvas = $('stage');
const stage = createStage(canvas);
const { ball, keeper, shooter } = stage;
window.addEventListener('resize', () => stage.resize());

// ---------------------------------------------------------------- game state
let rng = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
const challenge = readChallengeFromLocation(location.hash);
const storage = (() => { try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; } })();
const profile = loadProfile(storage);
const clips = new ClipRecorder(canvas, 30, paintClipOverlay);

// branding burned into every shared clip, so it makes sense on TikTok with no context
function paintClipOverlay(ctx, w, h) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(4,9,21,0.85)');
  grad.addColorStop(1, 'rgba(4,9,21,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, 200);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffcc33';
  ctx.font = '900 38px -apple-system, Arial Black, sans-serif';
  ctx.fillText('\u265b PENALTY KINGS', w / 2, 62);
  if (game.shootout && game.mode !== 'glory') {
    const [a, b] = score(game.shootout);
    const t0 = game.playerTeam === 0 ? game.me : game.them;
    const t1 = game.playerTeam === 0 ? game.them : game.me;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px -apple-system, Arial, sans-serif';
    ctx.fillText(`${t0.flag} ${t0.code}  ${a} \u2013 ${b}  ${t1.code} ${t1.flag}`, w / 2, 126);
  } else if (game.level) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 40px -apple-system, Arial, sans-serif';
    ctx.fillText(`Road to Glory \u00b7 Level ${game.level.n}`, w / 2, 124);
  }
  // the call-out once the kick is decided
  if (game.outcome && (game.phase === 'result' || game.phase === 'replay')) {
    const g2 = ctx.createLinearGradient(0, h - 260, 0, h);
    g2.addColorStop(0, 'rgba(4,9,21,0)');
    g2.addColorStop(1, 'rgba(4,9,21,0.9)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, h - 260, w, 260);
    const STY = { topCorner: 'TOP BINS!', curve: 'WHAT A BEND!', panenka: 'PANENKA!' };
    const st = game.shooterIsMe && game.outcome.outcome === 'goal' ? styleOf(game.kick, game.outcome.crossing) : [];
    const word = st.length ? STY[st[0]] : { goal: 'GOAL!', save: 'SAVED!', miss: 'MISS!', post: 'OFF THE POST!' }[game.outcome.outcome];
    ctx.fillStyle = '#ffcc33';
    ctx.font = '900 76px -apple-system, Arial Black, sans-serif';
    ctx.fillText(word, w / 2, h - 130);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px -apple-system, Arial, sans-serif';
    ctx.fillText('Can you save it? Link in the message', w / 2, h - 70);
  }
  ctx.restore();
}

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

function start(mode = challenge ? 'challenge' : 'quick') {
  $('btn-glory').hidden = true;
  game.mode = mode;
  game.shootout = newShootout();
  game.recorded = false;
  clips.reset();
  game.myKicks = [];
  if (challenge) {
    game.them = TEAMS[challenge.nation] || TEAMS[0];
    game.playerTeam = 1; // the challenger kicked first
  } else if (mode === 'daily') {
    // same opponent and same random rolls for everyone today
    const fx = dailyFixture(dayKey());
    game.day = fx.day;
    rng = makeRng(fx.seed);
    game.them = TEAMS[teamIndex(fx.opponent)];
    if (game.them.code === game.me.code) game.them = TEAMS[(teamIndex(fx.opponent) + 1) % TEAMS.length];
    game.playerTeam = 0;
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
  stage.paintCrowd(game.playerTeam === 0 ? game.me : game.them, game.playerTeam === 0 ? game.them : game.me);
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
  stage.clearTrail();
  keeper.root.position.set(W(KEEPER_START.x), 0, SPOT_DISTANCE - 0.05);
  keeper.root.rotation.set(0, Math.PI, 0); // faces the shooter
  shooter.root.position.set(W(-1.4), 0, -2.6);
  shooter.root.rotation.set(0, 0.5, 0);
  game.timeScale = 1;
  game.slowmo = false;
}

// Shooting: low, first person behind the ball. Keeping: raised broadcast
// angle behind the shooter so the whole goal fits in portrait.
function setCamera(shooting) {
  stage.setView(shooting ? 'shoot' : 'keep');
  shooter.root.visible = !shooting; // you are the shooter: no body in front of the camera
}

function nextKick() {
  if (game.mode === 'glory') return gloryNextKick();
  updateScoreboard();
  if (game.extra) return extraKick();
  const w = winner(game.shootout);
  if (w !== null) return finish(w);
  resetPositions();
  const team = nextTeam(game.shootout);
  game.shooterIsMe = team === game.playerTeam;
  const shootingNation = game.shooterIsMe ? game.me : game.them;
  const keepingNation = game.shooterIsMe ? game.them : game.me;
  shooter.setKit(shootingNation.c1, shootingNation.c2, shootingNation.c1);
  // keepers wear a contrasting kit: their second colour, or bright orange
  const KEEPER_KITS = ['#f97316', '#a3e635', '#22d3ee', '#f472b6', '#facc15'];
  const kc = KEEPER_KITS[teamIndex(keepingNation.code) % KEEPER_KITS.length];
  keeper.setKit(kc, '#111827', kc);
  sfx.murmur();
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
  game.track = [];
  sfx.kick(game.kick.power);
  sfx.hush();
  game.outcome = null;
  game.phase = 'flight';
  if (game.shooterIsMe) {
    const tell = runUpTell(game.kick.aimX, 0.45, rng);
    game.plan = EASY ? { start: 0.5, x: -game.crossing.x * 0.6, y: 1 } : cpuKeeperPlan(game.crossing, tell, cpuStats(game.them).keeper, rng);
    if (game.mode === 'glory') {
      const L = game.level;
      if (L.type === 'targets' && !L.withKeeper) game.plan = { start: 99, x: 0, y: 1 };
      else if (L.keeper.alwaysDives) game.plan = { start: -0.05, x: rng.sign() * rng.range(1.8, 2.8), y: rng.range(0.4, 1.4) };
      else game.plan = cpuKeeperPlan(game.crossing, tell, L.keeper, rng);
    }
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
  let r = resolveKick(game.kick, game.plan);
  if (game.mode === 'glory' && game.level.type === 'targets' && !game.level.withKeeper && r.outcome === 'save') r = { ...r, outcome: 'goal', reason: 'beaten' };
  game.outcome = r;
  const scored = r.outcome === 'goal';
  const team = game.shooterIsMe ? game.playerTeam : 1 - game.playerTeam;
  if (game.mode === 'glory') {
    const st = game.shooterIsMe && scored ? styleOf(game.kick, r.crossing) : [];
    game.results.push({ outcome: r.outcome, styles: st, crossing: r.crossing, kick: game.kick });
    if (game.level.type === 'targets') for (const z of game.level.targets) if (hitsZone(z, r.crossing)) stage.hitTarget(z);
  } else if (!game.extra) record(game.shootout, team, scored);
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
  const moment = momentScore({ outcome: r.outcome, playerShooting: game.shooterIsMe, styles, suddenDeath: isSuddenDeath(game.shootout), decisive: game.mode !== 'glory' && winner(game.shootout) !== null });
  const label = game.shooterIsMe ? word : 'Huge save!';
  // a replay-worthy goal keeps recording so the shared clip includes the replay
  game.pendingClip = null;
  if (game.shooterIsMe && scored && styles.length && !reducedMotion) game.pendingClip = [moment, label];
  else setTimeout(() => clips.stop(moment, label), 1300);
  haptic(good ? 'heavy' : 'light');
  const scorer = game.shooterIsMe ? game.me : game.them;
  if (scored) {
    sfx.roar();
    stage.goalCelebration([scorer.c1, scorer.c2, '#ffcc33']);
  } else if (r.outcome === 'save') {
    stage.crowdReact(0.6);
    sfx.roar();
    stage.shake(0.5);
  } else {
    sfx.groan();
  }
  game.phase = 'result';
  const replayWorthy = game.shooterIsMe && scored && styles.length && !reducedMotion;
  setTimeout(replayWorthy ? startReplay : nextKick, replayWorthy ? 1400 : 1700);
}

// slow-motion replay of a great goal from beside the post
function startReplay() {
  if (!game.track || game.track.length < 2) return nextKick();
  game.phase = 'replay';
  game.replayT = 0;
  stage.setReplayView(game.crossing.x >= 0 ? 1 : -1);
  shooter.root.visible = false;
  banner('REPLAY', true);
  hint('');
}

function finish(w) {
  game.phase = 'over';
  const won = w === game.playerTeam;
  let dailyLine = '';
  if (!game.recorded) {
    game.recorded = true;
    recordShootout(profile, won);
    if (game.mode === 'daily') {
      const d = recordDaily(profile, game.day, won);
      dailyLine = d.firstToday ? ` Daily streak: ${d.streak} day${d.streak === 1 ? '' : 's'}${d.usedFreeze ? ' (a streak freeze saved it)' : ''}.` : '';
    }
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
  $('panel-text').textContent += dailyLine;
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
// haptics: the native Capacitor plugin inside the app, vibration on the web
function haptic(kind) {
  if (!profile.settings.haptics) return;
  const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
  if (H) H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }).catch(() => {});
  else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? [30, 40, 60] : 20);
}
const now = () => performance.now() / 1000;

// ---------------------------------------------------------------- input
let swipe = null;
const toPoint = (e) => ({ x: e.clientX / window.innerHeight, y: e.clientY / window.innerHeight, t: now() });

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
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
    game.plan = playerKeeperPlan(g.x, g.y, game.sim ? game.sim.t : now() - game.strikeAt);
  }
});

const goalPointFromScreen = (px, py) => stage.goalPointFromScreen(px, py);

// ---------------------------------------------------------------- loop
let last = now();
function frame() {
  const t = now();
  const realDt = Math.min(0.05, t - last);
  last = t;

  // slow motion for the last moments of a close call
  if (game.phase === 'flight' && game.sim && !game.slowmo && game.crossing) {
    const left = game.crossing.t - game.sim.t;
    const h = handsAt(game.plan, game.crossing.t);
    const close = Math.hypot(h.x - game.crossing.x, h.y - game.crossing.y) < 1.1 || Math.abs(Math.abs(game.crossing.x) - GOAL_HALF_WIDTH) < 0.35 || Math.abs(game.crossing.y - GOAL_HEIGHT) < 0.3;
    if (left < 0.22 && close && !reducedMotion) { game.slowmo = true; game.timeScale = 0.28; }
  }
  if (game.phase !== 'flight') game.timeScale += (1 - game.timeScale) * Math.min(1, realDt * 4);
  // debug photo mode (?debug): freeze the frame when a test-supplied condition hits
  if (window.__pkPauseWhen && game.phase === 'flight' && window.__pkPauseWhen(game)) { game.paused = true; window.__pkPauseWhen = null; }
  const dt = game.paused ? 0 : realDt * game.timeScale;

  if (game.phase === 'runup') {
    // shooter jogs in on a curved run, leaning the way the run-up "tells"
    const left = game.strikeAt - t;
    const f = 1 - Math.max(0, left) / 1.2;
    shooter.root.position.set(W(-1.4 + 1.15 * f), 0, -2.6 + 2.32 * f);
    shooter.root.rotation.y = 0.5 * (1 - f);
    if (f < 0.85) shooter.run(t * 11, W(game.tell) * -0.1 * f);
    else shooter.strike((f - 0.85) / 0.3);
    if (left <= 0) strike();
  } else if (game.phase === 'flight' && !game.shooterIsMe) {
    shooter.strike(Math.min(1, 0.45 + game.sim.t * 2.5));
  }

  if (game.sim && (game.phase === 'flight' || game.phase === 'result')) {
    const s = game.sim;
    for (let acc = dt; acc > 0; acc -= 1 / 240) {
      const prevZ = s.p.z;
      step(s, Math.min(1 / 240, acc));
      if (game.phase === 'flight' && prevZ < SPOT_DISTANCE && s.p.z >= SPOT_DISTANCE) {
        settle();
        const o = game.outcome.outcome;
        if (o === 'save') { s.v.z = -Math.abs(s.v.z) * 0.3; s.v.x += (s.p.x > 0 ? 1 : -1) * 2.5; s.v.y *= 0.4; s.spin = 0; sfx.glove(); }
        if (o === 'post') { s.v.z = -Math.abs(s.v.z) * 0.45; s.v.x *= -0.5; s.spin = 0; sfx.post(); }
        if (o === 'goal' && game.outcome.reason.startsWith('in-off')) sfx.post();
      }
      // the net catches goals and bulges
      if (s.p.z > SPOT_DISTANCE + NET_DEPTH - 0.2 && Math.abs(s.p.x) < GOAL_HALF_WIDTH && s.p.y < GOAL_HEIGHT) {
        if (s.v.z > 1) { stage.netImpact(s.p.x, s.p.y, s.v.z); sfx.net(); }
        s.p.z = SPOT_DISTANCE + NET_DEPTH - 0.2;
        s.v.z *= -0.1; s.v.x *= 0.3; s.v.y *= 0.3;
      }
    }
    if (game.phase === 'flight' && s.t > 3) settle(); // ball stopped short
    stage.setBall(s.p, s.v, s.spin, dt, game.phase === 'flight');
    if (game.track && game.track.length < 600) game.track.push({ t: s.t, x: s.p.x, y: s.p.y, z: s.p.z, vx: s.v.x, vy: s.v.y, vz: s.v.z, spin: s.spin });
  }

  if (game.phase === 'replay') {
    game.replayT += realDt * 0.45;
    const tr = game.track;
    let i = tr.findIndex((p) => p.t >= game.replayT);
    if (i < 0) i = tr.length - 1;
    const p = tr[i];
    stage.setBall(p, { x: p.vx, y: p.vy, z: p.vz }, p.spin, realDt * 0.45, true);
    const h = handsAt(game.plan, game.replayT);
    keeper.dive(h.x - KEEPER_START.x, h.y - KEEPER_START.y, h.progress);
    if (game.replayT > tr[tr.length - 1].t + 0.25) {
      game.phase = 'result';
      game.track = null;
      if (game.pendingClip) { clips.stop(...game.pendingClip); game.pendingClip = null; }
      nextKick();
    }
  }
  // keeper: ready stance, then the dive plan (time relative to the strike)
  const kt = game.sim ? game.sim.t : t - game.strikeAt;
  if (game.phase === 'aim' || game.phase === 'idle' || (game.phase === 'runup' && kt < game.plan.start)) {
    keeper.ready(t);
  } else if (game.phase === 'flight' || game.phase === 'result' || game.phase === 'runup') {
    const h = handsAt(game.plan, kt);
    keeper.root.position.set(W(KEEPER_START.x), 0, SPOT_DISTANCE - 0.05);
    if (game.phase === 'result' && game.outcome && game.outcome.outcome === 'save' && kt > game.crossing.t + 0.7) keeper.celebrate(t);
    else if (h.progress > 0 || kt >= game.plan.start) keeper.dive(h.x - KEEPER_START.x, h.y - KEEPER_START.y, h.progress);
    else keeper.ready(t);
  }
  if (game.phase === 'result' && game.outcome && !game.shooterIsMe && game.outcome.outcome === 'goal') shooter.celebrate(t);
  if (game.phase === 'result' && game.outcome && !game.shooterIsMe && game.outcome.outcome !== 'goal' && kt > game.crossing.t + 0.5) shooter.dejected();
  if (game.phase === 'aim') shooter.idle(t);

  stage.update(realDt);
  stage.render();
  clips.tick();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
const DEBUG = /[?&]debug\b/.test(location.search);
if (DEBUG) {
  // for automated screenshots/tests only; never reachable from a normal link
  window.__pk = game;
  window.__pkResolve = resolveKick;
  window.__pkLevel = (n) => startLevel(n);
  window.__pkClips = clips;
  if (/[?&]shots\b/.test(location.search)) document.body.classList.add('shots');
}
const EASY = DEBUG && /[?&]easy\b/.test(location.search);
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
setMuted(profile.settings.muted);
resetPositions();
setCamera(true);
requestAnimationFrame(frame);
// ---------------------------------------------------------------- road to glory
function startLevel(n) {
  $('btn-glory').hidden = true;
  const L = gloryLevel(n);
  game.mode = 'glory';
  game.level = L;
  game.results = [];
  game.shootout = newShootout();
  game.recorded = false;
  game.extra = false;
  game.myKicks = [];
  clips.reset();
  rng = makeRng((Date.now() ^ (n * 7919)) >>> 0);
  game.them = TEAMS[teamIndex(L.opponent)] || TEAMS[0];
  if (game.them.code === game.me.code) game.them = TEAMS[(teamIndex(L.opponent) + 1) % TEAMS.length];
  game.playerTeam = 0;
  setTeams();
  stage.showTargets(L.type === 'targets' ? L.targets.map((name) => ({ name, ...ZONES[name] })) : []);
  $('panel').hidden = true;
  $('panel').classList.remove('title');
  gloryNextKick();
}

function gloryHud() {
  const L = game.level;
  const done = game.results.length;
  $('team0').querySelector('.name').textContent = `Level ${L.n}`;
  $('team1').querySelector('.name').textContent = REGIONS.find((r) => r.id === L.region).name;
  $('score').textContent = `${Math.min(done + 1, L.kicks)}/${L.kicks}`;
  $('team0').querySelector('.dots').innerHTML = game.results.map((r) => `<span class="dot ${(L.type === 'keep' ? r.outcome !== 'goal' : r.outcome === 'goal') ? 'goal' : 'miss'}"></span>`).join('');
  $('team1').querySelector('.dots').innerHTML = '';
}

function gloryOver() {
  const L = game.level;
  const r = game.results;
  if (r.length >= L.kicks) return true;
  if (L.type === 'sudden' && r.length && r[r.length - 1].outcome !== 'goal') return true;
  if (L.type === 'targets' && L.targets.every((z) => r.some((x) => hitsZone(z, x.crossing)))) return true;
  return false;
}

function gloryNextKick() {
  gloryHud();
  if (gloryOver()) return gloryFinish();
  resetPositions();
  const L = game.level;
  game.shooterIsMe = L.type !== 'keep';
  const KEEPER_KITS = ['#f97316', '#a3e635', '#22d3ee', '#f472b6', '#facc15'];
  const kc = KEEPER_KITS[L.n % KEEPER_KITS.length];
  keeper.setKit(kc, '#111827', kc);
  keeper.root.visible = !(L.type === 'targets' && !L.withKeeper);
  game.plan = { start: 99, x: 0, y: 1 };
  setCamera(game.shooterIsMe);
  sfx.murmur();
  if (game.shooterIsMe) {
    shooter.setKit(game.me.c1, game.me.c2, game.me.c1);
    game.phase = 'aim';
    clips.start();
    hint(L.stars[0] + '  ·  Swipe up to shoot');
  } else {
    shooter.setKit(game.them.c1, game.them.c2, game.them.c1);
    game.kick = cpuKick(L.shooter.finishing, rng);
    game.tell = runUpTell(game.kick.aimX, L.shooter.disguise, rng);
    game.phase = 'runup';
    clips.start();
    game.strikeAt = now() + 1.2;
    hint(L.stars[0] + '  ·  Swipe to dive');
  }
}

function gloryFinish() {
  game.phase = 'over';
  keeper.root.visible = true;
  stage.showTargets([]);
  const L = game.level;
  const stars = starsFor(L, game.results);
  const { newStars } = recordGlory(profile, L.id, stars);
  saveProfile(storage, profile);
  $('panel').classList.remove('title');
  $('panel-title').textContent = stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'Not this time';
  $('panel-text').innerHTML = L.stars.map((t, i) => `<span class="star-line ${i < stars ? 'got' : ''}">${i < stars ? '★' : '☆'} ${t}</span>`).join('')
    + (newStars ? `<span class="star-line got">+${newStars} new star${newStars > 1 ? 's' : ''}</span>` : '');
  const next = $('btn-primary');
  const retry = $('btn-clip');
  const levels = $('btn-secondary');
  next.hidden = false;
  if (stars && L.n < LEVEL_COUNT) { next.textContent = `Next: level ${L.n + 1}`; next.onclick = () => startLevel(L.n + 1); }
  else { next.textContent = 'Try again'; next.onclick = () => startLevel(L.n); }
  retry.hidden = !stars;
  retry.textContent = 'Replay for more stars';
  retry.onclick = () => startLevel(L.n);
  levels.hidden = false;
  levels.textContent = 'All levels';
  levels.onclick = levelMap;
  $('panel').hidden = false;
  hint('');
}

function levelMap() {
  $('btn-glory').hidden = true;
  $('panel').classList.remove('title');
  $('panel-title').textContent = 'Road to Glory';
  $('panel-text').textContent = `${totalStars(profile)} of ${LEVEL_COUNT * 3} stars`;
  const grid = document.createElement('div');
  grid.className = 'level-map';
  let firstOpen = null;
  for (const region of REGIONS) {
    const h = document.createElement('h3');
    h.textContent = region.name;
    grid.appendChild(h);
    const row = document.createElement('div');
    row.className = 'level-grid';
    const end = (REGIONS[REGIONS.indexOf(region) + 1] || { from: LEVEL_COUNT + 1 }).from - 1;
    for (let n = region.from; n <= end; n++) {
      const b = document.createElement('button');
      const st = profile.glory[`g${n}`] || 0;
      const open = isUnlocked(profile.glory, n);
      b.className = 'lvl' + (open ? '' : ' locked') + (open && !st ? ' current' : '');
      b.innerHTML = `<b>${n}</b><i>${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : '\u{1F512}'}</i>`;
      b.disabled = !open;
      b.onclick = () => { grid.remove(); startLevel(n); };
      if (open && !st && !firstOpen) firstOpen = b;
      row.appendChild(b);
    }
    grid.appendChild(row);
  }
  $('panel-extra').replaceChildren(grid);
  $('btn-primary').hidden = true;
  $('btn-clip').hidden = true;
  const back = $('btn-secondary');
  back.hidden = false;
  back.textContent = 'Back';
  back.onclick = () => { $('panel-extra').replaceChildren(); titleScreen(); };
  $('panel').hidden = false;
  if (firstOpen) setTimeout(() => firstOpen.scrollIntoView({ block: 'center' }), 50);
}

function titleScreen() {
  $('panel-extra').replaceChildren();
  $('panel').classList.toggle('title', !challenge);
  const primary = $('btn-primary');
  const daily = $('btn-clip');
  const nation = $('btn-secondary');
  if (challenge) {
    const them = TEAMS[challenge.nation] || TEAMS[0];
    $('panel-title').textContent = `${them.flag} ${them.name} challenges you`;
    $('panel-text').textContent = `They scored ${challenge.scored}/5. Save their exact kicks, then take yours.`;
    primary.textContent = 'Accept the challenge';
    primary.onclick = () => start('challenge');
    daily.hidden = true;
    nation.hidden = true;
  } else {
    $('panel-title').innerHTML = '<span class="crown">\u265b</span>PENALTY KINGS';
    const lvl = levelFromXp(profile.xp);
    $('panel-text').textContent = `${game.me.flag} ${game.me.name} \u00b7 Level ${lvl} \u00b7 ${profile.coins} coins`;
    primary.textContent = 'Quick shootout';
    primary.onclick = () => { $('panel').classList.remove('title'); start('quick'); };
    const today = dayKey();
    const done = profile.daily.lastDay === today;
    daily.hidden = false;
    daily.textContent = done ? `Daily challenge done \u2713 \u00b7 streak ${profile.streak.count}` : `Daily challenge \u00b7 streak ${profile.streak.count}`;
    daily.onclick = () => { $('panel').classList.remove('title'); start('daily'); };
    const glory = $('btn-glory');
    glory.hidden = false;
    glory.textContent = `Road to Glory \u00b7 ${totalStars(profile)} \u2605`;
    glory.onclick = levelMap;
    nation.hidden = false;
    nation.textContent = `Playing for ${game.me.flag} ${game.me.name} \u00b7 change`;
    nation.onclick = pickNation;
  }
  $('panel').hidden = false;
}

function pickNation() {
  const sel = document.createElement('select');
  sel.className = 'nation-picker';
  [...TEAMS].sort((a, b) => a.name.localeCompare(b.name)).forEach((t) => {
    const o = document.createElement('option');
    o.value = t.code;
    o.textContent = `${t.flag} ${t.name}`;
    if (t.code === game.me.code) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    game.me = TEAMS[teamIndex(sel.value)];
    profile.nation = game.me.code;
    saveProfile(storage, profile);
    sel.remove();
    titleScreen();
  };
  sel.onblur = () => sel.remove();
  $('panel').appendChild(sel);
  sel.focus();
  if (sel.showPicker) try { sel.showPicker(); } catch { /* not supported */ }
}

// ---------------------------------------------------------------- onboarding & sound
const HOW = [
  ['☝️', 'Swipe up to shoot', 'Swipe from the ball towards the goal. Faster is harder. Bend your swipe to curl it.'],
  ['\u{1F9E4}', 'Swipe to save', 'Watch the run-up, then swipe where you want to dive. Go too early and they will read you.'],
  ['\u{1F4E8}', 'Send it to your mates', 'After a shootout, send your five penalties as a link. Can they save them?'],
];
function onboarding(step = 0) {
  if (step >= HOW.length) {
    profile.onboarded = true;
    saveProfile(storage, profile);
    return titleScreen();
  }
  const [icon, title, text] = HOW[step];
  $('panel').classList.remove('title');
  $('panel-title').textContent = title;
  $('panel-text').textContent = text;
  const pic = document.createElement('div');
  pic.className = 'how';
  pic.textContent = icon;
  $('panel-extra').replaceChildren(pic);
  const next = $('btn-primary');
  next.hidden = false;
  next.textContent = step < HOW.length - 1 ? 'Next' : "Let's play";
  next.onclick = () => { unlockAudio(); onboarding(step + 1); };
  $('btn-clip').hidden = true;
  $('btn-glory').hidden = true;
  const skip = $('btn-secondary');
  skip.hidden = false;
  skip.textContent = 'Skip';
  skip.onclick = () => onboarding(HOW.length);
  $('panel').hidden = false;
}

const muteBtn = $('mute');
const paintMute = () => (muteBtn.textContent = profile.settings.muted ? '\u{1F507}' : '\u{1F50A}');
muteBtn.onclick = () => {
  unlockAudio();
  profile.settings.muted = !profile.settings.muted;
  setMuted(profile.settings.muted);
  saveProfile(storage, profile);
  paintMute();
};
paintMute();

if (!profile.onboarded && !challenge) onboarding();
else titleScreen();
