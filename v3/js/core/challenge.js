// Penalty Kings v2 — challenge links.
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
