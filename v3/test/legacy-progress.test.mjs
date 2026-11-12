import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankProfile, loadProfile, saveProfile, recordKick, recordShootout, recordDaily, recordGlory,
  levelFromXp, xpForLevel, styleOf, sanitise,
} from '../js/core/profile.js';
import { dailyFixture, gloryLevel, starsFor, isUnlocked, LEVEL_COUNT, ITEMS, difficulty } from '../js/core/modes.js';
import { TEAMS } from '../js/core/teams.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('new players get a clean profile; it saves and loads', () => {
  const st = memStorage();
  const p = loadProfile(st);
  assert.equal(p.xp, 0);
  p.coins = 42;
  assert.ok(saveProfile(st, p));
  assert.equal(loadProfile(st).coins, 42);
});

test('v1 players keep their career when they update', () => {
  const v1 = { version: 1, career: { penTaken: 40, penScored: 30, penFaced: 40, penSaved: 9, matches: 8, wins: 5, titles: 1 } };
  const p = loadProfile(memStorage({ pwc2026_save_v1: JSON.stringify(v1), pk_daily_v1: JSON.stringify({ best: 6 }) }));
  assert.equal(p.stats.goals, 30);
  assert.equal(p.titles, 1);
  assert.equal(p.streak.best, 6);
  assert.ok(p.xp > 0 && p.coins > 0, 'welcome-back gift');
  assert.ok(p.onboarded);
});

test('corrupt or hostile save data cannot break the game', () => {
  assert.equal(loadProfile(memStorage({ pk_profile_v2: '{not json' })).xp, 0);
  const p = sanitise({ xp: -50, coins: 'lots', equipped: { ball: 'ball-hacked' }, glory: { g1: 99 } });
  assert.equal(p.xp, 0);
  assert.equal(p.coins, 0);
  assert.equal(p.equipped.ball, 'ball-classic');
  assert.equal(p.glory.g1, 3);
});

test('levels need steadily more XP', () => {
  assert.equal(levelFromXp(0), 1);
  for (let l = 2; l < 50; l++) assert.ok(xpForLevel(l + 1) > xpForLevel(l));
  assert.equal(levelFromXp(xpForLevel(10)), 10);
});

test('goals, saves and style bonuses pay out; misses break the run', () => {
  const p = blankProfile();
  const e = recordKick(p, 'shooter', 'goal', ['topCorner']);
  assert.equal(e.xp, 18);
  assert.deepEqual(e.styles, ['topCorner']);
  recordKick(p, 'shooter', 'goal');
  assert.equal(p.stats.scoredRun, 2);
  recordKick(p, 'shooter', 'save');
  assert.equal(p.stats.scoredRun, 0);
  assert.equal(p.stats.bestScoredRun, 2);
  assert.ok(recordKick(p, 'keeper', 'save').xp > 0);
});

test('a win pays both the played and the win reward', () => {
  const p = blankProfile();
  recordShootout(p, true);
  assert.equal(p.xp, 65);
  assert.equal(p.stats.wins, 1);
});

test('style detection: top corner, curve, Panenka', () => {
  assert.deepEqual(styleOf({ curve: 0, power: 0.6 }, { x: 3.0, y: 2.0 }), ['topCorner']);
  assert.deepEqual(styleOf({ curve: 0.5, power: 0.6 }, { x: 1, y: 1 }), ['curve']);
  assert.deepEqual(styleOf({ curve: 0, power: 0.2 }, { x: 0.1, y: 1.1 }), ['panenka']);
});

test('daily streak: grows, a freeze covers one missed day, a long gap resets', () => {
  const p = blankProfile();
  assert.equal(recordDaily(p, '2026-11-12', true).streak, 1);
  assert.equal(recordDaily(p, '2026-11-13', false).streak, 2);
  assert.equal(recordDaily(p, '2026-11-13', true).firstToday, false); // replay same day counts once
  const f = recordDaily(p, '2026-11-15', true); // missed the 14th
  assert.ok(f.usedFreeze);
  assert.equal(f.streak, 3);
  const r = recordDaily(p, '2026-11-20', true);
  assert.ok(r.broke);
  assert.equal(r.streak, 1);
  assert.equal(p.streak.best, 3);
});

test('daily fixture is the same for everyone on a day and changes daily', () => {
  assert.deepEqual(dailyFixture('2026-11-12'), dailyFixture('2026-11-12'));
  const days = new Set(Array.from({ length: 10 }, (_, i) => dailyFixture(`2026-12-${String(i + 1).padStart(2, '0')}`).opponent));
  assert.ok(days.size >= 5);
  assert.ok(TEAMS.some((t) => t.code === dailyFixture('2026-11-12').opponent));
});

test('all 300 Road to Glory levels generate, with 3 stated stars, getting harder', () => {
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const l = gloryLevel(n);
    assert.equal(l.stars.length, 3, `level ${n}`);
    assert.equal(l.need.length, 3);
  }
  assert.ok(difficulty(300) > difficulty(150) && difficulty(150) > difficulty(1));
  assert.equal(gloryLevel(0), null);
  assert.deepEqual(gloryLevel(77), gloryLevel(77));
});

test('stars: score level and keep level', () => {
  const lvl = gloryLevel(1); // score
  const goal = { outcome: 'goal', styles: [], crossing: { x: 1, y: 1 } };
  const miss = { outcome: 'save', styles: [], crossing: { x: 0, y: 1 } };
  assert.equal(starsFor(lvl, [goal, goal, goal, miss, miss]), 1);
  assert.equal(starsFor(lvl, [goal, goal, goal, goal, goal]), 2); // no style bonus, no 3rd star
  assert.equal(starsFor(lvl, [goal, goal, goal, goal, { ...goal, styles: ['curve'] }]), 3);
  const keep = gloryLevel(3);
  assert.equal(keep.type, 'keep');
  assert.equal(starsFor(keep, [miss, miss, goal, goal, goal]), keep.need.filter((n) => 2 >= n).length);
});

test('stars: targets level counts zones hit', () => {
  const lvl = gloryLevel(2);
  assert.equal(lvl.type, 'targets');
  const zoneXY = { topLeft: [-2.9, 2.0], topRight: [2.9, 2.0], lowLeft: [-2.9, 0.4], lowRight: [2.9, 0.4], middleHigh: [0, 2.0] };
  const hits = lvl.targets.map((z) => ({ outcome: 'goal', styles: [], crossing: { x: zoneXY[z][0], y: zoneXY[z][1] } }));
  assert.equal(starsFor(lvl, hits), 3); // all hit with kicks to spare
  assert.equal(starsFor(lvl, hits.slice(0, 1)), lvl.targets.length - 1 <= 1 ? 1 : 0);
});

test('levels unlock in order and replays only pay for new stars', () => {
  const p = blankProfile();
  assert.ok(isUnlocked(p.glory, 1));
  assert.ok(!isUnlocked(p.glory, 2));
  assert.equal(recordGlory(p, 'g1', 2).newStars, 2);
  assert.ok(isUnlocked(p.glory, 2));
  assert.equal(recordGlory(p, 'g1', 1).newStars, 0);
  assert.equal(recordGlory(p, 'g1', 3).newStars, 1);
});

test('every cosmetic is earnable by playing (nothing for sale)', () => {
  for (const it of ITEMS) {
    const keys = Object.keys(it.unlock);
    assert.ok(keys.every((k) => ['free', 'level', 'coins', 'stars', 'streak', 'saves', 'scoredRun', 'titles'].includes(k)), it.id);
  }
});
