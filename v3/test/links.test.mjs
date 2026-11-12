import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeChallenge, encodeChallenge2, decodeAny, quantise2, readAnyChallenge } from '../js/core/challenge.js';
import { legacyKickToShot, resolveShot } from '../js/core/shot.js';
import { loadProfile, saveProfile, blankProfile } from '../js/core/profile.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
const kicks2 = [0, 1, 2, 3, 4].map((i) => ({ target: { x: -3 + i * 1.5, y: 0.3 + i * 0.4 }, power: 0.3 + i * 0.15, curve: -0.8 + i * 0.4, type: ['normal', 'chip', 'driven', 'curler', 'normal'][i], grade: ['perfect', 'clean', 'rushed', 'scuffed', 'clean'][i] }));

test('version 2 links round-trip the five shots, type and strike grade', () => {
  const code = encodeChallenge2({ nation: 7, scored: 4, seed: 123456789, kicks: kicks2 });
  const c = decodeAny(code);
  assert.equal(c.version, 2); assert.equal(c.nation, 7); assert.equal(c.scored, 4); assert.equal(c.seed, 123456789);
  c.kicks.forEach((k, i) => {
    assert.deepEqual(k, quantise2(kicks2[i]), 'sender and receiver play the same shot');
    assert.ok(Math.abs(k.target.x - kicks2[i].target.x) < 0.03 && Math.abs(k.target.y - kicks2[i].target.y) < 0.02);
    assert.equal(k.type, kicks2[i].type); assert.equal(k.grade, kicks2[i].grade);
  });
  assert.ok(code.length <= 44, `short enough for a link: ${code.length}`);
});

test('old version 1 links still open, and their kicks arrive where they were aimed', () => {
  const old = [0, 1, 2, 3, 4].map((i) => ({ aimX: -0.8 + i * 0.4, aimY: 0.2 + i * 0.15, power: 0.5, curve: i % 2 ? 0.5 : 0 }));
  const c = readAnyChallenge('#c=' + encodeChallenge({ nation: 3, scored: 5, seed: 42, kicks: old }));
  assert.equal(c.version, 1); assert.equal(c.kicks.length, 5);
  for (const k of c.kicks) {
    const shot = legacyKickToShot(k.legacy);
    const r = resolveShot(shot);
    assert.ok(Math.abs(r.crossing.x - shot.target.x) < 0.06 && Math.abs(r.crossing.y - shot.target.y) < 0.06);
  }
});

test('a damaged link or one from a newer version is reported, not played', () => {
  const code = encodeChallenge2({ nation: 1, scored: 1, seed: 1, kicks: kicks2 });
  assert.deepEqual(decodeAny(code.slice(0, -3) + 'AAA'), { error: 'damaged' });
  assert.deepEqual(decodeAny(code.slice(0, 20)), { error: 'damaged' });
  assert.deepEqual(decodeAny('CQAA'), { error: 'newer' }); // first byte 9
  assert.deepEqual(decodeAny('!!!'), { error: 'damaged' });
  assert.equal(readAnyChallenge('#nothing'), null);
});

test('a v2 save is carried into v3 on first launch, and v3 then saves under its own key', () => {
  const v2 = { ...blankProfile(), xp: 4321, coins: 777, nation: 'NOR', glory: { g1: 3, g2: 2 }, onboarded: true };
  v2.streak = { ...v2.streak, count: 6 }; v2.settings = { muted: true, haptics: false };
  const s = store({ pk_profile_v2: JSON.stringify(v2) });
  const p = loadProfile(s);
  assert.equal(p.xp, 4321); assert.equal(p.coins, 777); assert.equal(p.nation, 'NOR');
  assert.deepEqual(p.glory, { g1: 3, g2: 2 }); assert.equal(p.streak.count, 6);
  assert.equal(p.settings.muted, true); assert.equal(p.settings.haptics, false);
  saveProfile(s, p);
  assert.ok(s.m.has('pk_profile_v3'));
  assert.equal(JSON.parse(s.m.get('pk_profile_v2')).xp, 4321, 'the v2 save is left untouched');
  assert.equal(loadProfile(s).xp, 4321);
});

test('a v1 save still migrates when there is no v2 or v3 save', () => {
  const s = store({ pwc2026_save_v1: JSON.stringify({ bestStreak: 9, totalGoals: 40 }) });
  const p = loadProfile(s);
  assert.ok(p && typeof p.xp === 'number');
});
