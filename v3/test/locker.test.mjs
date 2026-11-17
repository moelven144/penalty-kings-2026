// v3.1: the locker. Coins earned by playing buy looks; looks never change play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, SLOTS, itemById } from '../js/core/modes.js';
import { blankProfile, sanitise, buyItem, equipItem, grantMilestones, equippedLooks, xpForLevel, recordShootout, REWARDS } from '../js/core/profile.js';

test('every slot has a free default and at least three things to buy', () => {
  for (const slot of SLOTS) {
    const items = ITEMS.filter((it) => it.slot === slot);
    assert.ok(items.some((it) => it.price === 0 && it.unlock && it.unlock.free), slot);
    assert.ok(items.filter((it) => it.price > 0).length >= 3, slot);
    assert.ok(blankProfile().equipped[slot] && itemById(blankProfile().equipped[slot]).price === 0, slot);
  }
  assert.equal(new Set(ITEMS.map((it) => it.id)).size, ITEMS.length, 'ids are unique');
});

test('looks are looks: no item carries anything that could change play', () => {
  const allowed = ['pent', 'hex', 'seam', 'glow', 'trail', 'metal', 'style', 'color', 'pose', 'weather'];
  for (const it of ITEMS) for (const k of Object.keys(it.look)) assert.ok(allowed.includes(k), `${it.id}.${k}`);
});

test('buying costs the price, equips the item, and never goes below zero coins', () => {
  const p = blankProfile();
  p.coins = 450;
  assert.deepEqual(buyItem(p, 'ball-fire'), { ok: true });
  assert.equal(p.coins, 50);
  assert.equal(p.equipped.ball, 'ball-fire');
  assert.deepEqual(buyItem(p, 'ball-fire'), { ok: false, reason: 'owned' });
  assert.deepEqual(buyItem(p, 'stadium-neon'), { ok: false, reason: 'coins' });
  assert.equal(p.coins, 50);
  assert.ok(!p.owned.includes('stadium-neon'));
  assert.deepEqual(buyItem(p, 'nonsense'), { ok: false, reason: 'unknown' });
});

test('only owned items can be worn', () => {
  const p = blankProfile();
  assert.equal(equipItem(p, 'kit-neon'), false);
  assert.equal(p.equipped.kit, 'kit-home');
  p.owned.push('kit-neon');
  assert.equal(equipItem(p, 'kit-neon'), true);
  assert.equal(equippedLooks(p).kit.style, 'neon');
});

test('milestones unlock items for free', () => {
  const p = blankProfile();
  p.xp = xpForLevel(5);
  p.stats.saves = 100;
  const fresh = grantMilestones(p);
  assert.ok(fresh.includes('ball-night') && fresh.includes('kit-away') && fresh.includes('gloves-wall'));
  assert.ok(!fresh.includes('celebration-slide'), 'level 8 not reached');
  assert.deepEqual(grantMilestones(p), [], 'only once');
});

test('a tampered or old save cannot own unknown items or wear unowned ones', () => {
  const p = sanitise({ owned: ['ball-hacked', 'ball-gold'], equipped: { ball: 'ball-hacked', kit: 'kit-neon' } });
  assert.ok(!p.owned.includes('ball-hacked'));
  assert.ok(p.owned.includes('ball-gold'));
  assert.equal(p.equipped.kit, 'kit-home');
});

test('prices fit what a player earns: the cheapest buy is within a few shootouts', () => {
  const perShootout = REWARDS.shootoutPlayed.coins + 4 * REWARDS.goal.coins + REWARDS.save.coins;
  const cheapest = Math.min(...ITEMS.filter((it) => it.price > 0).map((it) => it.price));
  assert.ok(cheapest / perShootout <= 5, `${cheapest} coins / ${perShootout} per shootout`);
  const p = blankProfile(); recordShootout(p, true);
  assert.ok(p.coins > 0);
});
