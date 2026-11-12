# Penalty Kings v3 (rebuild in progress)

The console-style rebuild. Plan: `../v2/REBUILD_PLAN.md`. Assets and licences: `../v2/ASSETS.md`.

**Status: milestone (a) — stadium, lighting, cameras, quality levels, benchmark. No gameplay yet.**

## Run

```bash
npm run serve:v3     # then open http://localhost:8000/v3/
npm run test:v3
```

On an iPhone on the same Wi-Fi: `http://<your Mac's IP>:8000/v3/`.

On a connected iPhone, inside the real app (this is what the numbers below come from):

```bash
scripts/ios-device.sh                                  # build, install, launch
scripts/ios-device.sh "auto=bench&next=shots,soak"     # benchmark every level, screenshots, 4-minute heat run
python3 scripts/collect-shots.py <log> .tmp/device/shots   # rebuild the screenshots from the log
```

The phone must be unlocked. Results come back over the cable through the app's console.

URL options: `?tier=low|medium|high|ultra` (force a quality level), `?shot=broadcast|striker|keeper|side|low|high|orbit`,
`?tm=aces|agx|neutral` (compare tone mapping), `?clean` (hide the overlay), `?nowatchdog`, `?noprobe`,
`?auto=bench|shots|soak` (development runs, see `js/dev/auto.js`).

## Layout

| Path | What |
| --- | --- |
| `js/core/quality.js` | Quality levels, device guess, GPU-probe refinement, frame-rate watchdog (pure, tested) |
| `js/render/layout.js` | World dimensions and the stand ring geometry (pure, tested) |
| `js/render/renderer.js` | HDR render target with MSAA, bloom, tone mapping; benchmark timing |
| `js/render/stadium.js` | Bowl, roof, floodlights, LED boards, lights, baked reflections |
| `js/render/pitch.js` | Turf shader, markings, near-camera grass, goal, ball |
| `js/render/crowd.js` | About 17,000 instanced supporters and flags, reacting per end |
| `js/render/cameras.js` | Named shots, smooth moves, title orbit |
| `js/main.js` | Milestone (a) viewer and benchmark |

World axes: the penalty spot is the origin, the shooter looks down -z, the goal line is at z = -11.

## Measured on devices

Only what was actually run is listed. Everything else is an estimate until it is measured.

### iPhone 17 Pro (iPhone18,1), in the Capacitor app (WKWebView), 12 Nov 2026

Milestone (a) scene, 10-second orbit, debug build. "Frame cost" is the time to render one
frame with the GPU forced to finish (CPU + GPU), so 16.7 ms is the limit for 60 fps.

| Level | fps (avg / 1% low) | Frame cost | Render size | Triangles | Crowd (3D people) |
| --- | --- | --- | --- | --- | --- |
| Low | 60.0 / 58.8 | 4.7 ms | 482 x 1049 | 33k | 8,300 (0) |
| Medium | 60.0 / 58.8 | 5.6 ms | 905 x 1967 | 226k | 13,400 (900) |
| High | 60.0 / 58.8 | 8.5 ms | 1085 x 2360 | 431k | 17,700 (1,800) |
| Ultra | 60.0 / 58.8 | 10.0 ms | 1206 x 2622 | 706k | 20,700 (3,000) |

- The web view presents at 60 Hz (not 120), so 60 fps is the ceiling.
- Heat: 4 minutes on Ultra held 60 fps with the frame cost flat at 8.8 to 10.7 ms. No throttling seen
  in that time; longer sessions and a hot phone are not measured.
- Tone mapping compared on the device's own renders: AgX looked washed out (grey-green pitch, low
  contrast), Neutral clipped the floodlights into blobs and pushed the grass towards neon, **ACES** kept
  contrast and colour. ACES is the default.
- What the first device run exposed and what was changed: black frames in the side and low shots (a NaN
  in the light-shaft shader, spread by bloom); grass blades far too large with a hard-edged patch; the
  crowd as flat cards; roof lamps merging into one white bar. All fixed and re-measured above.
- A first attempt with 2,000 3D supporters on Medium cost 1.9 ms extra, so the counts were set to
  900 / 1,800 / 3,000 instead of the plan's 2,000 / 5,000 / 8,000.
- Not measured: any other iPhone. Low and Medium exist for the iPhone 11 to 13, and those numbers are
  still estimates. The first-launch probe decides on those phones; it needs a run on one to confirm.

Quality rules taken from these numbers (`js/core/quality.js`): each level's cost relative to the one
below it is 1.2x, 1.5x and 1.2x; the first-launch probe steps up only if the next level would use under
60% of the frame. On this phone that lands on High (8.5 ms x 1.2 = 10.2 ms, just over the 10 ms line);
Ultra can be chosen by hand and holds 60 fps.
