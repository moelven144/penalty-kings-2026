// Penalty Kings v3 — haptics. The native Capacitor plugin inside the app; the
// Vibration API where a browser has one (iPhone Safari does not, so the web
// version on iPhone is silent in the hand).
let enabled = true;
const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) || null;
const impact = (style) => { const h = plugin(); if (h) h.impact({ style }).catch(() => {}); return !!h; };
const later = (ms, fn) => setTimeout(fn, ms);

/** Each game moment has its own feel (section 5 of the plan). */
const PATTERNS = {
  // light tick when the run-up starts
  runup: () => impact('LIGHT') || vibrate(8),
  // medium on a clean strike
  strike: () => impact('MEDIUM') || vibrate(18),
  // softer for a rushed or scuffed one
  mishit: () => impact('LIGHT') || vibrate(12),
  // sharp double on a perfect strike
  perfect: () => { if (impact('HEAVY')) later(55, () => impact('HEAVY')); else vibrate([14, 40, 14]); },
  // heavy thud on a save
  save: () => { if (impact('HEAVY')) later(30, () => impact('MEDIUM')); else vibrate(45); },
  // a ring on post or bar: quick light taps dying away
  post: () => { if (impact('HEAVY')) [45, 95, 150, 215].forEach((ms) => later(ms, () => impact('LIGHT'))); else vibrate([20, 30, 12, 30, 8, 30, 6]); },
  // a long swell on a goal
  goal: () => {
    const h = plugin();
    if (h) { ['LIGHT', 'LIGHT', 'MEDIUM', 'MEDIUM', 'HEAVY', 'HEAVY'].forEach((s, i) => later(i * 70, () => impact(s))); later(480, () => h.notification({ type: 'SUCCESS' }).catch(() => {})); }
    else vibrate([10, 40, 16, 40, 24, 40, 60]);
  },
};
function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); return true; }

export const haptics = {
  get available() { return !!plugin() || !!navigator.vibrate; },
  get native() { return !!plugin(); },
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; },
  play(name) { if (enabled && PATTERNS[name]) PATTERNS[name](); },
};
