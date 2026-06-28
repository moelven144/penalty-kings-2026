/* =====================================================================
   PENALTY KINGS — Pseudo-3D shootout engine (canvas)
   ---------------------------------------------------------------------
   Renders one penalty shootout from a behind-the-taker camera.
   The player SHOOTS when their team kicks and KEEPS when the CPU kicks.

   Controls
     Shooting :  the aim sweeps left/right, then up/down — tap / click /
                 SPACE to lock each. Aim into the corners to beat the
                 keeper; overshoot the frame and you miss.
     Keeping  :  tap a goal zone or use the keys
                   Q W E   (top  : left / centre / right)
                   A S D   (low  : left / centre / right)
                 Dive the right way before the striker connects.

   Best of 5, then sudden death. Calls onFinish({playerScore,cpuScore,
   playerWon}) when the shootout is decided.
   ===================================================================== */

const VW = 960, VH = 600;
const GOAL = { x0: 300, x1: 660, top: 120, bot: 256 };
const GOAL_MIDY = (GOAL.top + GOAL.bot) / 2;
const SPOT = { x: VW / 2, y: 538 };           // penalty spot (ball start)
const COL_X = { left: 360, center: 480, right: 600 };

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function dark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

const MUTE_BTN = { x: VW - 58, y: 16, w: 44, h: 44 };   // >=44px touch target

// Respect the OS "reduce motion" setting — skip the goal-particle burst and
// (via CSS) the title confetti for users who opt out of non-essential motion.
function reduceMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  catch (e) { return false; }
}

/* ---------------------------------------------------------------------
   Audio (Web Audio, created lazily on the first user gesture so it
   satisfies autoplay policy) + Haptics (Capacitor Haptics if present,
   otherwise a silent no-op). Mute is persisted and affects sound only.
   --------------------------------------------------------------------- */
const SFX = (() => {
  let ac = null, master = null;
  function ctx() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    return ac;
  }
  const muted = () => localStorage.getItem("pk_mute") === "1";
  function setMuted(m) { try { localStorage.setItem("pk_mute", m ? "1" : "0"); } catch (e) {} }
  function resume() { const c = ctx(); if (c && c.state === "suspended") c.resume(); }
  function tone(f, t0, dur, type, peak) {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function glide(f0, f1, t0, dur, type, peak) {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(t0, dur, peak, hp) {
    const c = ctx(); if (!c) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = peak;
    let node = src;
    if (hp) { const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; src.connect(f); node = f; }
    node.connect(g); g.connect(master); src.start(t0);
  }
  return {
    resume, muted, setMuted,
    lock() { if (muted()) return; const c = ctx(); if (c) tone(720, c.currentTime, 0.07, "square", 0.16); },
    kick() { if (muted()) return; const c = ctx(); if (!c) return; const t = c.currentTime; noise(t, 0.10, 0.45, 320); tone(140, t, 0.12, "sine", 0.32); },
    dive() { if (muted()) return; const c = ctx(); if (c) noise(c.currentTime, 0.20, 0.22, 700); },
    goal() { if (muted()) return; const c = ctx(); if (!c) return; const t = c.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.085, 0.45, "triangle", 0.20)); noise(t, 1.1, 0.15, 180); },
    save() { if (muted()) return; const c = ctx(); if (!c) return; const t = c.currentTime; tone(170, t, 0.16, "square", 0.30); noise(t, 0.28, 0.26, 480); },
    miss() { if (muted()) return; const c = ctx(); if (c) glide(440, 150, c.currentTime, 0.42, "sawtooth", 0.18); },
  };
})();

const HAPTIC = (() => {
  function plugin() { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics; }
  function impact(style) { try { const H = plugin(); if (H) H.impact({ style }); } catch (e) {} }
  return { light() { impact("LIGHT"); }, medium() { impact("MEDIUM"); }, heavy() { impact("HEAVY"); } };
})();

function startShootout(canvas, opts, onFinish) {
  const ctx = canvas.getContext("2d");
  // Size the backing store to the device pixel ratio, and re-fit on resize /
  // orientation change so the pitch stays crisp (setting canvas.width resets
  // the transform, so we re-apply the scale each time).
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VW * dpr; canvas.height = VH * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  fitCanvas();

  const player = opts.playerTeam;
  const cpu = opts.cpuTeam;
  const diff = clamp(opts.diff != null ? opts.diff : (cpu.str - 58) / 40, 0, 1);
  const stageLabel = opts.stageLabel || "";

  // ---- shootout score state ------------------------------------------
  let pScore = 0, cScore = 0, pKicks = 0, cKicks = 0;
  let kSaved = 0;                          // saves the player made while keeping
  const pPips = [], cPips = [];            // 'goal' | 'miss'
  let finished = false;

  // ---- per-kick state -------------------------------------------------
  let phase = "kickIntro";   // kickIntro|aimX|aimY|keeperWindow|strike|kickResult|over
  let phaseT = 0;            // seconds in phase
  let kicker = "player";     // 'player' | 'cpu' (which TEAM is shooting)
  let kick = null;           // resolved kick info during strike
  // shooter aim
  let aimX = VW / 2, aimY = GOAL_MIDY, sweepDir = 1;
  // keeper dive (player keeping)
  let keeperZone = null;
  // animation anchors
  let ball = { x: SPOT.x, y: SPOT.y, r: 22 };
  let keeperPose = { col: "center", row: "low", t: 0, diving: false };
  let resultFlash = "";

  // Shooter "personality": stronger opponents sweep faster and give you a
  // shorter window to read their kick. Re-rolled each kick with a little
  // jitter so no two penalties feel mechanically identical.
  let SWEEP_X, SWEEP_Y, KEEPER_WINDOW;
  function rollShooterFeel() {
    const j = 0.9 + Math.random() * 0.2;                 // ±10% per-kick variation
    SWEEP_X = (470 + diff * 230) * j;                    // px/sec horizontal sweep
    SWEEP_Y = (360 + diff * 170) * j;                    // px/sec vertical sweep
    KEEPER_WINDOW = clamp((1.7 - diff * 0.55) * (2 - j), 0.7, 2.0); // secs to choose a dive
  }
  rollShooterFeel();

  // goal-celebration particle burst
  const particles = [];
  function spawnBurst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 280;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 110,
        t: 0, life: 0.7 + Math.random() * 0.7,
        r: 2 + Math.random() * 3.5, col: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.vy += 540 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ===================================================================
  //  KICK FLOW
  // ===================================================================
  function totalKicks() { return pKicks + cKicks; }

  function decided() {
    const remP = Math.max(0, 5 - pKicks), remC = Math.max(0, 5 - cKicks);
    if (pKicks <= 5 && cKicks <= 5) {
      if (pScore > cScore + remC) return true;
      if (cScore > pScore + remP) return true;
    }
    if (pKicks >= 5 && cKicks >= 5 && pKicks === cKicks && pScore !== cScore) return true;
    return false;
  }

  function beginKick() {
    kicker = totalKicks() % 2 === 0 ? "player" : "cpu";
    rollShooterFeel();
    keeperZone = null;
    keeperPose = { col: "center", row: "low", t: 0, diving: false };
    ball = { x: SPOT.x, y: SPOT.y, r: 22 };
    aimX = VW / 2; aimY = GOAL_MIDY; sweepDir = 1;
    resultFlash = "";
    phase = "kickIntro"; phaseT = 0;
  }

  // ----- resolution ----------------------------------------------------
  function zoneFromAim(x, y) {
    const col = x < 420 ? "left" : x < 540 ? "center" : "right";
    const row = y < GOAL_MIDY ? "high" : "low";
    return { col, row };
  }
  function saveChance(shot, k) {
    let s;
    if (k.col === shot.col) s = k.row === shot.row ? 0.82 : 0.46;
    else if (k.col === "center" || shot.col === "center") s = 0.09;
    else s = 0.04;
    s *= 1 - shot.quality * 0.62;
    return clamp(s, 0.02, 0.92);
  }

  // Visual anchors so the keeper & ball ALWAYS agree with the rolled outcome:
  // a save = they meet; a goal = the ball is clearly beyond the keeper.
  function zonePoint(z) { return { x: COL_X[z.col], y: z.row === "high" ? 150 : 214 }; }
  function cornerPoint(z) {
    return {
      x: z.col === "left" ? GOAL.x0 + 34 : z.col === "right" ? GOAL.x1 - 34 : VW / 2 + (Math.random() - 0.5) * 70,
      y: z.row === "high" ? GOAL.top + 26 : GOAL.bot - 26,
    };
  }
  const otherCol = (c) => (c === "left" ? "right" : c === "right" ? "left" : pick(["left", "right"]));

  // Player has locked the aim → build the kick and let the CPU keeper guess.
  function resolvePlayerShot() {
    let outcome, target = { x: aimX, y: aimY }, kpoint;
    if (aimX < GOAL.x0 + 12 || aimX > GOAL.x1 - 12) {
      outcome = "miss"; target = { x: clamp(aimX, GOAL.x0 - 40, GOAL.x1 + 40), y: aimY };
      kpoint = zonePoint({ col: aimX < VW / 2 ? "left" : "right", row: aimY < GOAL_MIDY ? "high" : "low" });
    } else if (aimY < GOAL.top + 8) {
      outcome = "miss"; target = { x: aimX, y: GOAL.top - 26 };
      kpoint = zonePoint({ col: zoneFromAim(aimX, GOAL_MIDY).col, row: "high" });
    } else {
      const z = zoneFromAim(aimX, aimY);
      const cx = clamp(Math.abs(aimX - VW / 2) / (180 - 14), 0, 1);
      const cy = clamp((GOAL_MIDY - aimY) / (GOAL_MIDY - (GOAL.top + 12)), 0, 1);
      const quality = clamp(0.22 + 0.5 * cx + 0.34 * Math.max(0, cy), 0, 1);
      const shot = { col: z.col, row: z.row, quality };

      // CPU keeper guess (drives the probability)
      const guessCol = 0.30 + diff * 0.46;
      const guessRow = 0.42 + diff * 0.30;
      const kCol = Math.random() < guessCol ? z.col : pick(["left", "center", "right"].filter((c) => c !== z.col));
      const kRow = Math.random() < guessRow ? z.row : (z.row === "high" ? "low" : "high");
      keeperZone = { col: kCol, row: kRow };
      outcome = Math.random() < saveChance(shot, keeperZone) ? "save" : "goal";

      // reconcile the keeper's VISUAL dive with the outcome
      if (outcome === "save") {
        kpoint = { x: clamp(target.x, GOAL.x0 + 14, GOAL.x1 - 14), y: clamp(target.y, GOAL.top + 16, GOAL.bot - 12) };
      } else {
        kpoint = zonePoint({ col: otherCol(z.col), row: z.row }); // dive clearly off the ball
      }
    }
    kick = { by: "player", outcome, target, keeperZone, keeperPoint: kpoint };
  }

  // CPU shot is decided up-front (player will try to read & dive).
  function buildCpuShot() {
    const pMiss = clamp(0.11 - (cpu.str - 70) / 450, 0.02, 0.12);
    if (Math.random() < pMiss) {
      const wide = Math.random() < 0.5;
      const target = wide
        ? { x: Math.random() < 0.5 ? GOAL.x0 - 34 : GOAL.x1 + 34, y: lerp(GOAL.top, GOAL.bot, 0.5) }
        : { x: lerp(GOAL.x0 + 40, GOAL.x1 - 40, Math.random()), y: GOAL.top - 30 };
      return { by: "cpu", outcome: "miss", target, shot: null };
    }
    const quality = clamp(0.30 + diff * 0.45 + (Math.random() - 0.5) * 0.3, 0.05, 1);
    const pCorner = 0.55 + diff * 0.25;
    const col = Math.random() < pCorner ? pick(["left", "right"]) : "center";
    const row = Math.random() < 0.45 + diff * 0.16 ? "high" : "low";
    const shot = { col, row, quality };
    const base = COL_X[col];
    const x = col === "left" ? base - quality * 40
      : col === "right" ? base + quality * 40
        : base + (Math.random() - 0.5) * 46;
    const y = row === "high" ? GOAL.top + 18 + (1 - quality) * 26 : GOAL.bot - 20 - quality * 8;
    return { by: "cpu", outcome: null, target: { x, y }, shot };
  }
  function resolveCpuShotVsDive() {
    const dive = keeperZone || { col: "center", row: "low" };
    kick.keeperPoint = zonePoint(dive);            // keeper dives exactly where the player chose
    if (kick.outcome === "miss") return;           // CPU sprayed it wide/over (target already set)
    kick.outcome = Math.random() < saveChance(kick.shot, dive) ? "save" : "goal";
    if (kick.outcome === "save") {
      kick.target = { x: kick.keeperPoint.x, y: kick.keeperPoint.y }; // ball comes to the keeper
    } else {
      kick.target = cornerPoint({ col: otherCol(dive.col), row: dive.row === "high" ? "low" : "high" }); // beats the keeper
    }
  }

  // ----- apply a finished kick ----------------------------------------
  function applyKick() {
    const scored = kick.outcome === "goal";
    if (kicker === "player") { pKicks++; if (scored) pScore++; pPips.push(scored ? "goal" : "miss"); }
    else { cKicks++; if (scored) cScore++; if (kick.outcome === "save") kSaved++; cPips.push(scored ? "goal" : "miss"); }
    resultFlash = kick.outcome === "goal" ? "GOAL!" : kick.outcome === "save" ? "SAVED!" : "MISSED!";
    // feedback: sound, haptics, and a goal-mouth particle burst in the scorer's colours
    if (kick.outcome === "goal") {
      SFX.goal(); HAPTIC.heavy();
      const scorer = kicker === "player" ? player : cpu;
      if (!reduceMotion()) spawnBurst(kick.target.x, kick.target.y, 26, [scorer.c1, scorer.c2, "#ffffff", "#ffd24a"]);
    } else if (kick.outcome === "save") { SFX.save(); HAPTIC.medium(); }
    else { SFX.miss(); HAPTIC.light(); }
  }

  function afterResult() {
    if (decided()) {
      finished = true; phase = "over"; phaseT = 0;
      const playerWon = pScore > cScore;
      setTimeout(() => {
        stop();
        onFinish({
          playerScore: pScore, cpuScore: cScore, playerWon,
          pTaken: pKicks, pGoals: pScore, kFaced: cKicks, kSaved,
        });
      }, 1300);
    } else {
      beginKick();
    }
  }

  // ===================================================================
  //  UPDATE
  // ===================================================================
  function update(dt) {
    phaseT += dt;
    if (phase === "kickIntro") {
      if (phaseT > 0.95) {
        if (kicker === "player") { phase = "aimX"; }
        else { kick = buildCpuShot(); phase = "keeperWindow"; }
        phaseT = 0;
      }
    } else if (phase === "aimX") {
      aimX += sweepDir * SWEEP_X * dt;
      if (aimX > GOAL.x1 + 30) { aimX = GOAL.x1 + 30; sweepDir = -1; }
      if (aimX < GOAL.x0 - 30) { aimX = GOAL.x0 - 30; sweepDir = 1; }
    } else if (phase === "aimY") {
      aimY += sweepDir * SWEEP_Y * dt;
      if (aimY > GOAL.bot - 6) { aimY = GOAL.bot - 6; sweepDir = -1; }
      if (aimY < GOAL.top - 22) { aimY = GOAL.top - 22; sweepDir = 1; }
    } else if (phase === "keeperWindow") {
      if (phaseT > KEEPER_WINDOW) { lockDive(null); }
    } else if (phase === "strike") {
      animateStrike(dt);
    } else if (phase === "kickResult") {
      if (phaseT > 1.0) afterResult();
    }
    updateParticles(dt);
  }

  // strike animation: ball travels SPOT -> target, keeper dives.
  let strikeT = 0, strikeDur = 0.5, contactDone = false;
  function startStrike() {
    SFX.kick();
    phase = "strike"; phaseT = 0; strikeT = 0; contactDone = false;
    strikeDur = kick.outcome === "goal" ? 0.46 : 0.52;
    // keeper dives to its reconciled visual point so it agrees with the outcome
    const kp = kick.keeperPoint || { x: VW / 2, y: 214 };
    const col = kp.x < 440 ? "left" : kp.x > 520 ? "right" : "center";
    const high = kp.y < GOAL_MIDY;
    keeperPose = { x: kp.x, y: kp.y, col, row: high ? "high" : "low", t: 0, diving: col !== "center" || high };
  }
  function animateStrike(dt) {
    strikeT += dt;
    const t = clamp(strikeT / strikeDur, 0, 1);
    const e = easeOut(t);
    ball.x = lerp(SPOT.x, kick.target.x, e);
    // perspective arc: lift slightly mid-flight for high shots
    const baseY = lerp(SPOT.y, kick.target.y, e);
    const lift = kick.target.y < GOAL_MIDY ? Math.sin(t * Math.PI) * 26 : Math.sin(t * Math.PI) * 8;
    ball.y = baseY - lift;
    ball.r = lerp(22, 9, e);
    keeperPose.t = Math.min(1, keeperPose.t + dt / 0.34);

    if (!contactDone && t >= 1) {
      contactDone = true;
      applyKick();
      phase = "kickResult"; phaseT = 0;
    }
  }

  // ===================================================================
  //  INPUT
  // ===================================================================
  function lockAim() {
    SFX.lock(); HAPTIC.light();
    if (phase === "aimX") { phase = "aimY"; phaseT = 0; sweepDir = 1; aimY = GOAL_MIDY; }
    else if (phase === "aimY") { resolvePlayerShot(); startStrike(); }
  }
  function lockDive(zone) {
    if (phase !== "keeperWindow") return;
    SFX.dive(); HAPTIC.light();
    keeperZone = zone || { col: "center", row: "low" };
    resolveCpuShotVsDive();
    startStrike();
  }

  function zoneFromPoint(x, y) {
    // map a click on / near the goal to a dive zone
    const col = x < (GOAL.x0 + GOAL.x1) / 2 - 60 ? "left"
      : x > (GOAL.x0 + GOAL.x1) / 2 + 60 ? "right" : "center";
    const row = y < GOAL_MIDY ? "high" : "low";
    return { col, row };
  }

  function onPointer(ev) {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = (ev.clientX !== undefined ? ev.clientX : ev.touches[0].clientX);
    const cy = (ev.clientY !== undefined ? ev.clientY : ev.touches[0].clientY);
    const x = (cx - rect.left) / rect.width * VW;
    const y = (cy - rect.top) / rect.height * VH;
    SFX.resume();
    // mute toggle (top-right) — handle before gameplay taps
    if (x >= MUTE_BTN.x && x <= MUTE_BTN.x + MUTE_BTN.w && y >= MUTE_BTN.y && y <= MUTE_BTN.y + MUTE_BTN.h) {
      SFX.setMuted(!SFX.muted()); return;
    }
    if (phase === "aimX" || phase === "aimY") lockAim();
    else if (phase === "keeperWindow") lockDive(zoneFromPoint(x, y));
  }
  function onKey(ev) {
    const k = ev.key.toLowerCase();
    if (k === "m") { ev.preventDefault(); SFX.setMuted(!SFX.muted()); return; }
    // Outside the interactive phases, don't swallow keys or spin up audio.
    if (phase !== "aimX" && phase !== "aimY" && phase !== "keeperWindow") return;
    SFX.resume();
    if (phase === "aimX" || phase === "aimY") {
      if (k === " " || k === "enter") { ev.preventDefault(); lockAim(); }
      return;
    }
    const map = { q: ["left", "high"], w: ["center", "high"], e: ["right", "high"],
      a: ["left", "low"], s: ["center", "low"], d: ["right", "low"] };
    if (map[k]) { ev.preventDefault(); lockDive({ col: map[k][0], row: map[k][1] }); }
  }

  canvas.addEventListener("mousedown", onPointer);
  canvas.addEventListener("touchstart", onPointer, { passive: false });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", fitCanvas);

  // ===================================================================
  //  RENDER
  // ===================================================================
  function render() {
    ctx.clearRect(0, 0, VW, VH);
    drawStadium();
    drawPitch();
    drawGoalBack();
    // keeper draws between net and ball
    drawKeeper();
    drawGoalFrame();
    drawBall();
    drawParticles();
    if (phase === "aimX" || phase === "aimY") drawReticle();
    if (phase === "keeperWindow") drawDiveHints();
    drawScoreboard();
    drawMuteButton();
    drawPrompt();
    if (resultFlash && (phase === "kickResult" || phase === "over")) drawResultFlash();
    if (phase === "over") drawFinal();
  }

  function drawStadium() {
    const g = ctx.createLinearGradient(0, 0, 0, 175);
    g.addColorStop(0, "#0b1733"); g.addColorStop(1, "#27406b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, 175);
    // stands
    ctx.fillStyle = "#1d2a40"; ctx.fillRect(0, 70, VW, 70);
    ctx.fillStyle = "#161f31"; ctx.fillRect(0, 122, VW, 30);
    // crowd speckle
    for (let i = 0; i < 460; i++) {
      const x = (i * 71) % VW, row = (i * 37) % 60;
      ctx.fillStyle = ["#e9d5b0", "#c98b6b", "#d7dbe6", "#9fb0c9", "#b58b5a"][i % 5];
      ctx.globalAlpha = 0.5; ctx.fillRect(x, 74 + row, 3, 3);
    }
    ctx.globalAlpha = 1;
    // floodlight glow
    const fl = ctx.createRadialGradient(VW / 2, 40, 20, VW / 2, 120, 360);
    fl.addColorStop(0, "rgba(255,255,255,0.18)"); fl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fl; ctx.fillRect(0, 0, VW, 200);
    // advertising board
    ctx.fillStyle = "#0e1320"; ctx.fillRect(0, 150, VW, 26);
    ctx.fillStyle = "#1b2740"; ctx.fillRect(0, 150, VW, 4);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "700 15px 'Segoe UI',Arial"; ctx.textAlign = "center";
    ctx.fillText("★  P E N A L T Y   K I N G S  ★  T A K E   Y O U R   S H O T  ★", VW / 2, 168);
  }

  function drawPitch() {
    const g = ctx.createLinearGradient(0, 175, 0, VH);
    g.addColorStop(0, "#2f8a3a"); g.addColorStop(1, "#1f6a2b");
    ctx.fillStyle = g; ctx.fillRect(0, 175, VW, VH - 175);
    // perspective mowed stripes (wider as they come forward)
    for (let i = 0; i < 9; i++) {
      const y0 = 175 + (i * (VH - 175)) / 9;
      const y1 = 175 + ((i + 1) * (VH - 175)) / 9;
      if (i % 2 === 0) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(0, y0, VW, y1 - y0); }
    }
    // penalty box (trapezoid in perspective)
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(150, VH); ctx.lineTo(255, 268);
    ctx.lineTo(705, 268); ctx.lineTo(810, VH); ctx.stroke();
    // six-yard box
    ctx.beginPath();
    ctx.moveTo(330, VH - 6); ctx.lineTo(360, 262);
    ctx.lineTo(600, 262); ctx.lineTo(630, VH - 6); ctx.stroke();
    // penalty spot
    ctx.fillStyle = "#fff"; ctx.beginPath();
    ctx.ellipse(SPOT.x, SPOT.y - 6, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    // arc
    ctx.beginPath(); ctx.ellipse(SPOT.x, 372, 70, 18, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }

  // goal net + back (drawn before keeper)
  function drawGoalBack() {
    // shadowed interior so the crowd / ad boards don't bleed through the net
    const g = ctx.createLinearGradient(0, GOAL.top, 0, GOAL.bot);
    g.addColorStop(0, "rgba(6,14,10,0.62)"); g.addColorStop(1, "rgba(8,20,14,0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(GOAL.x0, GOAL.top, GOAL.x1 - GOAL.x0, GOAL.bot - GOAL.top);
    // net mesh
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = GOAL.x0; x <= GOAL.x1; x += 15) { ctx.moveTo(x, GOAL.top); ctx.lineTo(x, GOAL.bot); }
    for (let y = GOAL.top; y <= GOAL.bot; y += 14) { ctx.moveTo(GOAL.x0, y); ctx.lineTo(GOAL.x1, y); }
    ctx.stroke();
  }

  function drawGoalFrame() {
    const postW = 9, depth = 30;
    ctx.fillStyle = "#f4f6fb";
    // side depth faces (3D)
    ctx.fillStyle = "rgba(210,218,230,0.9)";
    ctx.beginPath(); // left post depth
    ctx.moveTo(GOAL.x0 - postW, GOAL.top); ctx.lineTo(GOAL.x0 - postW - depth, GOAL.top - depth * 0.5);
    ctx.lineTo(GOAL.x0 - postW - depth, GOAL.bot - depth * 0.5); ctx.lineTo(GOAL.x0 - postW, GOAL.bot);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); // right post depth
    ctx.moveTo(GOAL.x1 + postW, GOAL.top); ctx.lineTo(GOAL.x1 + postW + depth, GOAL.top - depth * 0.5);
    ctx.lineTo(GOAL.x1 + postW + depth, GOAL.bot - depth * 0.5); ctx.lineTo(GOAL.x1 + postW, GOAL.bot);
    ctx.closePath(); ctx.fill();
    // crossbar depth
    ctx.fillStyle = "rgba(225,231,240,0.95)";
    ctx.beginPath();
    ctx.moveTo(GOAL.x0 - postW, GOAL.top); ctx.lineTo(GOAL.x0 - postW - depth, GOAL.top - depth * 0.5);
    ctx.lineTo(GOAL.x1 + postW + depth, GOAL.top - depth * 0.5); ctx.lineTo(GOAL.x1 + postW, GOAL.top);
    ctx.closePath(); ctx.fill();
    // front frame
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(GOAL.x0 - postW, GOAL.top - postW, postW, GOAL.bot - GOAL.top + postW); // left
    ctx.fillRect(GOAL.x1, GOAL.top - postW, postW, GOAL.bot - GOAL.top + postW);         // right
    ctx.fillRect(GOAL.x0 - postW, GOAL.top - postW, GOAL.x1 - GOAL.x0 + postW * 2, postW); // bar
    ctx.strokeStyle = "rgba(120,130,150,0.5)"; ctx.lineWidth = 1;
    ctx.strokeRect(GOAL.x0 - postW, GOAL.top - postW, GOAL.x1 - GOAL.x0 + postW * 2, GOAL.bot - GOAL.top + postW);
  }

  // ---- keeper ---------------------------------------------------------
  function keeperTeam() { return kicker === "player" ? cpu : player; }
  function drawKeeper() {
    const kt = keeperTeam();
    const idle = phase === "kickIntro" || (phase === "keeperWindow" && keeperPose.t === 0);
    let cx = VW / 2, cy = 232, t = keeperPose.t;
    let tx = keeperPose.x != null ? keeperPose.x : COL_X[keeperPose.col];
    let ty = keeperPose.y != null ? keeperPose.y : (keeperPose.row === "high" ? 150 : 214);
    if (idle) { tx = VW / 2; ty = 232; t = 0; }
    cx = lerp(VW / 2, tx, easeOut(t));
    cy = lerp(232, ty, easeOut(t));
    const diving = keeperPose.diving && t > 0.02 && !idle;
    const lean = keeperPose.col === "left" ? -1 : keeperPose.col === "right" ? 1 : 0;

    ctx.save();
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(cx, 262, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cx, cy);
    if (diving) ctx.rotate(lean * easeOut(t) * 1.15);
    const kit = kt.c1, trim = dark(kit) ? "#ffffff" : kt.c2;
    // legs
    ctx.strokeStyle = "#1c1c1c"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(-7, 30); ctx.moveTo(5, 8); ctx.lineTo(8, 30); ctx.stroke();
    // body
    ctx.fillStyle = kit; ctx.strokeStyle = trim; ctx.lineWidth = 2;
    roundRect(-13, -16, 26, 28, 6); ctx.fill();
    // arms (reach toward dive)
    ctx.strokeStyle = kit; ctx.lineWidth = 8;
    const reach = diving ? 30 : 18, up = keeperPose.row === "high" || idle ? -20 : -6;
    ctx.beginPath();
    ctx.moveTo(-9, -10); ctx.lineTo(-reach, up * (lean <= 0 ? 1 : 0.4) - 2);
    ctx.moveTo(9, -10); ctx.lineTo(reach, up * (lean >= 0 ? 1 : 0.4) - 2);
    ctx.stroke();
    // gloves
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath(); ctx.arc(-reach, up * (lean <= 0 ? 1 : 0.4) - 2, 5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(reach, up * (lean >= 0 ? 1 : 0.4) - 2, 5, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = "#e7b58a"; ctx.beginPath(); ctx.arc(0, -26, 8, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBall() {
    const flying = phase === "strike" || (phase === "kickResult" && kick && kick.outcome);
    const x = ball.x, y = ball.y, r = ball.r;
    // ground shadow scales with height/depth
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    const sy = Math.max(y + r * 0.6, 300);
    ctx.beginPath(); ctx.ellipse(x, Math.min(sy, SPOT.y + 8), r * 0.9, r * 0.34, 0, 0, 7); ctx.fill();
    // ball
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c9ced6");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#1c1c1c";
    const a = (x * 0.06) % (Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const ang = a + i * 1.57;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * r * 0.45, y + Math.sin(ang) * r * 0.45, r * 0.16, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  }

  function drawReticle() {
    const x = aimX, y = phase === "aimY" ? aimY : GOAL_MIDY;
    ctx.save();
    ctx.strokeStyle = phase === "aimY" ? "#ffe14d" : "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    if (phase === "aimX") { // vertical guide
      ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(x, GOAL.top - 24); ctx.lineTo(x, GOAL.bot + 4); ctx.stroke();
      ctx.setLineDash([]);
    }
    // crosshair
    ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 22, y); ctx.lineTo(x - 6, y); ctx.moveTo(x + 6, y); ctx.lineTo(x + 22, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x, y - 6); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 22);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,225,77,0.25)"; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawDiveHints() {
    ctx.save();
    ctx.font = "700 13px 'Segoe UI',Arial"; ctx.textAlign = "center";
    const keys = { left: { high: "Q", low: "A" }, center: { high: "W", low: "S" }, right: { high: "E", low: "D" } };
    ["left", "center", "right"].forEach((c) => ["high", "low"].forEach((r) => {
      const x = COL_X[c], y = r === "high" ? 158 : 222;
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      roundRect(x - 46, y - 26, 92, 52, 8); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
      roundRect(x - 46, y - 26, 92, 52, 8); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(keys[c][r], x, y + 5);
    }));
    // shrinking timer bar
    const w = clamp(1 - phaseT / KEEPER_WINDOW, 0, 1) * 300;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; roundRect(VW / 2 - 152, 290, 304, 12, 6); ctx.fill();
    ctx.fillStyle = w > 110 ? "#7ee787" : "#ff7b72"; roundRect(VW / 2 - 150, 292, w, 8, 4); ctx.fill();
    ctx.restore();
  }

  function drawScoreboard() {
    ctx.save();
    ctx.fillStyle = "rgba(8,12,22,0.82)";
    roundRect(VW / 2 - 250, 8, 500, 58, 12); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
    roundRect(VW / 2 - 250, 8, 500, 58, 12); ctx.stroke();
    // names + score
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "700 20px 'Segoe UI',Arial"; ctx.fillStyle = "#fff";
    ctx.fillText(`${pScore}  –  ${cScore}`, VW / 2, 34);
    ctx.font = "12px 'Segoe UI',Arial"; ctx.fillStyle = "#9fb0c9";
    ctx.fillText(stageLabel.toUpperCase(), VW / 2, 52);
    // left team (player)
    ctx.font = "26px 'Segoe UI Emoji'"; ctx.textAlign = "left";
    ctx.fillText(player.flag, VW / 2 - 240, 38);
    ctx.font = "700 16px 'Segoe UI',Arial"; ctx.fillStyle = "#fff";
    ctx.fillText(player.code, VW / 2 - 206, 30);
    // right team (cpu)
    ctx.font = "26px 'Segoe UI Emoji'"; ctx.textAlign = "right";
    ctx.fillText(cpu.flag, VW / 2 + 240, 38);
    ctx.font = "700 16px 'Segoe UI',Arial"; ctx.fillStyle = "#fff";
    ctx.fillText(cpu.code, VW / 2 + 206, 30);
    // pips
    drawPips(pPips, VW / 2 - 206, 48, "left");
    drawPips(cPips, VW / 2 + 206, 48, "right");
    ctx.restore();
  }
  function drawMuteButton() {
    const b = MUTE_BTN;
    ctx.save();
    ctx.fillStyle = "rgba(8,12,22,0.82)"; roundRect(b.x, b.y, b.w, b.h, 9); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; roundRect(b.x, b.y, b.w, b.h, 9); ctx.stroke();
    const cx = b.x + 13, cy = b.y + b.h / 2;
    ctx.fillStyle = "#dfe6f2";
    ctx.beginPath(); // speaker body
    ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx, cy - 4); ctx.lineTo(cx + 5, cy - 9);
    ctx.lineTo(cx + 5, cy + 9); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 4, cy + 4);
    ctx.closePath(); ctx.fill();
    if (SFX.muted()) {
      ctx.strokeStyle = "#ff7b72"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx + 10, cy - 7); ctx.lineTo(cx + 20, cy + 7);
      ctx.moveTo(cx + 20, cy - 7); ctx.lineTo(cx + 10, cy + 7); ctx.stroke();
    } else {
      ctx.strokeStyle = "#7ee787"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx + 11, cy, 5, -0.7, 0.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 11, cy, 9, -0.7, 0.7); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPips(pips, x, y, align) {
    const n = Math.max(5, pips.length), step = 13, dir = align === "left" ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const px = x + dir * i * step;
      const v = pips[i];
      ctx.beginPath(); ctx.arc(px, y, 4.5, 0, 7);
      if (v === "goal") { ctx.fillStyle = "#7ee787"; ctx.fill(); }
      else if (v === "miss") { ctx.fillStyle = "#ff7b72"; ctx.fill(); }
      else { ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }

  function drawPrompt() {
    let line1 = "", line2 = "";
    if (phase === "kickIntro") {
      if (kicker === "player") { line1 = `${player.name.toUpperCase()} TO SHOOT`; line2 = "Get ready…"; }
      else { line1 = `${cpu.name.toUpperCase()} TO SHOOT`; line2 = "Get ready to save!"; }
    } else if (phase === "aimX") { line1 = "AIM — tap / SPACE to set direction"; }
    else if (phase === "aimY") { line1 = "POWER — tap / SPACE to set height"; }
    else if (phase === "keeperWindow") { line1 = "DIVE!  tap a zone  ·  Q W E / A S D"; }
    if (!line1) return;
    ctx.save(); ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.5)"; roundRect(VW / 2 - 235, VH - 52, 470, 38, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 18px 'Segoe UI',Arial";
    ctx.fillText(line1, VW / 2, VH - 33 + (line2 ? -4 : 4));
    if (line2) { ctx.font = "13px 'Segoe UI',Arial"; ctx.fillStyle = "#cdd6e6"; ctx.fillText(line2, VW / 2, VH - 19); }
    ctx.restore();
  }

  function drawResultFlash() {
    ctx.save(); ctx.textAlign = "center";
    const big = resultFlash === "GOAL!" ? 72 : 60;
    ctx.font = `900 ${big}px 'Segoe UI',Arial`;
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = resultFlash === "GOAL!" ? "#7ee787" : resultFlash === "SAVED!" ? "#ffd24a" : "#ff7b72";
    const y = 360 + Math.sin(Math.min(phaseT, 0.3) / 0.3 * Math.PI) * -8;
    ctx.strokeText(resultFlash, VW / 2, y); ctx.fillText(resultFlash, VW / 2, y);
    ctx.restore();
  }

  function drawFinal() {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = "900 52px 'Segoe UI',Arial";
    ctx.fillText(pScore > cScore ? "YOU WIN!" : "YOU LOSE", VW / 2, VH / 2 - 6);
    ctx.font = "700 30px 'Segoe UI',Arial";
    ctx.fillText(`${player.code} ${pScore} – ${cScore} ${cpu.code}`, VW / 2, VH / 2 + 40);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ===================================================================
  //  LOOP
  // ===================================================================
  let raf = 0, last = 0, running = true;
  function frame(ts) {
    if (!running) return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    update(dt); render();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false; cancelAnimationFrame(raf);
    canvas.removeEventListener("mousedown", onPointer);
    canvas.removeEventListener("touchstart", onPointer);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", fitCanvas);
    window.removeEventListener("orientationchange", fitCanvas);
  }

  beginKick();
  raf = requestAnimationFrame(frame);
  return { destroy: stop };
}
