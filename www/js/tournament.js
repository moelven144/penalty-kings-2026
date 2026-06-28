/* =====================================================================
   PENALTY KINGS — Tournament engine
   ---------------------------------------------------------------------
   Drives a full tournament where EVERY match is a penalty shootout:
     • Group stage  – 12 groups of 4, each team plays 3 (no draws).
     • Qualifying   – top 2 of each group + 8 best 3rd-placed = 32.
     • Knockout      – Round of 32 → R16 → QF → SF → Final.
   The player plays their own ties interactively; all other matches are
   auto-simulated from team strength.
   ===================================================================== */

function convProb(str) {
  // Probability a single penalty is converted, by team strength.
  return Math.min(0.86, Math.max(0.55, 0.62 + (str - 75) / 220));
}

// Quick auto-simulated shootout (best of 5 + sudden death, with early stop).
function quickShootout(a, b) {
  const pa = convProb(a.str), pb = convProb(b.str);
  let sa = 0, sb = 0, ka = 0, kb = 0;
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) { if (Math.random() < pa) sa++; ka++; }
    else { if (Math.random() < pb) sb++; kb++; }
    if (sa > sb + (5 - kb)) break;
    if (sb > sa + (5 - ka)) break;
  }
  while (sa === sb) {
    const ga = Math.random() < pa ? 1 : 0;
    const gb = Math.random() < pb ? 1 : 0;
    sa += ga; sb += gb;
  }
  return sa > sb
    ? { winner: a, loser: b, ws: sa, ls: sb }
    : { winner: b, loser: a, ws: sb, ls: sa };
}

// Standard bracket seed order for n (power of 2) slots so seeds 1 & 2 meet last.
function bracketOrder(n) {
  let order = [1, 2];
  while (order.length < n) {
    const sum = order.length * 2 + 1;
    const next = [];
    for (const s of order) { next.push(s); next.push(sum - s); }
    order = next;
  }
  return order;
}

const ROUND_LABELS = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  final: "Final",
};

function Tournament(playerTeam) {
  // Fictional cup: a fresh randomized draw each tournament (not any
  // official real-world draw). Find which group the player landed in.
  const byGroup = drawGroups();
  let playerGroupLetter = GROUP_LETTERS[0];
  for (const L of GROUP_LETTERS) {
    if (byGroup[L].some((t) => t.code === playerTeam.code)) { playerGroupLetter = L; break; }
  }

  // ---- Group setup -----------------------------------------------------
  // Player's group is ordered [player, other, other, other].
  const groups = {};
  GROUP_LETTERS.forEach((L) => {
    let teams = byGroup[L].slice();
    if (L === playerGroupLetter) {
      teams = [playerTeam, ...teams.filter((t) => t.code !== playerTeam.code)];
    }
    groups[L] = {
      letter: L,
      teams,
      stats: {}, // code -> {pts,w,l,pf,pa}
    };
    teams.forEach((t) => (groups[L].stats[t.code] = { team: t, pts: 0, w: 0, l: 0, pf: 0, pa: 0 }));
  });

  // Player's three group matches, by matchday. Group order is [P,x,y,z].
  const pg = groups[playerGroupLetter].teams;
  const playerGroupMatches = [
    { md: 1, opp: pg[1] },
    { md: 2, opp: pg[2] },
    { md: 3, opp: pg[3] },
  ];
  // The "other" match played on each matchday inside the player's group.
  const otherGroupMatches = {
    1: [pg[2], pg[3]],
    2: [pg[1], pg[3]],
    3: [pg[1], pg[2]],
  };

  function applyResult(L, winner, loser, ws, ls) {
    const s = groups[L].stats;
    s[winner.code].pts += 3; s[winner.code].w += 1;
    s[winner.code].pf += ws; s[winner.code].pa += ls;
    s[loser.code].l += 1;
    s[loser.code].pf += ls; s[loser.code].pa += ws;
  }

  function tableOf(L) {
    return Object.values(groups[L].stats).sort(cmpStanding);
  }
  function cmpStanding(a, b) {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.pf - a.pa, gdB = b.pf - b.pa;
    if (gdB !== gdA) return gdB - gdA;
    if (b.pf !== a.pf) return b.pf - a.pf;
    if (b.team.str !== a.team.str) return b.team.str - a.team.str;
    return a.team.code.localeCompare(b.team.code);
  }

  const T = {
    playerTeam,
    stage: "group",
    groupMatchday: 1,
    eliminated: false,
    champion: false,
    knockout: null,   // { round:'r32'|..., alive:[teams in bracket order] }
    history: [],       // player match log

    groupLetter: playerGroupLetter,

    // ---- Queries -------------------------------------------------------
    stageLabel() {
      if (this.stage === "group") return ROUND_LABELS.group + " · Matchday " + this.groupMatchday;
      return ROUND_LABELS[this.stage] || this.stage;
    },

    getGroupTable(L) {
      return tableOf(L || playerGroupLetter).map((r, i) => ({
        pos: i + 1, team: r.team, pts: r.pts, w: r.w, l: r.l,
        pf: r.pf, pa: r.pa, gd: r.pf - r.pa,
      }));
    },

    // The next match the PLAYER must play, or null if stage needs advancing.
    getPendingMatch() {
      if (this.stage === "group") {
        const m = playerGroupMatches.find((x) => x.md === this.groupMatchday);
        if (!m) return null;
        return { stage: "group", stageLabel: this.stageLabel(), opponent: m.opp };
      }
      if (this.knockout && !this.eliminated && !this.champion) {
        const tie = this._playerTie();
        if (tie) return { stage: this.stage, stageLabel: this.stageLabel(), opponent: tie.opp };
      }
      return null;
    },

    _playerTie() {
      const a = this.knockout.alive;
      for (let i = 0; i < a.length; i += 2) {
        if (a[i].code === playerTeam.code) return { idx: i, opp: a[i + 1] };
        if (a[i + 1].code === playerTeam.code) return { idx: i, opp: a[i] };
      }
      return null;
    },

    // ---- Recording the player's result --------------------------------
    // Returns an event describing what happened next.
    recordPlayerResult(playerScore, oppScore) {
      const won = playerScore > oppScore;
      if (this.stage === "group") return this._recordGroup(playerScore, oppScore, won);
      return this._recordKnockout(playerScore, oppScore, won);
    },

    _recordGroup(ps, os, won) {
      const L = playerGroupLetter;
      const opp = playerGroupMatches.find((x) => x.md === this.groupMatchday).opp;
      if (won) applyResult(L, playerTeam, opp, ps, os);
      else applyResult(L, opp, playerTeam, os, ps);
      this.history.push({ stage: "group", md: this.groupMatchday, opp, ps, os, won });

      // Simulate the other match in the player's group on this matchday.
      const [x, y] = otherGroupMatches[this.groupMatchday];
      const r = quickShootout(x, y);
      applyResult(L, r.winner, r.loser, r.ws, r.ls);

      this.groupMatchday += 1;
      if (this.groupMatchday <= 3) {
        return { type: "next-group", won };
      }
      // Group stage over → finish all other groups & build bracket.
      return this._finishGroupStage();
    },

    _finishGroupStage() {
      // Simulate every match in the other 11 groups.
      GROUP_LETTERS.forEach((L) => {
        if (L === playerGroupLetter) return;
        const ts = groups[L].teams;
        const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
        pairs.forEach(([i, j]) => {
          const r = quickShootout(ts[i], ts[j]);
          applyResult(L, r.winner, r.loser, r.ws, r.ls);
        });
      });

      // Collect qualifiers: 1st & 2nd of each group, + 8 best 3rd-placed.
      const winners = [], runners = [], thirds = [];
      GROUP_LETTERS.forEach((L) => {
        const tbl = tableOf(L);
        winners.push(tbl[0]); runners.push(tbl[1]); thirds.push(tbl[2]);
      });
      const bestThirds = thirds.slice().sort(cmpStanding).slice(0, 8);

      // Seed: winners (1-12) > runners-up (13-24) > best thirds (25-32).
      const seedRows = [
        ...winners.slice().sort(cmpStanding),
        ...runners.slice().sort(cmpStanding),
        ...bestThirds.slice().sort(cmpStanding),
      ];
      const qualifiers = seedRows.map((r) => r.team); // index 0 = seed 1

      // Did the player qualify?
      const playerQualified = qualifiers.some((t) => t.code === playerTeam.code);

      // Arrange into bracket order (seed positions).
      const order = bracketOrder(32);
      const alive = order.map((seed) => qualifiers[seed - 1]);

      this.knockout = { alive };
      this.stage = "r32";

      if (!playerQualified) {
        this.eliminated = true;
        return { type: "group-eliminated", qualified: false, table: this.getGroupTable() };
      }
      return { type: "group-advanced", qualified: true, table: this.getGroupTable() };
    },

    _recordKnockout(ps, os, won) {
      const tie = this._playerTie();
      const opp = tie.opp;
      this.history.push({ stage: this.stage, opp, ps, os, won });

      if (!won) {
        this.eliminated = true;
        return { type: "knockout-eliminated", stage: this.stage, opponent: opp };
      }

      // Player won — resolve the rest of this round, then advance.
      const a = this.knockout.alive;
      const next = [];
      for (let i = 0; i < a.length; i += 2) {
        if (i === tie.idx) {
          next.push(playerTeam);
        } else {
          const r = quickShootout(a[i], a[i + 1]);
          next.push(r.winner);
        }
      }
      this.knockout.alive = next;

      if (next.length === 1) {
        this.champion = true;
        this.stage = "champion";
        return { type: "champion" };
      }

      const order = ["r32", "r16", "qf", "sf", "final"];
      this.stage = order[order.indexOf(this.stage) + 1];
      return { type: "knockout-advanced", stage: this.stage };
    },

    // ---- Bracket view (player path through the knockout) ---------------
    getBracketPath() {
      // Reconstruct from history for display purposes.
      const path = this.history
        .filter((h) => h.stage !== "group")
        .map((h) => ({
          round: ROUND_LABELS[h.stage], opp: h.opp, ps: h.ps, os: h.os, won: h.won,
        }));
      const pending = this.getPendingMatch();
      if (pending && pending.stage !== "group") {
        path.push({ round: ROUND_LABELS[pending.stage], opp: pending.opponent, pending: true });
      }
      return path;
    },
  };

  return T;
}
