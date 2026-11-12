// Penalty Kings v3 — challenge links. Version 1 (v2 game) links still decode;
// version 2 carries the v3 shot: where it was aimed, power, curve, shot type and strike grade.
// "I scored 4/5 for Norway. Can you save them?"
// The link carries the five kicks themselves, so no server is needed:
// the friend keeps against exactly the same shots on any device.

import { clamp } from './legacy/physics.js';

const VERSION = 1;
// value ranges for packing each kick field into one byte
const RANGES = {
  aimX: [-1.5, 1.5],
  aimY: [-0.1, 1.5],
  power: [0, 1],
  curve: [-1.2, 1.2],
};
const FIELDS = ['aimX', 'aimY', 'power', 'curve'];

const toByte = (v, [lo, hi]) => Math.round(((clamp(v, lo, hi) - lo) / (hi - lo)) * 255);
const fromByte = (b, [lo, hi]) => lo + (b / 255) * (hi - lo);

function checksum(bytes) {
  let c = 0x5a;
  for (const b of bytes) c = ((c * 31) ^ b) & 0xff;
  return c;
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/**
 * @param {{nation:number, scored:number, seed:number, kicks:import('./physics.js').Kick[]}} c
 * @returns {string} compact code for the URL (about 38 characters)
 */
export function encodeChallenge(c) {
  if (c.kicks.length !== 5) throw new Error('a challenge has exactly 5 kicks');
  const bytes = [VERSION, c.nation & 0xff, c.scored & 0xff];
  const seed = c.seed >>> 0;
  bytes.push(seed >>> 24, (seed >>> 16) & 0xff, (seed >>> 8) & 0xff, seed & 0xff);
  for (const k of c.kicks) for (const f of FIELDS) bytes.push(toByte(k[f], RANGES[f]));
  bytes.push(checksum(bytes));
  return toBase64Url(bytes);
}

/** @returns the challenge, or null if the code is damaged or from a newer version */
export function decodeChallenge(code) {
  let bytes;
  try {
    bytes = fromBase64Url(code);
  } catch {
    return null;
  }
  if (bytes.length !== 28 || bytes[0] !== VERSION) return null;
  if (checksum(bytes.slice(0, 27)) !== bytes[27]) return null;
  const seed = ((bytes[3] << 24) | (bytes[4] << 16) | (bytes[5] << 8) | bytes[6]) >>> 0;
  const kicks = [];
  for (let i = 0; i < 5; i++) {
    const k = {};
    FIELDS.forEach((f, j) => (k[f] = fromByte(bytes[7 + i * 4 + j], RANGES[f])));
    kicks.push(k);
  }
  return { nation: bytes[1], scored: bytes[2], seed, kicks };
}

/** Quantise a kick the same way the link does, so sender and receiver match. */
export function quantise(kick) {
  const q = {};
  for (const f of FIELDS) q[f] = fromByte(toByte(kick[f], RANGES[f]), RANGES[f]);
  return q;
}

export function challengeUrl(base, c) {
  return `${base}#c=${encodeChallenge(c)}`;
}

export function readChallengeFromLocation(hash) {
  const m = /[#&]c=([A-Za-z0-9_-]+)/.exec(hash || '');
  return m ? decodeChallenge(m[1]) : null;
}

// ---------------------------------------------------------------- version 2 (v3 game)
const VERSION2 = 2;
const R2 = { x: [-6, 6], y: [0, 5], power: [0, 1], curve: [-1, 1] };
const TYPES2 = ['normal', 'chip', 'driven', 'curler'];
const GRADES2 = ['perfect', 'clean', 'rushed', 'scuffed'];

/**
 * @param c {{nation:number, scored:number, seed:number, kicks:Array<{target:{x,y}, power, curve, type, grade}>}}
 *   target = where the ball was sent (after scatter), so the friend faces exactly the same five kicks
 */
export function encodeChallenge2(c) {
  if (c.kicks.length !== 5) throw new Error('a challenge has exactly 5 kicks');
  const bytes = [VERSION2, c.nation & 0xff, c.scored & 0xff];
  const seed = c.seed >>> 0;
  bytes.push(seed >>> 24, (seed >>> 16) & 0xff, (seed >>> 8) & 0xff, seed & 0xff);
  for (const k of c.kicks) {
    bytes.push(toByte(k.target.x, R2.x), toByte(k.target.y, R2.y), toByte(k.power, R2.power), toByte(k.curve, R2.curve));
    bytes.push((Math.max(0, TYPES2.indexOf(k.type)) << 2) | Math.max(0, GRADES2.indexOf(k.grade)));
  }
  bytes.push(checksum(bytes));
  return toBase64Url(bytes);
}

/** The shot a version 2 link will reproduce (what the sender should also record, so both sides match). */
export function quantise2(k) {
  return {
    target: { x: fromByte(toByte(k.target.x, R2.x), R2.x), y: fromByte(toByte(k.target.y, R2.y), R2.y) },
    power: fromByte(toByte(k.power, R2.power), R2.power),
    curve: fromByte(toByte(k.curve, R2.curve), R2.curve),
    type: TYPES2.includes(k.type) ? k.type : 'normal',
    grade: GRADES2.includes(k.grade) ? k.grade : 'clean',
  };
}

/**
 * Decode a link of either version.
 * @returns {{version, nation, scored, seed, kicks}} with v3 shots in kicks (version 1 kicks keep their
 *   old fields too, as `legacy`), or {error:'damaged'|'newer'} for a link that cannot be played
 */
export function decodeAny(code) {
  let bytes;
  try { bytes = fromBase64Url(code); } catch { return { error: 'damaged' }; }
  if (!bytes.length) return { error: 'damaged' };
  if (bytes[0] === VERSION) {
    const c = decodeChallenge(code);
    if (!c) return { error: 'damaged' };
    return { version: 1, nation: c.nation, scored: c.scored, seed: c.seed, kicks: c.kicks.map((k) => ({ legacy: k })) };
  }
  if (bytes[0] !== VERSION2) return { error: bytes[0] > VERSION2 ? 'newer' : 'damaged' };
  if (bytes.length !== 33 || checksum(bytes.slice(0, 32)) !== bytes[32]) return { error: 'damaged' };
  const seed = ((bytes[3] << 24) | (bytes[4] << 16) | (bytes[5] << 8) | bytes[6]) >>> 0;
  const kicks = [];
  for (let i = 0; i < 5; i++) {
    const o = 7 + i * 5;
    kicks.push({
      target: { x: fromByte(bytes[o], R2.x), y: fromByte(bytes[o + 1], R2.y) },
      power: fromByte(bytes[o + 2], R2.power), curve: fromByte(bytes[o + 3], R2.curve),
      type: TYPES2[(bytes[o + 4] >> 2) & 3], grade: GRADES2[bytes[o + 4] & 3],
    });
  }
  return { version: 2, nation: bytes[1], scored: bytes[2], seed, kicks };
}

/** Read `#c=...` from a URL hash: null if there is none, otherwise decodeAny()'s answer. */
export function readAnyChallenge(hash) {
  const m = /[#&]c=([A-Za-z0-9_-]+)/.exec(hash || '');
  return m ? decodeAny(m[1]) : null;
}
