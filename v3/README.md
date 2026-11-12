# Penalty Kings v3 (rebuild in progress)

The console-style rebuild. Plan: `../v2/REBUILD_PLAN.md`. Assets and licences: `../v2/ASSETS.md`.

**Status: milestone (a) — stadium, lighting, cameras, quality levels, benchmark. No gameplay yet.**

## Run

```bash
npm run serve:v3     # then open http://localhost:8000/v3/
npm run test:v3
```

On an iPhone on the same Wi-Fi: `http://<your Mac's IP>:8000/v3/`.

URL options: `?tier=low|medium|high|ultra` (force a quality level), `?shot=broadcast|striker|keeper|side|low|high|orbit`,
`?tm=aces|agx|neutral` (compare tone mapping), `?clean` (hide the overlay), `?nowatchdog`, `?noprobe`.

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
