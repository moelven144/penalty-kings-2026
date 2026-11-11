// Penalty Kings v2 — game modes: Daily Challenge, Road to Glory, unlocks.
// All content is generated from seeds, so it is identical on every device
// and needs no server.

import { TEAMS } from './teams.js';
import { makeRng, hashSeed } from './rng.js';
import { insideFrame } from './physics.js';

// ---------------------------------------------------------------- daily
/** Today's fixture: same opponent, keeper and seed for everyone worldwide. */
export function dailyFixture(day) {
  const rng = makeRng(hashSeed(`pk-daily-${day}`));
  const opponent = TEAMS[Math.floor(rng.next() * TEAMS.length)];
  const twist = rng.pick(['normal', 'normal', 'sudden-death', 'top-corners', 'rain']);
  return { day, opponent: opponent.code, seed: hashSeed(`pk-daily-seed-${day}`), twist };
}

// ---------------------------------------------------------------- road to glory
export const REGIONS = [
  { id: 'europe', name: 'Europe', from: 1 },
  { id: 'americas', name: 'Americas', from: 61 },
  { id: 'africa', name: 'Africa', from: 121 },
  { id: 'asia', name: 'Asia & Oceania', from: 181 },
  { id: 'final', name: 'The Final Stage', from: 241 },
];
export const LEVEL_COUNT = 300;
export const regionOf = (n) => [...REGIONS].reverse().find((r) => n >= r.from);

/**
 * Level types. Each level states its 3 stars up front (players hate hidden
 * criteria, the main complaint about Score! Hero).
 *   score:   score at least N of 5 against a keeper
 *   targets: hit the glowing targets (zones on the goal)
 *   bend:    score with curved shots only
 *   keep:    save at least N of 5
 *   sudden:  keep scoring; stars at streak lengths
 *   panenka: score a chip down the middle past a keeper who dives
 */
const TYPES = ['score', 'targets', 'score', 'bend', 'keep', 'targets', 'sudden', 'score', 'keep', 'panenka'];

/** Difficulty 0..1 rises across the 300 levels with a saw-tooth (breathers). */
export function difficulty(n) {
  const base = (n - 1) / (LEVEL_COUNT - 1);
  const wave = ((n - 1) % 10) / 10; // within each block of 10: easy -> hard
  return Math.min(1, 0.08 + base * 0.72 + wave * 0.2);
}

/** Target zones on the goal plane, in physics coordinates (metres). */
const ZONES = {
  topLeft: { x: -2.9, y: 2.0, r: 0.55 },
  topRight: { x: 2.9, y: 2.0, r: 0.55 },
  lowLeft: { x: -2.9, y: 0.4, r: 0.6 },
  lowRight: { x: 2.9, y: 0.4, r: 0.6 },
  middleHigh: { x: 0, y: 2.0, r: 0.5 },
};

export function gloryLevel(n) {
  if (n < 1 || n > LEVEL_COUNT) return null;
  const rng = makeRng(hashSeed(`pk-glory-${n}`));
  const d = difficulty(n);
  const type = n <= 3 ? ['score', 'targets', 'keep'][n - 1] : TYPES[(n - 1) % TYPES.length];
  const keeper = { reach: 0.3 + 0.65 * d, reaction: 0.25 + 0.7 * d, reading: 0.25 + 0.65 * d };
  const shooter = { finishing: 0.35 + 0.6 * d, disguise: 0.25 + 0.65 * d };
  const opponent = TEAMS[Math.floor(rng.next() * TEAMS.length)].code;
  const level = { id: `g${n}`, n, region: regionOf(n).id, type, keeper, shooter, opponent, kicks: 5, stars: [] };
  switch (type) {
    case 'score': {
      const need = d < 0.4 ? 3 : 4;
      level.stars = [`Score ${need}`, `Score ${need + 1 > 5 ? 5 : need + 1}`, 'Score 5 with a style bonus'];
      level.need = [need, Math.min(5, need + 1), 5];
      break;
    }
    case 'targets': {
      const names = Object.keys(ZONES);
      const count = d < 0.35 ? 2 : d < 0.7 ? 3 : 4;
      const zones = [];
      while (zones.length < count) {
        const z = rng.pick(names);
        if (!zones.includes(z)) zones.push(z);
      }
      level.targets = zones;
      level.kicks = count + 2;
      level.withKeeper = d > 0.5;
      level.stars = [`Hit ${count - 1} targets`, `Hit all ${count}`, `Hit all ${count} with kicks to spare`];
      level.need = [count - 1, count, count];
      break;
    }
    case 'bend':
      level.stars = ['Score 2 curved shots', 'Score 3 curved shots', 'Score 4 curved shots'];
      level.need = [2, 3, 4];
      break;
    case 'keep': {
      const need = d < 0.4 ? 1 : 2;
      level.stars = [`Save ${need}`, `Save ${need + 1}`, `Save ${need + 2}`];
      level.need = [need, need + 1, need + 2];
      break;
    }
    case 'sudden':
      level.kicks = 20;
      level.stars = ['Score 3 in a row', 'Score 6 in a row', 'Score 10 in a row'];
      level.need = [3, 6, 10];
      break;
    case 'panenka':
      level.kicks = 3;
      level.keeper = { ...keeper, alwaysDives: true };
      level.stars = ['Score a Panenka', 'Score 2 Panenkas', 'Score 3 Panenkas'];
      level.need = [1, 2, 3];
      break;
  }
  return level;
}

/** Is a crossing inside a target zone? */
export function hitsZone(zoneName, crossing) {
  const z = ZONES[zoneName];
  return z && insideFrame(crossing.x, crossing.y) && Math.hypot(crossing.x - z.x, crossing.y - z.y) <= z.r;
}

/**
 * Score a finished level.
 * @param results array of {outcome, styles:[], crossing, kick} in kick order
 * @returns stars earned 0..3
 */
export function starsFor(level, results) {
  const goals = results.filter((r) => r.outcome === 'goal');
  let value;
  switch (level.type) {
    case 'score': {
      const styled = goals.some((r) => r.styles && r.styles.length);
      const s = level.need.filter((need, i) => goals.length >= need && (i < 2 || styled)).length;
      return Math.min(3, s);
    }
    case 'targets': {
      const hit = new Set();
      let usedForAll = Infinity;
      results.forEach((r, i) => {
        for (const z of level.targets) if (!hit.has(z) && hitsZone(z, r.crossing)) hit.add(z);
        if (hit.size === level.targets.length && usedForAll === Infinity) usedForAll = i + 1;
      });
      let s = 0;
      if (hit.size >= level.need[0]) s = 1;
      if (hit.size >= level.need[1]) s = 2;
      if (hit.size >= level.need[2] && usedForAll < level.kicks) s = 3;
      return s;
    }
    case 'bend':
      value = goals.filter((r) => r.styles && r.styles.includes('curve')).length;
      break;
    case 'keep':
      value = results.filter((r) => r.outcome === 'save').length;
      break;
    case 'sudden': {
      let run = 0;
      value = 0;
      for (const r of results) {
        run = r.outcome === 'goal' ? run + 1 : 0;
        value = Math.max(value, run);
      }
      break;
    }
    case 'panenka':
      value = goals.filter((r) => r.styles && r.styles.includes('panenka')).length;
      break;
    default:
      value = 0;
  }
  return level.need.filter((need) => value >= need).length;
}

/** A level is open when the previous one has at least 1 star. */
export const isUnlocked = (glory, n) => n === 1 || (glory[`g${n - 1}`] || 0) >= 1;

// ---------------------------------------------------------------- cosmetics
// Unlocked by play (level, stars, streak) or by earned coins. Nothing is sold.
export const ITEMS = [
  { id: 'ball-classic', slot: 'ball', name: 'Classic', unlock: { free: true } },
  { id: 'ball-night', slot: 'ball', name: 'Night Glow', unlock: { level: 5 } },
  { id: 'ball-fire', slot: 'ball', name: 'Fire Trail', unlock: { coins: 600 } },
  { id: 'ball-ice', slot: 'ball', name: 'Ice Cold', unlock: { scoredRun: 25 } },
  { id: 'ball-gold', slot: 'ball', name: 'Golden King', unlock: { stars: 600 } },
  { id: 'kit-home', slot: 'kit', name: 'Home', unlock: { free: true } },
  { id: 'kit-away', slot: 'kit', name: 'Away', unlock: { level: 3 } },
  { id: 'kit-retro', slot: 'kit', name: 'Retro', unlock: { coins: 800 } },
  { id: 'kit-neon', slot: 'kit', name: 'Neon', unlock: { streak: 14 } },
  { id: 'gloves-basic', slot: 'gloves', name: 'Basic', unlock: { free: true } },
  { id: 'gloves-wall', slot: 'gloves', name: 'The Wall', unlock: { saves: 100 } },
  { id: 'celebration-fist', slot: 'celebration', name: 'Fist Pump', unlock: { free: true } },
  { id: 'celebration-slide', slot: 'celebration', name: 'Knee Slide', unlock: { level: 8 } },
  { id: 'celebration-shush', slot: 'celebration', name: 'Shush', unlock: { coins: 500 } },
  { id: 'celebration-crown', slot: 'celebration', name: 'The Crown', unlock: { titles: 1 } },
  { id: 'stadium-night', slot: 'stadium', name: 'Floodlit Night', unlock: { free: true } },
  { id: 'stadium-rain', slot: 'stadium', name: 'Rainy Night', unlock: { level: 10 } },
  { id: 'stadium-snow', slot: 'stadium', name: 'Winter Classic', unlock: { stars: 150 } },
  { id: 'stadium-neon', slot: 'stadium', name: 'Neon Arena', unlock: { coins: 1500 } },
];
