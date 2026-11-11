// Penalty Kings v2 — stadium sound, synthesised with Web Audio (no audio files).
// iOS only allows audio after a user gesture, so call unlock() on the first tap.

let ctx = null;
let master = null;
let crowdGain = null;
let crowdFilter = null;
let muted = false;

function noiseBuffer(seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // brownish: warmer than white noise
    d[i] = b * 6;
  }
  return buf;
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  // the crowd bed: looping filtered noise with a slow swell
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(4);
  src.loop = true;
  crowdFilter = ctx.createBiquadFilter();
  crowdFilter.type = 'bandpass';
  crowdFilter.frequency.value = 700;
  crowdFilter.Q.value = 0.6;
  crowdGain = ctx.createGain();
  crowdGain.gain.value = 0.16;
  src.connect(crowdFilter).connect(crowdGain).connect(master);
  src.start();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

/** Crowd level 0..1 over `time` seconds (0.16 is the normal bed). */
export function crowd(level, time = 0.4) {
  if (!ctx) return;
  crowdGain.gain.setTargetAtTime(0.05 + level * 0.5, ctx.currentTime, time / 3);
  crowdFilter.frequency.setTargetAtTime(500 + level * 900, ctx.currentTime, time / 3);
}

function burst({ freq = 200, type = 'sine', attack = 0.002, decay = 0.2, gain = 0.5, sweep = 0, noise = 0, filter = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  let out = g;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    g.connect(f);
    out = f;
  }
  out.connect(master);
  if (noise) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(attack + decay + 0.05);
    const ng = ctx.createGain();
    ng.gain.value = noise;
    n.connect(ng).connect(g);
    n.start(t);
  }
  if (freq) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), t + attack + decay);
    o.connect(g);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }
}

export const sfx = {
  kick(power = 0.6) {
    burst({ freq: 140, type: 'sine', decay: 0.12, gain: 0.9, sweep: 0.4 });
    burst({ freq: 0, noise: 0.5 + power * 0.4, decay: 0.05, gain: 0.6, filter: 2500 });
  },
  net() {
    burst({ freq: 0, noise: 0.8, attack: 0.01, decay: 0.35, gain: 0.35, filter: 1800 });
  },
  post() {
    burst({ freq: 1180, type: 'triangle', decay: 0.7, gain: 0.35 });
    burst({ freq: 1720, type: 'sine', decay: 0.5, gain: 0.18 });
  },
  glove() {
    burst({ freq: 90, type: 'sine', decay: 0.1, gain: 0.8, sweep: 0.5 });
    burst({ freq: 0, noise: 0.7, decay: 0.08, gain: 0.5, filter: 1200 });
  },
  whistle() {
    burst({ freq: 2600, type: 'sine', attack: 0.02, decay: 0.35, gain: 0.18 });
  },
  roar() {
    crowd(1, 0.2);
    setTimeout(() => crowd(0.25, 2.5), 1800);
  },
  groan() {
    if (!ctx) return;
    crowd(0.45, 0.2);
    crowdFilter.frequency.setTargetAtTime(380, ctx.currentTime, 0.2);
    setTimeout(() => crowd(0.22, 1.5), 1200);
  },
  hush() {
    crowd(0.06, 0.6);
  },
  murmur() {
    crowd(0.3, 1);
  },
};
