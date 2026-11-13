# Penalty Kings v3 (rebuild in progress)

The console-style rebuild. Plan: `REBUILD_PLAN.md`. Assets and licences: `ASSETS.md`.

**Status: version 3.0, build 7.** The whole game is in: quick shootout, Daily Challenge, Road to Glory,
challenge links, tutorial, settings, share clips. Built and archived for the App Store; the upload is
waiting for an Apple account to be signed in to Xcode (see `../PUBLISH.md`). What was and was not
verified, and where it falls short of the plan: `RULES_CHECK.md`.

## Run

```bash
npm run serve:v3     # then open http://localhost:8000/v3/
npm run test:v3      # 99 tests
npm run test:v2      # the old game's 29 tests (legacy/v2)
```

On an iPhone on the same Wi-Fi: `http://<your Mac's IP>:8000/v3/`.

On a connected iPhone, inside the real app (this is what the numbers below come from):

```bash
scripts/ios-device.sh                                  # build, install, launch
scripts/ios-device.sh "auto=bench&next=shots,soak"     # benchmark every level, screenshots, 4-minute heat run
scripts/ios-device.sh "auto=play&tier=high&debug"     # plays a shootout and three Road to Glory levels by itself
node scripts/store-shots.mjs                           # the twelve raw store captures (needs the dev server running)
scripts/upload-appstore.sh                             # release archive and upload to App Store Connect
python3 scripts/collect-shots.py <log> .tmp/device/shots   # rebuild the screenshots from the log
```

The phone must be unlocked. Results come back over the cable through the app's console.

URL options: `?tier=low|medium|high|ultra` (force a quality level), `?shot=broadcast|striker|keeper|side|low|high|orbit`,
`?tm=aces|agx|neutral` (compare tone mapping), `?clean` (hide the overlay), `?nowatchdog`, `?noprobe`,
`?auto=bench|shots|soak` (development runs, see `js/dev/auto.js`).

## Layout

| Path | What |
| --- | --- |
| `js/core/ball.js` | Ball physics: drag, two-axis Magnus, spin decay, turf, round post and bar, net, launch solver (pure, tested) |
| `js/core/gesture.js` | The shooting gesture rules from section 5 of the plan, one function per rule (pure, tested) |
| `js/core/shot.js` | Shot types (normal, chip, driven, curler), stand-in keeper colliders, old-link kick conversion |
| `js/core/legacy/`, `keeper.js`, `rules.js`, `challenge.js`, `profile.js`, `modes.js`, `teams.js`, `rng.js` | v2 logic carried over with its tests; rewired in milestones (c) and (f) |
| `js/core/save.js` | The keeper: dive waypoints, body capsules the ball hits, catches, reflex (pure, tested) |
| `js/core/ai.js` | Computer striker and keeper: four levels, honest cues, read window, balance (pure, tested) |
| `js/game/match.js` | One kick with a person or the computer on either side; live outcome; slow-motion replay |
| `js/game/app.js` | Menus, shootouts, Daily Challenge, Road to Glory, challenge links, tutorial, settings, clips |
| `js/game/choreo.js` | Hand-authored joint targets: run-up, strike, cues, dives, reactions |
| `js/game/input.js` | Pointer input with coalesced samples, finger trail, latency measurement and flash probe |
| `js/game/haptics.js`, `audio.js`, `clip.js` | Haptic patterns; synthesised sound and the clip recorder (both from v2) |
| `js/render/character.js` | Skinned players: model loading, kit shader, two-bone IK |
| `js/render/net.js` | Cloth net (Verlet), pinned to the frame, carried by the ball |
| `js/dev/auto.js` | Development-only automatic device runs |
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

### The finished game, same phone, same day

- The game played itself through a quick shootout and Road to Glory levels 1 to 3 in the app on High:
  **59.7 fps average over 10,411 frames, 1% low 45.5, 1.4% of frames over 20 ms.** The hitches have not
  been traced; they are likely scene changes (kick start, replay camera cut).
- Share-clip recording works in the app (a 437 KB clip was recorded); haptics are native.
- The release build (3.0, build 7) was archived and installed, but the phone was locked, so that exact
  build was never launched. All play testing was on debug builds of the same web code.

### Gameplay cameras and milestone (b), same phone, same day

- Real presented frames over 8 s per camera (broadcast, striker, keeper, side, low), with the shooting scene
  loaded: **Medium and High: 60.0 fps, 1% low 55.6 to 58.8, no frame over 20 ms.**
  **Ultra: 49 to 53 fps** (originally 4x MSAA; with 2x MSAA and a lighter crowd 52 to 59). Ultra does not hold
  60 fps in play on this phone, so it is never picked automatically.
- The blocking "frame cost" number is not reliable on an iPhone: for the same scene it read anywhere from 8 to
  19 ms as the phone scaled its clocks. Presented frame rate is the measure that counts.
- Heat: after about 90 minutes of back-to-back automatic runs the phone was throttling: High fell to about
  53 fps idle and 48 fps during kicks. A fresh 4-minute run held 60. What a normal 15 to 20 minute play session
  does has not been measured; the watchdog lowers render scale by 10% after 3 slow seconds when it happens.
- Ten scripted swipes through the real shooting code, in the app: aim to arrival within the scatter radius,
  curler, chip (2.2 s flight, drops under the bar), driven, a full-power blast at the top corner going over,
  a wide miss, a save off the stand-in keeper's body, and the net stretching 0.43 to 0.57 m with the ball
  on hard shots (0.18 m for the chip) and settling.
- Native haptics calls reach the Capacitor plugin on the phone. Whether each pattern feels right needs a hand.
- Real touches were checked in the iOS Simulator (touch on the ball starts the run-up, the swipe is read on
  release). Touch latency could not be judged there. On the phone the HUD shows touch-to-code and
  touch-to-frame-sent times; the display's own delay needs the slow-motion camera and the flash probe.
- One gesture rule is read slightly differently from the plan's literal text, on purpose: power is the fastest
  120 ms of the swipe, but a flick shorter than 120 ms is measured over its own time (minimum 50 ms). Otherwise
  a low shot, which is a short distance on screen, could never reach driven-shot power.

Quality rules taken from these numbers (`js/core/quality.js`): each level's cost relative to the one
below it is 1.2x, 1.5x and 1.2x; the first-launch probe steps up only if the next level would use under
60% of the frame. The probe never selects Ultra; on this phone the default is High. Ultra can be chosen by hand
and runs at about 50 to 59 fps in play.
