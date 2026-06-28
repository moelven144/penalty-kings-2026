/* =====================================================================
   PENALTY KINGS — Game controller & screens
   Wires the menus, team select, tournament hub and result screens to
   the Tournament engine and the canvas shootout.
   ===================================================================== */

// tiny DOM helper
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    if (k === "class") e.className = props[k];
    else if (k === "html") e.innerHTML = props[k];
    else if (k.startsWith("on") && typeof props[k] === "function") e.addEventListener(k.slice(2), props[k]);
    else if (k === "style") e.setAttribute("style", props[k]);
    else e.setAttribute(k, props[k]);
  }
  kids.flat().forEach((c) => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return e;
}

const STAGE_BUMP = { group: 0, r32: 0.03, r16: 0.06, qf: 0.09, sf: 0.12, final: 0.15 };

const Game = {
  tournament: null,
  shoot: null,

  init() {
    this.canvas = document.getElementById("pitch");
    this.screens = document.getElementById("screens");
    let onboarded = false;
    try { onboarded = localStorage.getItem("pk_onboarded") === "1"; } catch (e) {}
    if (onboarded) this.showTitle();
    else this.showOnboarding(() => this.showTitle());
  },

  // ---- screen plumbing ------------------------------------------------
  setScreen(node) {
    this.canvas.style.display = "none";
    this.screens.style.display = "flex";
    this.screens.innerHTML = "";
    this.screens.appendChild(node);
  },

  // ===================================================================
  //  TITLE
  // ===================================================================
  showTitle() {
    const data = (typeof Store !== "undefined") ? Store.get() : null;
    const hasData = data && data.career.tournaments > 0;
    const daily = (typeof Store !== "undefined") ? Store.getDaily() : { streak: 0 };
    const dailyDone = (typeof Store !== "undefined") && Store.playedToday();
    const dailyLabel = dailyDone
      ? (daily.streak > 0 ? `🎯  Daily · 🔥 ${daily.streak} streak` : "🎯  Daily · played")
      : "🎯  Daily Challenge";
    const card = el("div", { class: "screen title-screen" },
      el("div", { class: "trophy" }, "🏆"),
      el("h1", { class: "title" }, "PENALTY"),
      el("h2", { class: "subtitle" }, "KINGS"),
      el("p", { class: "tagline" }, "48 nations. One trophy. Decided from the spot."),
      el("div", { class: "title-btns" },
        el("button", { class: "btn btn-primary", onclick: () => this.showSelect() }, "▶  START TOURNAMENT"),
        el("button", { class: "btn btn-daily", onclick: () => this.showDaily() }, dailyLabel),
        el("button", { class: "btn btn-ghost", onclick: () => this.showHistory() }, "📊  Career & History"),
        el("button", { class: "btn btn-ghost small", onclick: () => this.showOnboarding(() => this.showTitle()) }, "❔  How to play"),
      ),
      hasData
        ? el("div", { class: "title-stats" },
            `${data.career.tournaments} ${data.career.tournaments === 1 ? "tournament" : "tournaments"} · ${data.career.titles} 🏆 · best: ${data.career.bestFinishName}`)
        : el("div", { class: "howto" },
            el("p", null, "Pick your nation, then win every match on penalties — group stage to the final."),
            el("p", { class: "muted" }, "Shoot: tap / SPACE to lock aim & power.  Save: tap a zone or Q W E / A S D.")),
      el("p", { style: "font-size:11px;color:#7e8aa3;opacity:.7;margin-top:18px;max-width:460px;line-height:1.4;" },
        "Unofficial penalty game — not affiliated with, endorsed by, or sponsored by any football organization or competition."),
    );
    this.setScreen(card);
  },

  // ===================================================================
  //  ONBOARDING (first launch + "How to play")
  // ===================================================================
  showOnboarding(after) {
    const done = () => {
      try { localStorage.setItem("pk_onboarded", "1"); } catch (e) {}
      (after || (() => this.showTitle()))();
    };
    const step = (icon, title, body) => el("div", { class: "ob-step" },
      el("div", { class: "ob-icon" }, icon),
      el("div", null, el("div", { class: "ob-title" }, title), el("div", { class: "ob-body" }, body)),
    );
    const card = el("div", { class: "screen onboard-screen" },
      el("div", { class: "trophy" }, "⚽"),
      el("h2", { class: "ob-head" }, "How to play"),
      el("div", { class: "ob-steps" },
        step("🎯", "Shoot", "When you attack, the aim sweeps side to side, then up and down. Tap (or press SPACE) to lock each. Aim for the corners — but keep it inside the frame or you'll blaze it over."),
        step("🧤", "Save", "When it's the keeper's turn, tap a goal zone — or use Q W E / A S D — to dive. Read the striker and commit before they connect."),
        step("🏆", "Win", "Best of five, then sudden death. Win every tie from the group stage to the final to lift the trophy."),
      ),
      el("button", { class: "btn btn-primary", onclick: done }, "GOT IT  ▶"),
    );
    this.setScreen(card);
  },

  // ===================================================================
  //  DAILY CHALLENGE — one deterministic fixture per UTC day
  // ===================================================================
  dailyMatchup() {
    // Hash today's UTC date into a small PRNG so every player gets the same
    // fixture each day, and it changes at midnight UTC.
    const key = (typeof Store !== "undefined") ? Store.todayKey() : "seed";
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rng = () => {
      h += 0x6D2B79F5; let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const a = Math.floor(rng() * TEAMS.length);
    let b = Math.floor(rng() * TEAMS.length); if (b === a) b = (b + 1) % TEAMS.length;
    return { playerTeam: TEAMS[a], cpuTeam: TEAMS[b] };
  },

  showDaily() {
    const m = this.dailyMatchup();
    const d = Store.getDaily();
    const played = Store.playedToday();
    const winPct = d.plays ? Math.round((d.wins / d.plays) * 100) : 0;

    const stats = el("div", { class: "stat-grid daily-stats" },
      this.statTile("Streak 🔥", String(d.streak)),
      this.statTile("Best streak", String(d.best)),
      this.statTile("Won", `${d.wins}/${d.plays}`, winPct + "%"),
    );

    const vs = el("div", { class: "vs-big daily-vs" },
      el("div", { class: "vs-team" }, el("span", { class: "flag-xl" }, m.playerTeam.flag),
        el("div", { class: "vs-name" }, m.playerTeam.name)),
      el("div", { class: "vs-mid" }, "VS"),
      el("div", { class: "vs-team" }, el("span", { class: "flag-xl" }, m.cpuTeam.flag),
        el("div", { class: "vs-name" }, m.cpuTeam.name)),
    );

    const action = played
      ? el("div", { class: "daily-done" },
          el("div", { class: "daily-done-msg" }, d.lastWon ? "✅  You won today's challenge!" : "Today's challenge is done."),
          el("div", { class: "muted" }, "A fresh fixture unlocks at midnight UTC."))
      : el("button", { class: "btn btn-primary big", onclick: () => this.startDaily(m) }, "PLAY TODAY'S CHALLENGE  ⚽");

    const card = el("div", { class: "screen daily-screen" },
      el("div", { class: "topbar" },
        el("button", { class: "btn btn-ghost", onclick: () => this.showTitle() }, "‹ Back"),
        el("h2", null, "Daily Challenge"),
        el("span", null, ""),
      ),
      el("p", { class: "daily-tag" }, "One shootout. The same fixture for everyone, every day."),
      vs,
      action,
      el("div", { class: "panel" }, el("div", { class: "panel-title" }, "Your daily record"), stats),
    );
    this.setScreen(card);
  },

  startDaily(m) {
    this._daily = m;
    this.screens.style.display = "none";
    this.canvas.style.display = "block";
    const diff = clamp((m.cpuTeam.str - 58) / 40, 0, 1);
    if (this.shoot) this.shoot.destroy();
    this.shoot = startShootout(this.canvas, {
      playerTeam: m.playerTeam, cpuTeam: m.cpuTeam, diff, stageLabel: "Daily Challenge",
    }, (res) => this.onDailyEnd(res));
  },

  onDailyEnd(res) {
    if (this.shoot) { this.shoot.destroy(); this.shoot = null; }
    const d = Store.recordDaily(res.playerWon);
    const m = this._daily;
    const card = el("div", { class: "screen result-screen " + (res.playerWon ? "good" : "bad") },
      el("div", { class: "res-headline" }, res.playerWon ? "DAILY WON!" : "DAILY LOST"),
      el("div", { class: "res-score" },
        el("span", { class: "flag-lg" }, m.playerTeam.flag), " " + m.playerTeam.code + "  ",
        el("strong", null, `${res.playerScore} – ${res.cpuScore}`),
        "  " + m.cpuTeam.code + " ", el("span", { class: "flag-lg" }, m.cpuTeam.flag),
      ),
      el("div", { class: "res-sub" }, res.playerWon
        ? `🔥 ${d.streak}-day streak — come back tomorrow!`
        : "Streak reset — try again tomorrow."),
      el("div", { class: "end-btns" },
        el("button", { class: "btn btn-primary", onclick: () => this.showDaily() }, "View record"),
        el("button", { class: "btn btn-ghost", onclick: () => this.showTitle() }, "Main menu"),
      ),
    );
    this.setScreen(card);
  },

  // ===================================================================
  //  TEAM SELECT
  // ===================================================================
  showSelect() {
    const grid = el("div", { class: "group-grid" });
    // Flat alphabetical roster, split into tidy columns of 4. The actual
    // tournament group draw is randomized when play begins, so this is
    // just a picker — not any official tournament grouping.
    const sorted = TEAMS.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < sorted.length; i += 4) {
      const col = el("div", { class: "group-card" });
      sorted.slice(i, i + 4).forEach((t) => {
        col.appendChild(el("button", {
          class: "team-btn", onclick: () => this.startTournament(t),
        },
          el("span", { class: "flag" }, t.flag),
          el("span", { class: "tname" }, t.name),
          this.strengthDots(t.str),
        ));
      });
      grid.appendChild(col);
    }
    const card = el("div", { class: "screen select-screen" },
      el("div", { class: "topbar" },
        el("button", { class: "btn btn-ghost", onclick: () => this.showTitle() }, "‹ Back"),
        el("h2", null, "Choose your nation"),
        el("span", null, ""),
      ),
      grid,
    );
    this.setScreen(card);
  },

  strengthDots(str) {
    const n = Math.round((str - 55) / 8);  // 0..5
    const wrap = el("span", { class: "stars" });
    for (let i = 0; i < 5; i++) wrap.appendChild(el("i", { class: i < n ? "on" : "" }));
    return wrap;
  },

  startTournament(team) {
    this.tournament = Tournament(team);
    this._savedRun = false;
    this.showHub();
  },

  // ===================================================================
  //  TOURNAMENT HUB
  // ===================================================================
  showHub() {
    const T = this.tournament;
    const pending = T.getPendingMatch();

    const header = el("div", { class: "hub-header" },
      el("div", { class: "run" },
        el("span", { class: "flag-lg" }, T.playerTeam.flag),
        el("div", null,
          el("div", { class: "run-name" }, T.playerTeam.name),
          el("div", { class: "run-sub" }, "Your road to glory"),
        ),
      ),
      el("button", { class: "btn btn-ghost", onclick: () => this.confirmQuit() }, "Quit"),
    );

    const stageBanner = el("div", { class: "stage-banner" }, pending ? pending.stageLabel : T.stageLabel());

    const body = el("div", { class: "hub-body" });

    // next-match card
    if (pending) {
      const opp = pending.opponent;
      body.appendChild(el("div", { class: "match-card" },
        el("div", { class: "vs-row" },
          this.teamChip(T.playerTeam),
          el("span", { class: "vs" }, "VS"),
          this.teamChip(opp),
        ),
        el("button", { class: "btn btn-primary", onclick: () => this.showVS(opp, pending.stage, pending.stageLabel) },
          "⚽  PLAY MATCH"),
      ));
    }

    // standings or bracket
    if (T.stage === "group") body.appendChild(this.buildGroupTable());
    else body.appendChild(this.buildBracketPath());

    this.setScreen(el("div", { class: "screen hub-screen" }, header, stageBanner, body));
  },

  teamChip(t) {
    return el("div", { class: "team-chip" },
      el("span", { class: "flag-lg" }, t.flag),
      el("span", { class: "chip-code" }, t.code),
      el("span", { class: "chip-name" }, t.name),
    );
  },

  buildGroupTable() {
    const T = this.tournament;
    const rows = T.getGroupTable(T.groupLetter);
    const table = el("table", { class: "standings" },
      el("thead", null, el("tr", null,
        el("th", null, "#"), el("th", { class: "tl" }, "Group " + T.groupLetter),
        el("th", null, "W"), el("th", null, "L"), el("th", null, "PF"), el("th", null, "PA"), el("th", null, "Pts"),
      )),
    );
    const tb = el("tbody");
    rows.forEach((r) => {
      const qual = r.pos <= 2 ? "q-in" : r.pos === 3 ? "q-maybe" : "q-out";
      const me = r.team.code === T.playerTeam.code ? " me" : "";
      tb.appendChild(el("tr", { class: qual + me },
        el("td", null, String(r.pos)),
        el("td", { class: "tl" }, el("span", { class: "flag" }, r.team.flag), " " + r.team.name),
        el("td", null, String(r.w)), el("td", null, String(r.l)),
        el("td", null, String(r.pf)), el("td", null, String(r.pa)),
        el("td", { class: "pts" }, String(r.pts)),
      ));
    });
    table.appendChild(tb);
    return el("div", { class: "panel" },
      el("div", { class: "panel-title" }, "Group standings"),
      table,
      el("div", { class: "legend" },
        el("span", { class: "dot in" }), " Advance  ",
        el("span", { class: "dot maybe" }), " Best-3rd race  ",
        el("span", { class: "dot out" }), " Out"),
    );
  },

  buildBracketPath() {
    const T = this.tournament;
    const path = T.getBracketPath();
    const list = el("div", { class: "bracket" });
    if (path.length === 0) list.appendChild(el("div", { class: "muted" }, "Knockout bracket set — play your tie!"));
    path.forEach((p) => {
      let res, cls;
      if (p.pending) { res = "—"; cls = "tie pending"; }
      else { res = `${p.ps}–${p.os}`; cls = "tie " + (p.won ? "won" : "lost"); }
      list.appendChild(el("div", { class: cls },
        el("span", { class: "round" }, p.round),
        el("span", { class: "tie-opp" }, el("span", { class: "flag" }, p.opp.flag), " " + p.opp.name),
        el("span", { class: "tie-res" }, res),
      ));
    });
    return el("div", { class: "panel" },
      el("div", { class: "panel-title" }, "Your knockout road"), list);
  },

  // ===================================================================
  //  VS / KICK-OFF
  // ===================================================================
  showVS(opp, stage, stageLabel) {
    const T = this.tournament;
    const card = el("div", { class: "screen vs-screen" },
      el("div", { class: "vs-stage" }, stageLabel),
      el("div", { class: "vs-big" },
        el("div", { class: "vs-team" }, el("span", { class: "flag-xl" }, T.playerTeam.flag),
          el("div", { class: "vs-name" }, T.playerTeam.name)),
        el("div", { class: "vs-mid" }, "VS"),
        el("div", { class: "vs-team" }, el("span", { class: "flag-xl" }, opp.flag),
          el("div", { class: "vs-name" }, opp.name)),
      ),
      el("button", { class: "btn btn-primary big", onclick: () => this.startMatch(opp, stage, stageLabel) },
        "KICK OFF  ⚽"),
    );
    this.setScreen(card);
  },

  startMatch(opp, stage, stageLabel) {
    const T = this.tournament;
    this.screens.style.display = "none";
    this.canvas.style.display = "block";
    const diff = Math.max(0, Math.min(1, (opp.str - 58) / 40 + (STAGE_BUMP[stage] || 0)));
    if (this.shoot) this.shoot.destroy();
    this.shoot = startShootout(this.canvas, {
      playerTeam: T.playerTeam, cpuTeam: opp, diff, stageLabel,
    }, (res) => this.onMatchEnd(res));
  },

  onMatchEnd(res) {
    if (this.shoot) { this.shoot.destroy(); this.shoot = null; }
    const event = this.tournament.recordPlayerResult(res.playerScore, res.cpuScore);
    // attach this match's shootout stats to the freshly-pushed history entry
    const hist = this.tournament.history;
    const last = hist[hist.length - 1];
    if (last) {
      last.pTaken = res.pTaken || 0; last.pGoals = res.pGoals || 0;
      last.kFaced = res.kFaced || 0; last.kSaved = res.kSaved || 0;
    }
    this.showResult(res, event);
  },

  // persist a finished tournament exactly once
  _saveRun(finishStage, isChampion) {
    if (this._savedRun) return;
    try {
      if (typeof Store !== "undefined" && Store.isAvailable()) {
        // only mark as saved if the write actually succeeded
        this._savedRun = !!Store.record(this.tournament, finishStage, isChampion);
      } else {
        this._savedRun = true; // storage genuinely unavailable — don't retry-loop
      }
    } catch (e) { /* storage hiccup — leave unsaved so a later attempt may retry */ }
  },

  // ===================================================================
  //  RESULT
  // ===================================================================
  showResult(res, event) {
    const T = this.tournament;
    const won = res.playerWon;
    let headline, sub, next;

    switch (event.type) {
      case "next-group":
        headline = won ? "WIN!" : "LOSS"; sub = "Group stage continues"; next = () => this.showHub(); break;
      case "group-advanced":
        headline = "QUALIFIED!"; sub = "You're through to the knockout stage"; next = () => this.showHub(); break;
      case "group-eliminated":
        this._saveRun("group", false);
        headline = "ELIMINATED"; sub = "Out in the group stage"; next = () => this.showEnd(false); break;
      case "knockout-advanced":
        headline = "YOU'RE THROUGH!"; sub = "Into the " + (ROUND_LABELS[event.stage] || event.stage); next = () => this.showHub(); break;
      case "knockout-eliminated":
        this._saveRun(event.stage, false);
        headline = "KNOCKED OUT"; sub = "Beaten in the " + (ROUND_LABELS[event.stage] || event.stage); next = () => this.showEnd(false); break;
      case "champion":
        this._saveRun("champion", true);
        return this.showEnd(true);
      default:
        headline = won ? "WIN!" : "LOSS"; sub = ""; next = () => this.showHub();
    }

    const lastOpp = T.history[T.history.length - 1].opp;
    const card = el("div", { class: "screen result-screen " + (won ? "good" : "bad") },
      el("div", { class: "res-headline" }, headline),
      el("div", { class: "res-score" },
        el("span", { class: "flag-lg" }, T.playerTeam.flag), " " + T.playerTeam.code + "  ",
        el("strong", null, `${res.playerScore} – ${res.cpuScore}`),
        "  " + lastOpp.code + " ", el("span", { class: "flag-lg" }, lastOpp.flag),
      ),
      el("div", { class: "res-sub" }, sub),
      el("button", { class: "btn btn-primary", onclick: next }, "CONTINUE  ›"),
    );
    this.setScreen(card);
  },

  // ===================================================================
  //  END (champion / eliminated)
  // ===================================================================
  showEnd(champion) {
    const T = this.tournament;
    let inner;
    if (champion) {
      inner = el("div", { class: "screen end-screen champ" },
        el("div", { class: "confetti" }, "🎉"),
        el("div", { class: "big-trophy" }, "🏆"),
        el("h1", null, "CHAMPIONS!"),
        el("div", { class: "champ-team" }, el("span", { class: "flag-xl" }, T.playerTeam.flag),
          el("div", null, T.playerTeam.name)),
        el("p", { class: "tagline" }, "You lifted the trophy from the penalty spot."),
        this.runSummary(),
        el("div", { class: "end-btns" },
          el("button", { class: "btn btn-primary", onclick: () => this.showSelect() }, "Play again"),
          el("button", { class: "btn btn-ghost", onclick: () => this.showTitle() }, "Main menu"),
        ),
      );
    } else {
      inner = el("div", { class: "screen end-screen out" },
        el("div", { class: "big-trophy dim" }, "🥅"),
        el("h1", null, "TOURNAMENT OVER"),
        el("div", { class: "champ-team" }, el("span", { class: "flag-xl" }, T.playerTeam.flag),
          el("div", null, T.playerTeam.name)),
        el("p", { class: "tagline" }, "Your tournament ends here. Run it back?"),
        this.runSummary(),
        el("div", { class: "end-btns" },
          el("button", { class: "btn btn-primary", onclick: () => this.showSelect() }, "Try again"),
          el("button", { class: "btn btn-ghost", onclick: () => this.showTitle() }, "Main menu"),
        ),
      );
    }
    this.setScreen(inner);
  },

  runSummary() {
    const T = this.tournament;
    const list = el("div", { class: "summary" });
    T.history.forEach((h) => {
      const label = h.stage === "group" ? "Group MD" + h.md : (ROUND_LABELS[h.stage] || h.stage);
      list.appendChild(el("div", { class: "sum-row " + (h.won ? "w" : "l") },
        el("span", { class: "sum-stage" }, label),
        el("span", { class: "sum-opp" }, el("span", { class: "flag" }, h.opp.flag), " " + h.opp.code),
        el("span", { class: "sum-res" }, `${h.ps}–${h.os}`),
      ));
    });
    return el("div", { class: "panel" }, el("div", { class: "panel-title" }, "Your run"), list);
  },

  // ===================================================================
  //  CAREER & HISTORY
  // ===================================================================
  showHistory() {
    const data = Store.get();
    const c = data.career;
    const winPct = c.matches ? Math.round((c.wins / c.matches) * 100) : 0;
    const savePct = c.penFaced ? Math.round((c.penSaved / c.penFaced) * 100) : 0;
    const scorePct = c.penTaken ? Math.round((c.penScored / c.penTaken) * 100) : 0;

    const stats = el("div", { class: "stat-grid" },
      this.statTile("Tournaments", String(c.tournaments)),
      this.statTile("Titles 🏆", String(c.titles)),
      this.statTile("Best finish", c.bestFinishName || "—"),
      this.statTile("Match record", `${c.wins}–${c.losses}`, winPct + "% won"),
      this.statTile("Pens scored", `${c.penScored}/${c.penTaken}`, scorePct + "%"),
      this.statTile("Saves", `${c.penSaved}/${c.penFaced}`, savePct + "%"),
    );

    const histWrap = el("div", { class: "hist-list" });
    if (!data.history.length) {
      histWrap.appendChild(el("div", { class: "empty" }, "No tournaments yet — go lift the trophy! ⚽"));
    } else {
      data.history.forEach((rec) => histWrap.appendChild(this.historyCard(rec)));
    }

    const footer = el("div", { class: "hist-footer" });
    if (data.history.length) {
      footer.appendChild(el("button", {
        class: "btn btn-ghost danger", onclick: () => {
          if (confirm("Delete all saved tournaments and career stats? This cannot be undone.")) {
            Store.clear(); this.showHistory();
          }
        },
      }, "🗑  Clear all data"));
    }

    const card = el("div", { class: "screen history-screen" },
      el("div", { class: "topbar" },
        el("button", { class: "btn btn-ghost", onclick: () => this.showTitle() }, "‹ Back"),
        el("h2", null, "Career & History"),
        el("span", null, ""),
      ),
      el("div", { class: "panel" }, el("div", { class: "panel-title" }, "Career stats"), stats),
      el("div", { class: "panel" },
        el("div", { class: "panel-title" }, `Past tournaments (${data.history.length})`),
        histWrap),
      footer,
    );
    this.setScreen(card);
  },

  statTile(label, value, sub) {
    return el("div", { class: "stat-tile" },
      el("div", { class: "stat-val" }, value),
      el("div", { class: "stat-label" }, label),
      sub ? el("div", { class: "stat-sub" }, sub) : "",
    );
  },

  historyCard(rec) {
    const dt = rec.date ? new Date(rec.date) : null;
    const dateStr = dt ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
    const badge = rec.champion ? "🏆 Champion" : rec.finishName;
    const head = el("div", { class: "hist-head" },
      el("span", { class: "flag-lg" }, rec.team.flag),
      el("div", { class: "hist-team" },
        el("div", { class: "hist-name" }, rec.team.name),
        el("div", { class: "hist-date muted" }, dateStr),
      ),
      el("div", { class: "hist-right" },
        el("div", { class: "hist-badge" + (rec.champion ? " gold" : "") }, badge),
        el("div", { class: "hist-rec muted" }, `${rec.wins}–${rec.losses}  ·  ⚽${rec.stats.penScored} 🧤${rec.stats.penSaved}`),
      ),
      el("span", { class: "hist-caret" }, "⌄"),
    );
    const detail = el("div", { class: "hist-detail" });
    rec.matches.forEach((m) => {
      const label = m.stage === "group" ? "Group MD" + m.md : (Store.STAGE_NAME[m.stage] || m.stage);
      detail.appendChild(el("div", { class: "hd-row " + (m.won ? "w" : "l") },
        el("span", { class: "hd-stage" }, label),
        el("span", { class: "hd-opp" }, el("span", { class: "flag" }, m.opp.flag), " " + m.opp.code),
        el("span", { class: "hd-res" }, `${m.ps}–${m.os}`),
      ));
    });
    const card = el("div", { class: "hist-card" }, head, detail);
    head.addEventListener("click", () => card.classList.toggle("open"));
    return card;
  },

  confirmQuit() {
    if (confirm("Quit this tournament and return to the main menu?")) this.showTitle();
  },
};

window.addEventListener("DOMContentLoaded", () => Game.init());
