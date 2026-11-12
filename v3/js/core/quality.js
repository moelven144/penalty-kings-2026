// Penalty Kings v3 — quality tiers. Pure data and logic (no DOM), so it runs in tests.

export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

/** Per-tier render settings. Starting points; tuned from real-device reports. */
export const TIERS = {
  low: {
    label: 'Low', targetFps: 30, renderScale: 0.6, maxPixelRatio: 2, msaa: 2, // MSAA is close to free on Apple's tile-based GPUs
    shadowSize: 1024, softShadows: false,
    bloom: true, bloomScale: 0.25, bloomStrength: 0.22,
    crowdDensity: 0.4, crowdMeshes: 0, flags: 12,
    grassBlades: 0, anisotropy: 2, envSize: 64, netNodes: [24, 10],
  },
  medium: {
    label: 'Medium', targetFps: 60, renderScale: 0.75, maxPixelRatio: 3, msaa: 2,
    shadowSize: 1024, softShadows: true,
    bloom: true, bloomScale: 0.5, bloomStrength: 0.25,
    crowdDensity: 0.65, crowdMeshes: 900, flags: 24,
    grassBlades: 20000, anisotropy: 4, envSize: 128, netNodes: [40, 16],
  },
  high: {
    label: 'High', targetFps: 60, renderScale: 0.9, maxPixelRatio: 3, msaa: 4,
    shadowSize: 2048, softShadows: true,
    bloom: true, bloomScale: 0.5, bloomStrength: 0.28,
    crowdDensity: 0.85, crowdMeshes: 1800, flags: 40,
    grassBlades: 45000, anisotropy: 8, envSize: 256, netNodes: [56, 22],
  },
  ultra: {
    label: 'Ultra', targetFps: 60, renderScale: 1.0, maxPixelRatio: 3, msaa: 2, // at full 3x resolution 2x MSAA is enough; 4x cost 60 fps on an iPhone 17 Pro
    shadowSize: 2048, softShadows: true,
    bloom: true, bloomScale: 0.5, bloomStrength: 0.3,
    crowdDensity: 1.0, crowdMeshes: 2400, flags: 56,
    grassBlades: 60000, anisotropy: 8, envSize: 256, netNodes: [72, 28],
  },
};

/**
 * First guess at a tier from what a web page can know about the device.
 * iPhones hide their model, so screen size (CSS points) and pixel ratio are the
 * best signals; a GPU timing probe refines this at first launch (refineTier).
 * @param {{width:number,height:number,dpr:number,cores?:number,isIOS?:boolean,isMobile?:boolean}} d
 */
export function guessTier(d) {
  const long = Math.max(d.width, d.height);
  const short = Math.min(d.width, d.height);
  if (d.isIOS) {
    if (short >= 744) return 'high'; // iPads: refined by the probe
    if (d.dpr < 3) return 'low'; // iPhone 11, XR, SE (2x screens)
    if (long <= 812) return 'medium'; // 12/13 mini, X, XS, 11 Pro
    if (long >= 852) return 'high'; // 14 Pro and newer sizes (393x852, 430x932, 402x874, 440x956)
    return 'medium'; // 390x844 and 428x926 cover 12, 13 and 14: the probe decides
  }
  if (d.isMobile) return (d.cores || 4) >= 8 ? 'medium' : 'low';
  return (d.cores || 4) >= 8 ? 'high' : 'medium';
}

/**
 * How much heavier each level is than the one below it, measured on a real
 * iPhone (see v3/README.md, "Measured on devices"). Index i = cost of
 * TIER_ORDER[i] divided by the cost of TIER_ORDER[i - 1].
 */
export const STEP_COST = [1, 1.2, 1.5, 1.2];

/**
 * Refine a tier from a measured frame cost at that tier (CPU + GPU, finished).
 * Steps down when the frame does not fit comfortably; steps up when the next
 * level, at its measured relative cost, would still use under 60% of the frame
 * (the rest is headroom for gameplay, replays and a warm phone).
 * Moves at most one step, never upward on a device guessed 'low', and never up to
 * Ultra: on the one phone measured (iPhone 17 Pro) Ultra dipped to about 50 fps in the
 * gameplay cameras, so Ultra is only ever a choice the player makes in settings.
 * @param tier current tier
 * @param frameMs measured milliseconds to render one frame
 */
export function refineTier(tier, frameMs) {
  const i = TIER_ORDER.indexOf(tier);
  const budget = 1000 / TIERS[tier].targetFps;
  if (frameMs > budget * 0.85 && i > 0) return TIER_ORDER[i - 1];
  if (i > 0 && i < TIER_ORDER.length - 2) {
    const next = TIER_ORDER[i + 1];
    if (frameMs * STEP_COST[i + 1] < (1000 / TIERS[next].targetFps) * 0.6) return next;
  }
  return tier;
}

/** Internal render size in pixels for a tier and a CSS-pixel viewport. */
export function renderSize(tier, cssWidth, cssHeight, dpr) {
  const t = TIERS[tier];
  const scale = Math.min(dpr, t.maxPixelRatio) * t.renderScale;
  return { width: Math.max(1, Math.round(cssWidth * scale)), height: Math.max(1, Math.round(cssHeight * scale)), scale };
}

/**
 * Frame-rate watchdog: lowers render scale 10% when under target for 3 s,
 * restores it slowly when there is headroom. Returns a multiplier 0.5..1.
 */
export function makeWatchdog(targetFps) {
  let scale = 1;
  let bad = 0;
  let good = 0;
  return {
    get scale() { return scale; },
    /** @param fps average over the last second */
    sample(fps) {
      if (fps < targetFps * 0.9) { bad++; good = 0; } else if (fps >= targetFps * 0.98) { good++; bad = 0; } else { bad = 0; good = 0; }
      if (bad >= 3) { scale = Math.max(0.5, +(scale * 0.9).toFixed(3)); bad = 0; return true; }
      if (good >= 12 && scale < 1) { scale = Math.min(1, +(scale / 0.95).toFixed(3)); good = 0; return true; }
      return false;
    },
  };
}
