// Penalty Kings v2 — player profile: progression, streaks, unlocks, stats.
// Everything is EARNED. There is nothing to buy, no ads and no currency
// for sale (decision: 100% free). Stored on-device only.

const KEY = 'pk_profile_v3';
const V2_KEY = 'pk_profile_v2';
const V1_KEY = 'pwc2026_save_v1';
const V1_DAILY_KEY = 'pk_daily_v1';

export const REWARDS = {
  goal: { xp: 10, coins: 5 },
  save: { xp: 12, coins: 6 },
  topCorner: { xp: 8, coins: 4 }, // style bonus: ball in a top corner
  curve: { xp: 5, coins: 2 }, // style bonus: a bent shot that scores
  panenka: { xp: 15, coins: 8 }, // style bonus: soft chip down the middle
  shootoutWin: { xp: 50, coins: 25 },
  shootoutPlayed: { xp: 15, coins: 5 },
  dailyWin: { xp: 80, coins: 40 },
  star: { xp: 20, coins: 10 },
};

/** Cumulative XP needed to reach a level (level 1 = 0 XP). */
export const xpForLevel = (level) => Math.round(120 * Math.pow(level - 1, 1.35));
export function levelFromXp(xp) {
  let lvl = 1;
  while (lvl < 100 && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export function blankProfile() {
  return {
    version: 2,
    nation: null, // team code, chosen by the player (defaults to device region)
    xp: 0,
    coins: 0,
    stats: { kicksTaken: 0, goals: 0, kicksFaced: 0, saves: 0, shootouts: 0, wins: 0, panenkas: 0, topCorners: 0, bestScoredRun: 0, scoredRun: 0 },
    streak: { count: 0, best: 0, lastDay: null, freezes: 1 },
    daily: { lastDay: null, won: false, played: 0, wins: 0 },
    glory: {}, // level id -> stars (1..3)
    owned: ['ball-classic', 'kit-home', 'gloves-basic', 'celebration-fist', 'stadium-night'],
    equipped: { ball: 'ball-classic', kit: 'kit-home', gloves: 'gloves-basic', celebration: 'celebration-fist', stadium: 'stadium-night' },
    settings: { muted: false, haptics: true },
    onboarded: false,
    titles: 0, // tournaments won, carried over from v1
  };
}

const num = (v) => (Number.isFinite(v) ? v : 0);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Never trust stored data: fill gaps, drop junk. */
export function sanitise(raw) {
  const p = blankProfile();
  if (!isObj(raw)) return p;
  p.nation = typeof raw.nation === 'string' ? raw.nation : null;
  p.xp = Math.max(0, num(raw.xp));
  p.coins = Math.max(0, num(raw.coins));
  p.titles = Math.max(0, num(raw.titles));
  if (isObj(raw.stats)) for (const k in p.stats) p.stats[k] = Math.max(0, num(raw.stats[k]));
  if (isObj(raw.streak)) {
    p.streak.count = num(raw.streak.count);
    p.streak.best = num(raw.streak.best);
    p.streak.freezes = Math.min(3, num(raw.streak.freezes));
    p.streak.lastDay = typeof raw.streak.lastDay === 'string' ? raw.streak.lastDay : null;
  }
  if (isObj(raw.daily)) {
    p.daily.lastDay = typeof raw.daily.lastDay === 'string' ? raw.daily.lastDay : null;
    p.daily.won = !!raw.daily.won;
    p.daily.played = num(raw.daily.played);
    p.daily.wins = num(raw.daily.wins);
  }
  if (isObj(raw.glory)) for (const k in raw.glory) p.glory[k] = Math.min(3, Math.max(0, num(raw.glory[k])));
  if (Array.isArray(raw.owned)) p.owned = [...new Set([...p.owned, ...raw.owned.filter((x) => typeof x === 'string')])];
  if (isObj(raw.equipped)) for (const k in p.equipped) if (p.owned.includes(raw.equipped[k])) p.equipped[k] = raw.equipped[k];
  if (isObj(raw.settings)) {
    p.settings.muted = !!raw.settings.muted;
    p.settings.haptics = raw.settings.haptics !== false;
    p.settings.aimAid = raw.settings.aimAid !== false;
  }
  p.onboarded = !!raw.onboarded;
  return p;
}

/** Carry a v1 player's career over, so updating never feels like a reset. */
export function migrateV1(v1, v1Daily) {
  const p = blankProfile();
  const c = isObj(v1) && isObj(v1.career) ? v1.career : {};
  p.stats.kicksTaken = num(c.penTaken);
  p.stats.goals = num(c.penScored);
  p.stats.kicksFaced = num(c.penFaced);
  p.stats.saves = num(c.penSaved);
  p.stats.shootouts = num(c.matches);
  p.stats.wins = num(c.wins);
  p.titles = num(c.titles);
  // a welcome-back gift scaled to how much they played (earned, not bought)
  p.xp = Math.min(2000, p.stats.goals * 5 + p.stats.saves * 6 + p.titles * 100);
  p.coins = Math.min(1000, 100 + p.titles * 50);
  if (isObj(v1Daily)) {
    p.streak.best = num(v1Daily.best ?? v1Daily.bestStreak);
  }
  p.onboarded = true;
  return p;
}

/** Load from a Storage-like object (localStorage in the app, a Map-backed stub in tests). */
export function loadProfile(storage) {
  const read = (k) => {
    try {
      const raw = storage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const v3 = read(KEY);
  if (v3) return sanitise(v3);
  // first launch of v3 on a phone that had v2: XP, coins, stats, streak, stars, nation and settings carry over
  const v2 = read(V2_KEY);
  if (v2) return sanitise(v2);
  const v1 = read(V1_KEY);
  if (v1) return migrateV1(v1, read(V1_DAILY_KEY));
  return blankProfile();
}

export function saveProfile(storage, p) {
  try {
    storage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false; // private mode / full storage: the game still plays
  }
}

/** UTC day key, e.g. "2026-11-12". Same day for everyone worldwide. */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

function grant(p, reward, mult = 1) {
  const before = levelFromXp(p.xp);
  p.xp += Math.round(reward.xp * mult);
  p.coins += Math.round(reward.coins * mult);
  const after = levelFromXp(p.xp);
  return after > before ? after : null; // new level reached, if any
}

/**
 * Style bonuses for a scored shot (used for rewards and the result caption).
 * @param kick the kick, crossing the {x,y} where it crossed the line
 */
export function styleOf(kick, crossing) {
  const out = [];
  if (Math.abs(crossing.x) > 2.7 && crossing.y > 1.7) out.push('topCorner');
  if (Math.abs(kick.curve) >= 0.35) out.push('curve');
  if (Math.abs(crossing.x) < 0.8 && kick.power < 0.3 && crossing.y > 0.6) out.push('panenka');
  return out;
}

/**
 * Record one kick. Returns what was earned so the UI can show it.
 * @param role 'shooter' | 'keeper' (the player's role on this kick)
 */
export function recordKick(p, role, outcome, styles = []) {
  const earned = { xp: 0, coins: 0, styles: [], levelUp: null };
  const before = { xp: p.xp, coins: p.coins };
  if (role === 'shooter') {
    p.stats.kicksTaken++;
    if (outcome === 'goal') {
      p.stats.goals++;
      p.stats.scoredRun++;
      p.stats.bestScoredRun = Math.max(p.stats.bestScoredRun, p.stats.scoredRun);
      earned.levelUp = grant(p, REWARDS.goal) || earned.levelUp;
      for (const s of styles) {
        earned.levelUp = grant(p, REWARDS[s]) || earned.levelUp;
        earned.styles.push(s);
        if (s === 'panenka') p.stats.panenkas++;
        if (s === 'topCorner') p.stats.topCorners++;
      }
    } else {
      p.stats.scoredRun = 0;
    }
  } else {
    p.stats.kicksFaced++;
    if (outcome === 'save') {
      p.stats.saves++;
      earned.levelUp = grant(p, REWARDS.save) || earned.levelUp;
    }
  }
  earned.xp = p.xp - before.xp;
  earned.coins = p.coins - before.coins;
  return earned;
}

export function recordShootout(p, won) {
  p.stats.shootouts++;
  if (won) p.stats.wins++;
  const a = grant(p, REWARDS.shootoutPlayed);
  const b = won ? grant(p, REWARDS.shootoutWin) : null;
  return b || a; // new level reached, if any
}

/**
 * Daily Challenge played on `day`. Keeps the streak, spending a freeze
 * on one missed day. A freeze is re-earned every 7 days of streak.
 * @returns {{streak:number, usedFreeze:boolean, broke:boolean, firstToday:boolean}}
 */
export function recordDaily(p, day, won) {
  const s = p.streak;
  const firstToday = p.daily.lastDay !== day;
  let usedFreeze = false;
  let broke = false;
  if (firstToday) {
    const gap = s.lastDay ? daysBetween(s.lastDay, day) : null;
    if (gap === 1 || gap === null) s.count = gap === null ? 1 : s.count + 1;
    else if (gap === 2 && s.freezes > 0) {
      s.freezes--;
      usedFreeze = true;
      s.count++;
    } else if (gap > 1) {
      broke = s.count > 1;
      s.count = 1;
    }
    s.lastDay = day;
    s.best = Math.max(s.best, s.count);
    if (s.count % 7 === 0) s.freezes = Math.min(3, s.freezes + 1);
    p.daily.lastDay = day;
    p.daily.played++;
    p.daily.won = won;
    if (won) {
      p.daily.wins++;
      grant(p, REWARDS.dailyWin);
    }
  }
  return { streak: s.count, usedFreeze, broke, firstToday };
}

/** Stars for a Road to Glory level; only improvements pay out. */
export function recordGlory(p, levelId, stars) {
  const prev = p.glory[levelId] || 0;
  if (stars <= prev) return { newStars: 0 };
  p.glory[levelId] = stars;
  const gained = stars - prev;
  grant(p, REWARDS.star, gained);
  return { newStars: gained };
}

export const totalStars = (p) => Object.values(p.glory).reduce((a, b) => a + b, 0);
