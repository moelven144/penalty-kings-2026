// Penalty Kings v3 — the game around the kicks: menus, shootouts, the Daily
// Challenge, Road to Glory, challenge links, the tutorial, rewards and clips.
// Every kick itself is run by game/match.js.
import { newShootout, record, winner, nextTeam, score, isSuddenDeath } from '../core/rules.js';
import { encodeChallenge2, quantise2, readAnyChallenge } from '../core/challenge.js';
import { TEAMS, teamIndex, cpuStats } from '../core/teams.js';
import { makeRng, hashSeed } from '../core/rng.js';
import { loadProfile, saveProfile, recordKick, recordShootout, recordDaily, recordGlory, totalStars, styleOf, levelFromXp, dayKey } from '../core/profile.js';
import { dailyFixture, gloryLevel, starsFor, isUnlocked, hitsZone, ZONES, REGIONS, LEVEL_COUNT } from '../core/modes.js';
import { legacyKickToShot, SHOT_TYPES } from '../core/shot.js';
import { LEVELS, strikerTraits, keeperSkillFromStats, strikerSkillFromStats } from '../core/ai.js';
import { TIERS, TIER_ORDER } from '../core/quality.js';
import { patternFor } from '../render/character.js';
import { ClipRecorder, momentScore, shareClip } from './clip.js';
import { unlock as unlockAudio, sfx, setMuted } from './audio.js';
import { haptics } from './haptics.js';

export const PLAY_URL = 'https://moelven144.github.io/penalty-kings-2026/v3/';
const $ = (id) => document.getElementById(id);
const KEEPER_KITS = ['#f97316', '#a3e635', '#22d3ee', '#f472b6', '#facc15'];
const levelName = (skill) => LEVELS.reduce((a, b) => (Math.abs(b.skill - skill) < Math.abs(a.skill - skill) ? b : a)).name;
const REASONS = {
  held: 'Held by the keeper', hands: 'Pushed away', arms: 'Kept out with an arm', body: 'Straight at the keeper', legs: 'Saved with the legs', head: 'Off the keeper',
  over: 'Over the bar', wide: 'Wide', post: 'Off the post', bar: 'Off the bar', short: 'Not enough on it',
  'in-off-post': 'In off the post!', 'in-off-bar': 'In off the bar!', 'off-hands': 'Through the keeper’s hands!', 'off-arms': 'Off the keeper and in!',
  'off-body': 'Off the keeper and in!', 'off-legs': 'Off the keeper and in!', 'off-head': 'Off the keeper and in!', clean: '',
};
const GRADE = { perfect: 'Perfect strike', clean: 'Clean strike', rushed: 'Rushed', scuffed: 'Scuffed' };
const STYLE_WORD = { topCorner: 'TOP BINS!', curve: 'WHAT A BEND!', panenka: 'CHEEKY CHIP!' };

/**
 * @param w {{canvas, match, crowd, rig, striker, keeper, gfx, tierName, storage, params}}
 */
export function createApp(w) {
  const { canvas, match, crowd, rig, striker, keeper, storage, params } = w;
  let rng = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
  const link = readAnyChallenge(location.hash);
  const challenge = link && !link.error ? link : null;
  const profile = loadProfile(storage);
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEBUG = params.has('debug');
  const game = { mode: 'quick', me: (profile.nation && TEAMS[teamIndex(profile.nation)]) || homeNation(), them: null, playerTeam: 0, shootout: null, myKicks: [], outcome: null, shooterIsMe: true, phase: 'menu', kickNo: 0 };
  const clips = new ClipRecorder(canvas, 30, paintClipOverlay);
  haptics.enabled = profile.settings.haptics !== false;
  setMuted(profile.settings.muted);
  match.aidOn = profile.settings.aimAid !== false;
  let timer = null;
  const later = (ms, fn) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

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

  // ---------------------------------------------------------------- HUD
  let bannerTimer;
  function banner(text, good, hold = 1300) {
    const el = $('banner');
    el.textContent = text;
    el.style.color = good ? 'var(--gold)' : '#ffffff';
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), hold);
  }
  const hint = (t) => { $('hint').textContent = t; };
  const sub = (t) => { $('sub').textContent = t; };
  function caption(t, ms = 2600) {
    const el = $('caption');
    el.textContent = t; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), ms);
  }
  function showPanel(on) { $('panel').hidden = !on; $('hud').hidden = on && game.phase === 'menu'; }

  // branding burned into every shared clip, so it makes sense with no context
  function paintClipOverlay(ctx, cw, ch) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, 'rgba(4,9,21,0.85)'); grad.addColorStop(1, 'rgba(4,9,21,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, 200);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc33'; ctx.font = '900 38px -apple-system, Arial Black, sans-serif';
    ctx.fillText('♛ PENALTY KINGS', cw / 2, 62);
    ctx.fillStyle = '#ffffff';
    if (game.shootout && game.mode !== 'glory' && game.mode !== 'tutorial') {
      const [a, b] = score(game.shootout);
      const t0 = game.playerTeam === 0 ? game.me : game.them; const t1 = game.playerTeam === 0 ? game.them : game.me;
      ctx.font = '800 44px -apple-system, Arial, sans-serif';
      ctx.fillText(`${t0.flag} ${t0.code}  ${a} – ${b}  ${t1.code} ${t1.flag}`, cw / 2, 126);
    } else if (game.level) {
      ctx.font = '800 40px -apple-system, Arial, sans-serif';
      ctx.fillText(`Road to Glory · Level ${game.level.n}`, cw / 2, 124);
    }
    if (game.outcome && game.word) {
      const g2 = ctx.createLinearGradient(0, ch - 260, 0, ch);
      g2.addColorStop(0, 'rgba(4,9,21,0)'); g2.addColorStop(1, 'rgba(4,9,21,0.9)');
      ctx.fillStyle = g2; ctx.fillRect(0, ch - 260, cw, 260);
      ctx.fillStyle = '#ffcc33'; ctx.font = '900 76px -apple-system, Arial Black, sans-serif';
      ctx.fillText(game.word, cw / 2, ch - 130);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 34px -apple-system, Arial, sans-serif';
      ctx.fillText('Can you save it? Link in the message', cw / 2, ch - 70);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- kits and stands
  function dress(shooting, keeping) {
    striker.setKit({ shirt: shooting.c1, shirt2: shooting.c2, shorts: shooting.c2, socks: shooting.c1, pattern: patternFor(shooting.code), skin: 0.72 + (teamIndex(shooting.code) % 4) * 0.09, hairTone: 0.25 + (teamIndex(shooting.code) % 3) * 0.2 });
    const kc = KEEPER_KITS[teamIndex(keeping.code) % KEEPER_KITS.length];
    keeper.setKit({ shirt: kc, shirt2: '#111827', shorts: '#111827', socks: kc, pattern: 'plain', gloves: '#f4f4f4', skin: 0.72 + ((teamIndex(keeping.code) + 2) % 4) * 0.09, hairTone: 0.2 + (teamIndex(keeping.code) % 3) * 0.2 });
  }
  function setTeams() {
    const order = game.playerTeam === 0 ? [game.me, game.them] : [game.them, game.me];
    order.forEach((t, i) => { $(`team${i}`).querySelector('.name').textContent = `${t.flag} ${t.code}`; });
    crowd.paint(game.me, game.them); // the end behind the goal wears the player's colours
  }
  function updateScoreboard() {
    const [a, b] = score(game.shootout);
    $('score').textContent = `${a} – ${b}`;
    [0, 1].forEach((team) => {
      const kicks = game.shootout.kicks[team];
      const n = Math.max(5, kicks.length);
      $(`team${team}`).querySelector('.dots').innerHTML = Array.from({ length: n }, (_, i) => `<span class="dot ${i < kicks.length ? (kicks[i] ? 'goal' : 'miss') : ''}"></span>`).join('');
    });
  }

  // ---------------------------------------------------------------- shootouts
  function start(mode) {
    game.mode = mode; game.phase = 'play'; game.level = null;
    game.shootout = newShootout(); game.recorded = false; game.extra = false; game.extraGoals = 0; game.code = null;
    clips.reset(); game.myKicks = []; game.kickNo = 0;
    match.showTargets([]);
    if (mode === 'challenge') {
      game.them = TEAMS[challenge.nation] || TEAMS[0];
      game.playerTeam = 1; // the challenger kicked first
    } else if (mode === 'daily') {
      const fx = dailyFixture(dayKey()); // the same opponent and the same rolls for everyone today
      game.day = fx.day; rng = makeRng(fx.seed);
      game.them = TEAMS[teamIndex(fx.opponent)];
      if (game.them.code === game.me.code) game.them = TEAMS[(teamIndex(fx.opponent) + 1) % TEAMS.length];
      game.playerTeam = 0;
    } else {
      do game.them = rng.pick(TEAMS); while (game.them.code === game.me.code);
      game.playerTeam = 0;
    }
    setTeams(); showPanel(false); $('hud').hidden = false;
    walkout(nextKick);
  }

  /** A short arrival: the stadium from above, the two nations, then down to the spot. Tap to skip. */
  function walkout(then) {
    if (reducedMotion || DEBUG) { then(); return; }
    match.rest();
    rig.set('high', true); rig.set('broadcast');
    crowd.react(0.7, 0.7); sfx.murmur();
    const stakes = game.mode === 'daily' ? 'Daily Challenge' : game.mode === 'challenge' ? 'A friend’s challenge' : 'Penalty shootout';
    caption(`${game.me.name} v ${game.them.name} · ${stakes}`, 2600);
    hint('Tap to skip');
    let done = false;
    const go = () => { if (done) return; done = true; canvas.removeEventListener('pointerdown', go); hint(''); then(); };
    canvas.addEventListener('pointerdown', go);
    later(2800, go);
  }

  function nextKick() {
    if (game.mode === 'glory') return gloryNextKick();
    updateScoreboard();
    if (game.extra) return extraKick();
    const wn = winner(game.shootout);
    if (wn !== null) return finish(wn);
    const team = nextTeam(game.shootout);
    game.shooterIsMe = team === game.playerTeam;
    const stats = cpuStats(game.them);
    if (game.shooterIsMe) {
      dress(game.me, game.them);
      beginKick({ shooterHuman: true, keeperMode: 'cpu', keeperSkill: keeperSkillFromStats(stats.keeper) });
      hint(isSuddenDeath(game.shootout) ? 'Sudden death · Touch the ball' : 'Touch the ball, swipe at the goal, let go as the foot plants');
    } else {
      dress(game.them, game.me);
      const theirIndex = game.shootout.kicks[1 - game.playerTeam].length;
      const rec = challenge && theirIndex < 5 ? challenge.kicks[theirIndex] : null;
      const fixedShot = rec ? (rec.legacy ? legacyKickToShot(rec.legacy) : rec) : null;
      const skill = strikerSkillFromStats(stats.finishing, stats.disguise);
      beginKick({ shooterHuman: false, keeperMode: 'human', strikerSkill: skill, fixedShot });
      const tr = strikerTraits(skill);
      sub(fixedShot ? 'Your friend’s kick' : `${levelName(skill)} striker · reads you ${Math.round(tr.readWindow * 1000)} ms before the kick`);
      hint('Watch the hips and the standing foot · swipe to dive');
    }
  }

  function beginKick(o) {
    game.outcome = null; game.word = '';
    sub(''); sfx.murmur();
    clips.start();
    game.kickNo++;
    match.startKick({ rng, seed: hashSeed(`${game.kickNo}:${Math.floor(rng.next() * 1e9)}`), ...o }, settle);
  }

  function settle(r) {
    if (game.mode === 'tutorial') return tutorialSettle(r);
    game.outcome = r;
    const scored = r.outcome === 'goal';
    const team = game.shooterIsMe ? game.playerTeam : 1 - game.playerTeam;
    const styles = game.shooterIsMe && scored ? styleOf(r.kick, r.crossing) : [];
    if (game.mode === 'glory') {
      game.results.push({ outcome: r.outcome, styles, crossing: r.crossing, kick: r.kick });
      if (game.level.type === 'targets') for (const z of game.level.targets) if (hitsZone(z, r.crossing)) match.hitTarget(z);
    } else if (!game.extra) record(game.shootout, team, scored);
    else game.extraGoals += scored ? 1 : 0;
    if (game.shooterIsMe && game.myKicks.length < 5) {
      game.myKicks.push(quantise2({ target: r.shot.target, power: r.shot.power, curve: r.shot.curve, type: r.shot.type, grade: r.shot.timing.grade }));
    }
    const good = game.shooterIsMe ? scored : !scored;
    const earned = recordKick(profile, game.shooterIsMe ? 'shooter' : 'keeper', r.outcome === 'post' ? 'post' : r.outcome, styles);
    saveProfile(storage, profile);
    const word = styles.length ? STYLE_WORD[styles[0]] : { goal: 'GOAL!', save: 'SAVED!', miss: 'MISS', post: 'POST!' }[r.outcome];
    game.word = game.shooterIsMe ? word : (good ? 'HUGE SAVE!' : word);
    banner(game.shooterIsMe || !good ? word : 'SAVED!', good);
    const reward = earned.xp ? `  +${earned.xp} XP` : '';
    let why = REASONS[r.reason] || '';
    if (!game.shooterIsMe && r.switched) why = 'You went early: the striker saw it and switched';
    else if (!game.shooterIsMe && r.diveGrade === 'perfect' && !scored) why = 'Perfect dive · ' + why;
    hint(why + reward + (earned.levelUp ? `  Level ${earned.levelUp}!` : ''));
    if (game.shooterIsMe) sub(`${SHOT_TYPES[r.shot.type].label} · ${Math.round(r.launch.speed * 3.6)} km/h · ${GRADE[r.shot.timing.grade]}`);
    const moment = momentScore({ outcome: r.outcome, playerShooting: game.shooterIsMe, styles, suddenDeath: game.mode !== 'glory' && isSuddenDeath(game.shootout), decisive: game.mode !== 'glory' && winner(game.shootout) !== null });
    const replayWorthy = !reducedMotion && ((game.shooterIsMe && scored && (styles.length || r.reason.startsWith('in-off'))) || (!game.shooterIsMe && r.outcome === 'save' && r.diveGrade === 'perfect'));
    if (replayWorthy) {
      later(1500, () => {
        banner('REPLAY', true, 900); hint('');
        match.replay(() => { clips.stop(moment, game.word); nextKick(); });
      });
    } else {
      setTimeout(() => clips.stop(moment, game.word), 1300);
      later(1900, nextKick);
    }
  }

  function finish(wn) {
    game.phase = 'over';
    match.rest(); rig.set('orbit');
    const won = wn === game.playerTeam;
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
    crowd.react(won ? 1 : 0.1, won ? 0.1 : 1);
    const clipBtn = $('btn-clip');
    clipBtn.hidden = !clips.best;
    clipBtn.textContent = clips.best ? `Share your best moment: ${clips.best.label}` : '';
    clipBtn.onclick = async () => {
      const { text, url } = challengeLink();
      const how = await shareClip(clips.best, text, url);
      if (how === 'downloaded') clipBtn.textContent = 'Clip saved';
    };
    const [a, b] = score(game.shootout);
    const mine = game.playerTeam === 0 ? a : b; const theirs = game.playerTeam === 0 ? b : a;
    $('panel').classList.remove('title');
    $('panel-extra').replaceChildren();
    $('panel-title').textContent = won ? `${game.me.flag} You win ${mine}–${theirs}!` : `${game.them.flag} Lost ${mine}–${theirs}`;
    $('panel-text').textContent = (game.mode === 'challenge'
      ? (won ? 'You beat their challenge. Send one back!' : 'They got you. Send them a rematch.')
      : 'Send your 5 penalties to a friend. Can they save them?') + dailyLine;
    const share = $('btn-primary');
    share.hidden = false;
    if (game.myKicks.length >= 5) { share.textContent = 'Challenge a friend'; share.onclick = shareChallenge; } else {
      // the shootout ended early: take the rest of your 5 so the challenge is complete
      const left = 5 - game.myKicks.length;
      share.textContent = `Take ${left} more to challenge a friend`;
      share.onclick = () => { game.extra = true; game.winnerTeam = wn; game.phase = 'play'; showPanel(false); extraKick(); };
    }
    $('btn-glory').hidden = true; $('btn-settings').hidden = true;
    const again = $('btn-secondary');
    again.textContent = 'Back to the menu'; again.hidden = false;
    again.onclick = toMenu;
    showPanel(true); hint(''); sub('');
  }

  // bonus kicks after an early finish: they only build the challenge, not the score
  function extraKick() {
    if (game.myKicks.length >= 5) { game.extra = false; return finish(game.winnerTeam); }
    game.shooterIsMe = true;
    dress(game.me, game.them);
    beginKick({ shooterHuman: true, keeperMode: 'cpu', keeperSkill: keeperSkillFromStats(cpuStats(game.them).keeper) });
    hint(`Challenge kick ${game.myKicks.length + 1} of 5 · Touch the ball`);
  }

  function challengeLink() {
    const base = /^https?:/.test(location.protocol) && !/^(localhost|127\.|192\.168\.)/.test(location.hostname) ? location.origin + location.pathname : PLAY_URL;
    if (game.myKicks.length < 5) return { text: `Penalty Kings: shoot, save, beat your mates. ${game.me.flag}`, url: base };
    const scored = game.shootout.kicks[game.playerTeam].slice(0, 5).filter(Boolean).length + (game.extraGoals || 0);
    if (!game.code) game.code = encodeChallenge2({ nation: teamIndex(game.me.code), scored: Math.min(5, scored), seed: (rng.next() * 2 ** 32) >>> 0, kicks: game.myKicks });
    return { url: `${base}#c=${game.code}`, text: `I scored ${Math.min(5, scored)}/5 for ${game.me.name} ${game.me.flag} in Penalty Kings. Can you save them?` };
  }
  async function shareChallenge() {
    const { text, url } = challengeLink();
    try {
      if (navigator.share) await navigator.share({ title: 'Penalty Kings', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); $('btn-primary').textContent = 'Link copied!'; }
    } catch { /* share sheet closed */ }
  }

  // ---------------------------------------------------------------- road to glory
  function startLevel(n) {
    const L = gloryLevel(n);
    game.mode = 'glory'; game.phase = 'play'; game.level = L; game.results = [];
    game.shootout = newShootout(); game.myKicks = []; game.extra = false; game.kickNo = 0;
    clips.reset();
    rng = makeRng((Date.now() ^ (n * 7919)) >>> 0);
    game.them = TEAMS[teamIndex(L.opponent)] || TEAMS[0];
    if (game.them.code === game.me.code) game.them = TEAMS[(teamIndex(L.opponent) + 1) % TEAMS.length];
    game.playerTeam = 0;
    setTeams();
    match.showTargets(L.type === 'targets' ? L.targets.map((name) => ({ name, ...ZONES[name] })) : []);
    $('panel-extra').replaceChildren();
    showPanel(false); $('hud').hidden = false;
    gloryNextKick();
  }
  function gloryHud() {
    const L = game.level; const done = game.results.length;
    $('team0').querySelector('.name').textContent = `Level ${L.n}`;
    $('team1').querySelector('.name').textContent = REGIONS.find((r) => r.id === L.region).name;
    $('score').textContent = `${Math.min(done + 1, L.kicks)}/${L.kicks}`;
    $('team0').querySelector('.dots').innerHTML = game.results.map((r) => `<span class="dot ${(L.type === 'keep' ? r.outcome !== 'goal' : r.outcome === 'goal') ? 'goal' : 'miss'}"></span>`).join('');
    $('team1').querySelector('.dots').innerHTML = '';
  }
  function gloryOver() {
    const L = game.level; const r = game.results;
    if (r.length >= L.kicks) return true;
    if (L.type === 'sudden' && r.length && r[r.length - 1].outcome !== 'goal') return true;
    if (L.type === 'targets' && L.targets.every((z) => r.some((x) => hitsZone(z, x.crossing)))) return true;
    return false;
  }
  function gloryNextKick() {
    gloryHud();
    if (gloryOver()) return gloryFinish();
    const L = game.level;
    game.shooterIsMe = L.type !== 'keep';
    if (game.shooterIsMe) {
      dress(game.me, game.them);
      const noKeeper = L.type === 'targets' && !L.withKeeper;
      beginKick({ shooterHuman: true, keeperMode: noKeeper ? 'none' : 'cpu', keeperSkill: keeperSkillFromStats(L.keeper), alwaysDives: !!L.keeper.alwaysDives });
      hint(`${L.stars[0]} · Touch the ball`);
    } else {
      dress(game.them, game.me);
      const skill = strikerSkillFromStats(L.shooter.finishing, L.shooter.disguise);
      beginKick({ shooterHuman: false, keeperMode: 'human', strikerSkill: skill });
      sub(`${levelName(skill)} striker · reads you ${Math.round(strikerTraits(skill).readWindow * 1000)} ms before the kick`);
      hint(`${L.stars[0]} · Swipe to dive`);
    }
  }
  function gloryFinish() {
    game.phase = 'over';
    match.rest(); match.showTargets([]); rig.set('orbit');
    const L = game.level;
    const stars = starsFor(L, game.results);
    const { newStars } = recordGlory(profile, L.id, stars);
    saveProfile(storage, profile);
    $('panel').classList.remove('title');
    $('panel-title').textContent = stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'Not this time';
    $('panel-text').innerHTML = L.stars.map((t, i) => `<span class="star-line ${i < stars ? 'got' : ''}">${i < stars ? '★' : '☆'} ${t}</span>`).join('')
      + (newStars ? `<span class="star-line got">+${newStars} new star${newStars > 1 ? 's' : ''}</span>` : '');
    const next = $('btn-primary'); const retry = $('btn-clip'); const levels = $('btn-secondary');
    next.hidden = false;
    if (stars && L.n < LEVEL_COUNT) { next.textContent = `Next: level ${L.n + 1}`; next.onclick = () => startLevel(L.n + 1); } else { next.textContent = 'Try again'; next.onclick = () => startLevel(L.n); }
    retry.hidden = !stars; retry.textContent = 'Replay for more stars'; retry.onclick = () => startLevel(L.n);
    levels.hidden = false; levels.textContent = 'All levels'; levels.onclick = levelMap;
    $('btn-glory').hidden = true; $('btn-settings').hidden = true;
    showPanel(true); hint(''); sub('');
  }
  function levelMap() {
    game.phase = 'menu';
    $('panel').classList.remove('title');
    $('panel-title').textContent = 'Road to Glory';
    $('panel-text').textContent = `${totalStars(profile)} of ${LEVEL_COUNT * 3} stars`;
    const grid = document.createElement('div');
    grid.className = 'level-map';
    let firstOpen = null;
    for (const region of REGIONS) {
      const h = document.createElement('h3'); h.textContent = region.name; grid.appendChild(h);
      const row = document.createElement('div'); row.className = 'level-grid';
      const end = (REGIONS[REGIONS.indexOf(region) + 1] || { from: LEVEL_COUNT + 1 }).from - 1;
      for (let n = region.from; n <= end; n++) {
        const b = document.createElement('button');
        const st = profile.glory[`g${n}`] || 0; const open = isUnlocked(profile.glory, n);
        b.className = 'lvl' + (open ? '' : ' locked') + (open && !st ? ' current' : '');
        b.innerHTML = `<b>${n}</b><i>${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : '\u{1F512}'}</i>`;
        b.disabled = !open;
        b.onclick = () => startLevel(n);
        if (open && !st && !firstOpen) firstOpen = b;
        row.appendChild(b);
      }
      grid.appendChild(row);
    }
    $('panel-extra').replaceChildren(grid);
    $('btn-primary').hidden = true; $('btn-clip').hidden = true; $('btn-glory').hidden = true; $('btn-settings').hidden = true;
    const back = $('btn-secondary');
    back.hidden = false; back.textContent = 'Back'; back.onclick = titleScreen;
    showPanel(true);
    if (firstOpen) setTimeout(() => firstOpen.scrollIntoView({ block: 'center' }), 50);
  }

  // ---------------------------------------------------------------- tutorial: four playable beats
  const BEATS = [
    { title: 'Swipe to shoot', text: 'Touch the ball. The striker runs up. Swipe at the goal and let go.', setup: { shooterHuman: true, keeperMode: 'none' }, done: (r) => r.outcome === 'goal', retry: 'Aim inside the posts. Where you let go is where it goes.' },
    { title: 'Time the plant', text: 'Let go just as the ring closes on the ball: that is the standing foot landing.', setup: { shooterHuman: true, keeperMode: 'none' }, done: (r) => ['perfect', 'clean'].includes(r.shot.timing.grade), retry: 'Hold your finger on the ball during the run-up, then flick as the ring closes.' },
    { title: 'Bend one', text: 'Swipe in a curve. The ball swings out and comes back to where you pointed.', setup: { shooterHuman: true, keeperMode: 'none' }, done: (r) => Math.abs(r.shot.curve) > 0.2 && r.outcome === 'goal', retry: 'Make the swipe an arc, like a banana, and still finish on the goal.' },
    { title: 'Dive to save', text: 'The standing foot points where the ball goes. Swipe that way as it is struck.', setup: { shooterHuman: false, keeperMode: 'human', strikerSkill: 0 }, done: (r) => r.outcome === 'save', retry: 'Watch the standing foot, then swipe to that side just as the ball is hit.' },
  ];
  function tutorial(i = 0) {
    if (i >= BEATS.length) { profile.onboarded = true; saveProfile(storage, profile); banner('READY', true); return later(900, toMenu); }
    const b = BEATS[i];
    game.mode = 'tutorial'; game.phase = 'play'; game.beat = i; game.level = null; game.shootout = null;
    game.them = TEAMS[(teamIndex(game.me.code) + 7) % TEAMS.length];
    crowd.paint(game.me, game.them);
    if (b.setup.shooterHuman) dress(game.me, game.them); else dress(game.them, game.me);
    $('team0').querySelector('.name').textContent = 'How to play'; $('team1').querySelector('.name').textContent = `${i + 1} of ${BEATS.length}`;
    $('team0').querySelector('.dots').innerHTML = ''; $('team1').querySelector('.dots').innerHTML = ''; $('score').textContent = '';
    showPanel(false); $('hud').hidden = false; match.showTargets([]);
    caption(b.title, 3000); hint(b.text); sub('');
    game.kickNo++;
    match.startKick({ rng, seed: hashSeed(`t${game.kickNo}`), ...b.setup }, settle);
  }
  function tutorialSettle(r) {
    const b = BEATS[game.beat];
    const ok = b.done(r);
    banner(ok ? 'NICE!' : 'AGAIN', ok);
    hint(ok ? '' : b.retry);
    later(ok ? 1500 : 2200, () => tutorial(ok ? game.beat + 1 : game.beat));
  }

  // ---------------------------------------------------------------- menus
  function toMenu() {
    clearTimeout(timer);
    game.phase = 'menu';
    match.rest(); match.showTargets([]);
    rig.set('orbit');
    titleScreen();
  }
  function titleScreen() {
    game.phase = 'menu';
    $('panel-extra').replaceChildren();
    $('panel').classList.toggle('title', !challenge || game.challengeDone);
    const primary = $('btn-primary'); const daily = $('btn-clip'); const nation = $('btn-secondary'); const glory = $('btn-glory'); const settings = $('btn-settings');
    primary.hidden = false; glory.hidden = true; settings.hidden = false; settings.onclick = settingsScreen;
    if (link && link.error && !game.linkTold) {
      game.linkTold = true;
      $('panel').classList.remove('title');
      $('panel-title').textContent = 'That link can’t be played';
      $('panel-text').textContent = 'This challenge link is from a newer version or is damaged. You can still play a normal game.';
      primary.textContent = 'Play'; primary.onclick = titleScreen;
      daily.hidden = true; nation.hidden = true; settings.hidden = true;
    } else if (challenge && !game.challengeDone) {
      const them = TEAMS[challenge.nation] || TEAMS[0];
      $('panel-title').textContent = `${them.flag} ${them.name} challenges you`;
      $('panel-text').textContent = `They scored ${challenge.scored}/5. Save their exact kicks, then take yours.`;
      primary.textContent = 'Accept the challenge';
      primary.onclick = () => { unlockAudio(); game.challengeDone = true; start('challenge'); };
      daily.hidden = true; nation.hidden = true; settings.hidden = true;
    } else {
      $('panel-title').innerHTML = '<span class="crown">♛</span>PENALTY KINGS';
      $('panel-text').textContent = `${game.me.flag} ${game.me.name} · Level ${levelFromXp(profile.xp)} · ${profile.coins} coins`;
      primary.textContent = 'Quick shootout';
      primary.onclick = () => { unlockAudio(); start('quick'); };
      const done = profile.daily.lastDay === dayKey();
      daily.hidden = false;
      daily.textContent = done ? `Daily challenge done ✓ · streak ${profile.streak.count}` : `Daily challenge · streak ${profile.streak.count}`;
      daily.onclick = () => { unlockAudio(); start('daily'); };
      glory.hidden = false; glory.textContent = `Road to Glory · ${totalStars(profile)} ★`; glory.onclick = () => { unlockAudio(); levelMap(); };
      nation.hidden = false; nation.textContent = `Playing for ${game.me.flag} ${game.me.name} · change`; nation.onclick = pickNation;
    }
    showPanel(true); $('hud').hidden = true;
  }
  function pickNation() {
    const sel = document.createElement('select');
    sel.className = 'nation-picker';
    [...TEAMS].sort((a, b) => a.name.localeCompare(b.name)).forEach((t) => {
      const o = document.createElement('option');
      o.value = t.code; o.textContent = `${t.flag} ${t.name}`;
      if (t.code === game.me.code) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => { game.me = TEAMS[teamIndex(sel.value)]; profile.nation = game.me.code; saveProfile(storage, profile); titleScreen(); };
    $('panel-extra').replaceChildren(sel);
  }
  function settingsScreen() {
    $('panel').classList.remove('title');
    $('panel-title').textContent = 'Settings';
    $('panel-text').textContent = '';
    const box = document.createElement('div');
    const row = (label, note, value, onClick) => {
      const r = document.createElement('div'); r.className = 'set-row';
      r.innerHTML = `<div>${label}<small>${note}</small></div>`;
      const b = document.createElement('button');
      const paint = () => { const v = value(); b.textContent = v === true ? 'On' : v === false ? 'Off' : v; b.classList.toggle('off', v === false); };
      b.onclick = () => { onClick(); paint(); }; paint();
      r.appendChild(b); box.appendChild(r);
    };
    const save = () => saveProfile(storage, profile);
    row('Sound', 'Crowd and ball sounds', () => !profile.settings.muted, () => { unlockAudio(); profile.settings.muted = !profile.settings.muted; setMuted(profile.settings.muted); paintMute(); save(); });
    row('Haptics', haptics.native ? 'Taps you can feel on strikes, posts, saves and goals' : 'Only in the iPhone app', () => profile.settings.haptics !== false, () => { profile.settings.haptics = profile.settings.haptics === false; haptics.enabled = profile.settings.haptics; if (haptics.enabled) haptics.play('strike'); save(); });
    row('Aim marker and timing ring', 'Shows where you point and when the foot plants', () => profile.settings.aimAid !== false, () => { profile.settings.aimAid = profile.settings.aimAid === false; match.aidOn = profile.settings.aimAid; save(); });
    row('Graphics', 'Higher looks better; lower runs cooler. Restarts the stadium', () => TIERS[w.tierName].label, () => {
      const next = TIER_ORDER[(TIER_ORDER.indexOf(w.tierName) + 1) % TIER_ORDER.length];
      try { storage.setItem('pk3_tier', next); } catch { /* private mode */ }
      location.reload();
    });
    row('How to play', 'Four short lessons', () => 'Replay', () => tutorial(0));
    row('Touch latency probe', 'Flashes the screen on touch, for a slow-motion camera', () => match.input.probe, () => { match.input.probe = !match.input.probe; });
    const cr = document.createElement('p'); cr.className = 'credits';
    cr.textContent = 'Penalty Kings is an independent game, not affiliated with any football federation, league, club or tournament. 100% free: no ads, no purchases, no tracking, no account. Player models and animation rig: Quaternius (CC0). Grass and concrete textures: Poly Haven (CC0). 3D engine: three.js (MIT licence).';
    box.appendChild(cr);
    $('panel-extra').replaceChildren(box);
    $('btn-primary').hidden = true; $('btn-clip').hidden = true; $('btn-glory').hidden = true; $('btn-settings').hidden = true;
    const back = $('btn-secondary'); back.hidden = false; back.textContent = 'Back'; back.onclick = titleScreen;
    showPanel(true);
  }

  const muteBtn = $('mute');
  function paintMute() { muteBtn.textContent = profile.settings.muted ? '\u{1F507}' : '\u{1F50A}'; }
  muteBtn.onclick = () => { unlockAudio(); profile.settings.muted = !profile.settings.muted; setMuted(profile.settings.muted); saveProfile(storage, profile); paintMute(); };
  paintMute();
  $('quit').onclick = toMenu;
  canvas.addEventListener('pointerdown', unlockAudio, { passive: true });

  return {
    game, profile, clips,
    /** Call once the stadium is ready. */
    boot() {
      rig.set('orbit', false);
      if (!profile.onboarded && !challenge && !DEBUG) tutorial(0); else titleScreen();
    },
    tick() { clips.tick(); },
    startLevel, start, tutorial, toMenu,
  };
}
