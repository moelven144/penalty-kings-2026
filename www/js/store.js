/* =====================================================================
   PENALTY KINGS — Local persistence (localStorage)
   ---------------------------------------------------------------------
   Saves every completed tournament + lifetime career stats so the player
   keeps their history between sessions. All data stays on-device.
   ===================================================================== */

const Store = (function () {
  const KEY = "pwc2026_save_v1";

  const STAGE_RANK = { group: 1, r32: 2, r16: 3, qf: 4, sf: 5, final: 6, champion: 7 };
  const STAGE_NAME = {
    group: "Group stage", r32: "Round of 32", r16: "Round of 16",
    qf: "Quarter-final", sf: "Semi-final", final: "Final", champion: "Champion",
  };

  function blank() {
    return {
      version: 1,
      career: {
        tournaments: 0, titles: 0, finals: 0,
        matches: 0, wins: 0, losses: 0,
        penTaken: 0, penScored: 0, penFaced: 0, penSaved: 0,
        bestFinishRank: 0, bestFinishName: "—",
      },
      history: [], // newest first
    };
  }

  // ---- sanitisers: never trust on-disk data (corruption / tampering / old versions)
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const str = (v, d) => (typeof v === "string" ? v : d);
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

  function sanitizeCareer(c) {
    const base = blank().career;
    if (!isObj(c)) return base;
    for (const k in base) base[k] = (k === "bestFinishName") ? str(c[k], "—") : num(c[k]);
    return base;
  }
  function sanitizeTeam(t) {
    t = isObj(t) ? t : {};
    return { code: str(t.code, "?"), name: str(t.name, "Unknown"), flag: str(t.flag, "🏳️") };
  }
  function sanitizeRecord(r) {
    if (!isObj(r)) return null;
    return {
      date: Number.isFinite(r.date) && r.date > 0 ? r.date : null,
      team: sanitizeTeam(r.team),
      champion: !!r.champion,
      finishStage: str(r.finishStage, "group"),
      finishName: str(r.finishName, "—"),
      wins: num(r.wins), losses: num(r.losses),
      matches: Array.isArray(r.matches) ? r.matches.map((m) => {
        m = isObj(m) ? m : {};
        return { stage: str(m.stage, "group"), md: m.md, opp: sanitizeTeam(m.opp), ps: num(m.ps), os: num(m.os), won: !!m.won };
      }) : [],
      stats: {
        penTaken: num(isObj(r.stats) ? r.stats.penTaken : 0), penScored: num(isObj(r.stats) ? r.stats.penScored : 0),
        penFaced: num(isObj(r.stats) ? r.stats.penFaced : 0), penSaved: num(isObj(r.stats) ? r.stats.penSaved : 0),
      },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return blank();
      return {
        version: 1,
        career: sanitizeCareer(data.career),
        history: (Array.isArray(data.history) ? data.history : []).map(sanitizeRecord).filter(Boolean),
      };
    } catch (e) { return blank(); }
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  // ---- Daily Challenge (its own key so it never touches the save schema) ----
  const DAILY_KEY = "pk_daily_v1";
  function todayUTC() {
    const d = new Date();
    return d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0");
  }
  function loadDaily() {
    const base = { date: "", streak: 0, best: 0, plays: 0, wins: 0, lastWon: false };
    try {
      const raw = localStorage.getItem(DAILY_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (!isObj(d)) return base;
      return {
        date: str(d.date, ""), streak: num(d.streak), best: num(d.best),
        plays: num(d.plays), wins: num(d.wins), lastWon: !!d.lastWon,
      };
    } catch (e) { return base; }
  }

  return {
    STAGE_NAME,

    get() { return load(); },

    isAvailable() {
      try { const k = "__pwc_test"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }
      catch (e) { return false; }
    },

    /* Record one finished tournament.
       T            – the Tournament object (its .history holds the matches)
       finishStage  – 'champion' | 'final' | 'sf' | 'qf' | 'r16' | 'r32' | 'group'
       isChampion   – true if the player won the whole thing                */
    record(T, finishStage, isChampion) {
      const data = load();
      let pTaken = 0, pGoals = 0, kFaced = 0, kSaved = 0, wins = 0, losses = 0;
      const matches = (T.history || []).map((h) => {
        if (h.won) wins++; else losses++;
        pTaken += h.pTaken || 0; pGoals += h.pGoals || 0;
        kFaced += h.kFaced || 0; kSaved += h.kSaved || 0;
        return {
          stage: h.stage, md: h.md,
          opp: { code: h.opp.code, name: h.opp.name, flag: h.opp.flag },
          ps: h.ps, os: h.os, won: h.won,
        };
      });

      const rec = {
        date: Date.now(),
        team: { code: T.playerTeam.code, name: T.playerTeam.name, flag: T.playerTeam.flag },
        champion: !!isChampion,
        finishStage,
        finishName: isChampion ? "Champion" : (STAGE_NAME[finishStage] || finishStage),
        wins, losses,
        matches,
        stats: { penTaken: pTaken, penScored: pGoals, penFaced: kFaced, penSaved: kSaved },
      };

      data.history.unshift(rec);
      if (data.history.length > 50) data.history.length = 50;

      const c = data.career;
      c.tournaments++;
      if (isChampion) c.titles++;
      if (isChampion || finishStage === "final") c.finals++;
      c.matches += matches.length; c.wins += wins; c.losses += losses;
      c.penTaken += pTaken; c.penScored += pGoals;
      c.penFaced += kFaced; c.penSaved += kSaved;
      const rank = STAGE_RANK[finishStage] || 0;
      if (rank > c.bestFinishRank) { c.bestFinishRank = rank; c.bestFinishName = rec.finishName; }

      if (!save(data)) return null;   // surface storage failures to the caller
      return rec;
    },

    // ---- Daily Challenge API ------------------------------------------
    todayKey() { return todayUTC(); },
    getDaily() { return loadDaily(); },
    playedToday() { return loadDaily().date === todayUTC(); },
    // Record today's result once. Streak grows on a win, resets on a loss.
    recordDaily(won) {
      const d = loadDaily(), today = todayUTC();
      if (d.date === today) return d;            // idempotent — one attempt per day
      d.streak = won ? d.streak + 1 : 0;
      if (d.streak > d.best) d.best = d.streak;
      d.plays += 1; if (won) d.wins += 1;
      d.date = today; d.lastWon = !!won;
      try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) {}
      return d;
    },

    clear() {
      try { localStorage.removeItem(KEY); localStorage.removeItem(DAILY_KEY); return true; }
      catch (e) { return false; }
    },
  };
})();
