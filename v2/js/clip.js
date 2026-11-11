// Penalty Kings v2 — replay clips for sharing.
// Records the game canvas during each kick (swipe -> flight -> result) and
// keeps the player's best moment. Shared through the system share sheet as
// a video file, with the challenge link in the text.
// Uses only browser APIs (canvas.captureStream + MediaRecorder): free, no SDK.

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E', // Safari / iOS: MP4 plays everywhere
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export const clipsSupported = () =>
  typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && !!pickMime();

/**
 * Moment ranking: what's most worth sharing.
 * Higher = better. Style bonuses and saves in sudden death rank highest.
 */
export function momentScore({ outcome, playerShooting, styles = [], suddenDeath = false, decisive = false }) {
  let s = 0;
  if (playerShooting && outcome === 'goal') s = 10 + styles.length * 8;
  if (!playerShooting && outcome === 'save') s = 16;
  if (outcome === 'post' && playerShooting) s = 3; // funny, still shareable
  if (s && suddenDeath) s += 6;
  if (s && decisive) s += 10;
  return s;
}

export class ClipRecorder {
  /**
   * @param canvas the game's WebGL canvas
   * @param overlay optional (ctx, w, h) => void that paints branding on each frame
   */
  constructor(canvas, fps = 30, overlay = null) {
    this.canvas = canvas;
    this.fps = fps;
    this.overlay = overlay;
    // a 9:16 compositing canvas: the game view (cover-fit) plus the overlay
    this.frame = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.frame) { this.frame.width = 720; this.frame.height = 1280; }
    this.mime = pickMime();
    this.rec = null;
    this.chunks = [];
    this.best = null; // {blob, score, label}
  }

  get supported() {
    return !!this.mime && !!this.frame && !!this.frame.captureStream;
  }

  start() {
    if (!this.supported) return;
    this.cancel();
    try {
      this.paint();
      const stream = this.frame.captureStream(this.fps);
      this.chunks = [];
      this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 4_000_000 });
      this.rec.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
      this.rec.start(250);
    } catch {
      this.rec = null; // recording is a bonus; never break the game
    }
  }

  /** Copy the game view into the 9:16 frame and draw the overlay, every frame. */
  paint() {
    const ctx = this.frame.getContext('2d');
    const W = this.frame.width;
    const H = this.frame.height;
    const src = this.canvas;
    const scale = Math.max(W / src.width, H / src.height);
    const sw = W / scale;
    const sh = H / scale;
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
    if (this.overlay) this.overlay(ctx, W, H);
  }

  /** Call right after the game renders a frame (WebGL pixels are only readable then). */
  tick() {
    if (this.rec) this.paint();
  }

  /** Stop and keep the clip if it beats the best moment so far. */
  stop(score, label) {
    const rec = this.rec;
    this.rec = null;
    if (!rec || rec.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
        rec.stream.getTracks().forEach((t) => t.stop());
        if (score > 0 && (!this.best || score >= this.best.score) && blob.size > 0) {
          this.best = { blob, score, label };
        }
        resolve(blob);
      };
      rec.stop();
    });
  }

  cancel() {
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.onstop = () => this.rec?.stream.getTracks().forEach((t) => t.stop());
      try { this.rec.stop(); } catch { /* already stopped */ }
    }
    this.rec = null;
  }

  reset() {
    this.cancel();
    this.best = null;
  }
}

/** Share a clip with text + link; falls back to downloading the file. */
export async function shareClip(clip, text, url) {
  const ext = clip.blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([clip.blob], `penalty-kings.${ext}`, { type: clip.blob.type });
  const data = { files: [file], text: `${text} ${url}`, title: 'Penalty Kings' };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
