# Penalty Kings v3: rebuild plan

Status: **waiting for the owner's OK. Nothing is built yet.**
Branch `v3/rebuild`. Nothing goes to `main` or App Store Connect.

## 0. Straight talk first (how-to-work rule 5)

Three things can't be done the way the brief literally says. Here is what I propose instead.

1. **"Looks like a current-generation console game."** A WKWebView on an iPhone gives us
   WebGL2 with roughly a tenth of a console's GPU budget and no hardware ray tracing. What is
   achievable, and what I'm committing to: a penalty box that reads as console-quality in a
   screenshot and in motion, because a shootout is one small, controlled scene (one goal, two
   characters, a ball, a crowd that is far away). We spend the whole budget there. It will not
   match a full 22-player console match renderer, and I won't pretend it does.
2. **Motion-captured animation.** There is no CC0 motion capture of goalkeeper dives that I can
   verify. Plan: striker run-up and kick from the CMU motion capture database (free for any use,
   see section 4), retargeted and cleaned; goalkeeper dives, saves and reactions hand-keyed on the
   skeleton with inverse kinematics so hands actually reach the ball. Hand-keyed dives can look
   very good, but they are authored, not captured.
3. **I can't run it on an iPhone or measure a real device from the cloud session.** Every
   milestone ships with a built-in benchmark screen (frame time, 1% lows, resolution, tier) and a
   touch-latency probe. You run it on your phone and send me the numbers; I tune from those.
   Until you report numbers, performance claims are estimates.

**One blocker I need you to clear:** this session can only reach GitHub and npm. Poly Haven,
Quaternius, ambientCG, Freesound and the CMU site are blocked. Section 4 lists what I'd fetch
from where. Either allow those domains in the environment's network settings, or I use the
fallback in section 4 (everything made in code, including the characters).

## 1. Engine choice

**Three.js r187 (current), WebGL2 renderer, no build step.** Reasons:

- It runs unchanged in Safari, in the GitHub Pages web version and in Capacitor's WKWebView.
- WebGL2 is solid on every iPhone from the 11 up. Three's WebGPU renderer is tempting (node
  post-processing), but it is younger, and two render paths double the testing I can't do on a device.
- The scene is small, so we don't need an engine's scene tooling. We need full control of the
  frame: one HDR target, a hand-built post chain, strict draw-call counts.
- Babylon.js and PlayCanvas were considered. Both are fine engines; neither gives a visual
  advantage here, and both are a larger download with their own asset pipelines.

Physics stays custom and deterministic (ball flight, post and bar, keeper contact), because
challenge links depend on reproducible kicks. The net is a custom Verlet cloth. No physics library.

Vendored as ES modules in `v3/vendor/` (Three core plus the few addons used: GLTFLoader,
KTX2/meshopt decoders, RGBELoader). No bundler; `index.html` loads modules directly, as v2 does.

## 2. Folder and compatibility plan

- New game is built in `v3/`. `v2/` stays untouched and playable during the rebuild.
- At the end: the old game moves to `legacy/v2/`, and `v2/index.html` becomes a tiny page that
  forwards to `../v3/` **keeping the `#c=` challenge code**, so every existing link and the
  address `https://moelven144.github.io/penalty-kings-2026/v2/` keep working.
- Capacitor `webDir` switches to `v3`. Bundle ID `com.penaltywc.game` unchanged. The UIScene
  changes in `ios/App/App/AppDelegate.swift` and `Info.plist` are not touched.
- **Old challenge links:** the v1 link format (28 bytes: nation, score, seed, five kicks as aim,
  height, power, curve) keeps its decoder and its tests. Old kicks are replayed as *targets*: the
  new physics is solved so the ball arrives where the old kick was aimed, with the old curve. New
  links use format version 2 (adds strike timing and shot type). A damaged or unknown-version
  link shows "This challenge link is from a newer version or is damaged" and offers a normal game.
- **Saves:** `pk_profile_v2` is read and migrated to `pk_profile_v3` (XP, coins, stats, streak,
  Road to Glory stars, nation, settings). The v1 migration stays too. Tests cover both.

## 3. Art direction, scene by scene

Look: a cold, clear night under hard white floodlights. Deep blue-black sky, saturated pitch,
team colours as the only strong hues. Photographic, not cartoon: realistic proportions, real
materials, restrained UI.

| Scene | What you see |
| --- | --- |
| Title | Slow orbit around the empty penalty area, floodlights flaring into the lens, crowd murmur, the crown-and-ball mark, one big Play button. |
| Walkout | 8 seconds, skippable: the two captains walk from the tunnel end to the spot, flags unfurl in both ends, the caption names the nations and the stakes. |
| Shooting (default "broadcast") | Raised camera behind and right of the striker, goal filling the upper half, keeper swaying on the line, the ball large in the lower third so the thumb starts on it. |
| Shooting (behind the striker) | Low over-the-shoulder view; optional in settings. |
| Keeping | Low camera behind the goal line, looking out through the net at the striker, so you read hips and plant foot. Net mesh is visible but thin. |
| Goal moment | Net bulges and ripples, crowd behind the goal erupts, flags and scarves up, camera shake, haptic, then a cut to the replay. |
| Replay | Two or three angles in slow motion (behind-goal low, side-on at the post, ball-follow), shallow depth of field, heavier motion blur, "REPLAY" tag, tap to skip. |
| Result | Scoreline card over a slow push-in on the celebrating side; Share clip and Challenge a friend are the two main buttons. |
| Menus, Road to Glory map, settings | Dark glass panels over the live, blurred stadium. Original type and layout; no resemblance to any console football game's menus. |

**Stadium:** a two-tier bowl with a cantilever roof and a lit roof edge, four floodlight rigs plus
roof-edge lighting, tunnel, dugout silhouettes, photographers' bibs behind the goal, LED boards
carrying only our own branding ("PENALTY KINGS", "SEND IT TO YOUR MATES"). Invented stadium; no real one is referenced.

**Crowd:** about 18,000 seats visible. Near rows (behind the goal) are instanced low-poly
people with vertex-shader animation (sit, stand, arms up, clap, scarf overhead); far rows are
animated impostor cards. Reactions are driven by game events with a wave of delay across the
stand, so it looks alive, not synchronised. Flags and scarves take the two nations' colours.

**Goal and net:** round aluminium posts with real reflections, ground sockets, stanchions.
The net is a Verlet cloth (hexagonal look via texture), pinned to the frame and ground, hit by
the ball as a sphere collider. It bulges, ripples and settles.

**Pitch:** grass albedo and normal maps with mowing stripes, wear and paint scuff around the
spot and the goal line, wet sheen under the lights, and instanced grass blades in the 6 metres
nearest the camera (Medium and above).

**Players:** realistic proportions, skinned and rigged (about 12k triangles on High), with
generated kits: shirt, shorts and socks from each nation's two colours using three generic
templates (plain, sash, hoops) chosen by a hash of the country code, a number, no crest, no
maker's mark, no sponsor. Keeper kits use a contrasting colour. Skin and hair vary.

**Rendering:** linear HDR pipeline; image-based lighting from a cube map baked from our own
stadium (so reflections match); AgX tone mapping (keeps floodlights and saturated kits from
clipping to white); cascaded soft shadows for the key floodlight plus contact shadows under
feet and ball; bloom and lens flare on floodlights; depth of field in replays; motion blur on
the ball (velocity-stretched) and on the camera in replays; SMAA plus a 1.5x to 2x render scale
for clean edges on Retina; film grain and vignette at very low strength.

## 4. Assets and licences

Rule: made by me, or CC0-equivalent with a recorded source. Every file gets a line in
`v2/ASSETS.md` (moved to `v3/ASSETS.md` at the swap) with source URL, licence and what was changed.

| Asset | Plan A (needs the blocked domains allowed) | Licence | Plan B (reachable today) |
| --- | --- | --- | --- |
| Environment light | Baked in-engine from our own stadium | Own work | Same |
| Sky | Procedural gradient and stars | Own work | Same |
| Grass, concrete, metal textures | ambientCG / Poly Haven 1k-2k PBR sets | CC0 | Procedural textures generated in code |
| Player and keeper body | Quaternius "Universal Base Characters", or a MakeHuman export, re-topologised and re-skinned | CC0 | A skinned body generated in code (parametric mesh on our own skeleton). Looks good at gameplay distance, weaker in close-up replays. |
| Striker run-up and kick motion | CMU Graphics Lab Motion Capture Database (kicks, runs), retargeted | Free for any use, no attribution required (credit given anyway) | Hand-keyed |
| Keeper set, shuffle, dives, saves, reactions | Hand-keyed with IK | Own work | Same |
| Crowd people, flags, scarves | Made in code | Own work | Same |
| Stadium, goal, boards, ball | Modelled in code | Own work | Same |
| Sound effects | Synthesised and layered in code, plus CC0 recordings (Freesound CC0 only) for crowd bed, ball strike and net | Own work / CC0 | Fully synthesised (as v2, but layered and convolved for realism) |
| Menu theme | Original, composed and rendered by me | Own work | Same |
| UI font | Inter or Barlow Condensed from the google/fonts GitHub repo | SIL OFL 1.1 (free commercial use, bundling allowed; the licence file ships with the app) | Same |
| Icons, logo, UI art | Drawn by me (SVG) | Own work | Same |

Nothing from any other game. No real kits, crests, sponsors, players or stadiums.

**My recommendation:** allow `polyhaven.com`, `dl.polyhaven.org`, `ambientcg.com`,
`quaternius.com`, `freesound.org` and `mocap.cs.cmu.edu` for this environment. Plan A gets
closer to the "console" first impression, mainly through the character body and real grass and
crowd-sound recordings. Plan B ships, but the characters in replays are where it would show.

Size estimate: 25 to 45 MB total with Plan A (KTX2 textures, meshopt-compressed models, AAC audio),
far under the 150 MB limit.

## 5. Controls: exact gesture rules

Units: swipe positions are measured in fractions of screen height, so phones and tablets feel the same.

### Shooting

1. **Start:** touch within 12% of screen height of the ball. The striker starts a 0.9 s run-up
   immediately (visible response within one frame).
2. **Aim:** keep the finger down and swipe towards the goal. A thin, fading trail follows the
   finger; a small soft marker on the goal plane shows where the current end point aims (it
   disappears after your first 10 shootouts unless kept on in settings).
3. **Direction and height:** the point where the finger is released is projected onto the goal
   plane. What you point at is what you aim at. Aiming outside the frame is allowed and misses.
4. **Power:** the fastest 120 ms of the swipe. 0.8 screen-heights per second is a pass (16 m/s);
   3.2 is maximum (34 m/s). Above 90% power the ball rises: +0.25 m at 95%, +0.7 m at 100%.
   Blasting at the top corner goes over the bar.
5. **Curve:** the sideways bulge of the swipe path against its straight line, as a fraction of
   swipe length. Below 6%: no curve. 6% to 25% maps to spin 0 to maximum, in the direction of the bulge.
6. **Strike timing:** the striker plants the standing foot at 0.9 s. Release the finger:
   - within ±60 ms of the plant: **perfect strike** (scatter x0.4, a flash and a sharper haptic);
   - within ±160 ms: **clean** (scatter x1);
   - earlier: the kick waits for the plant and is **rushed** (scatter x1.6);
   - later than +160 ms: the striker checks the stride, **scuffed** (scatter x2.2, power x0.85).
7. **Scatter (the only randomness):** a small error added to the aim point, radius =
   0.10 m + 0.45 m x power² , times the timing factor. It is seeded per kick, shown in the
   tutorial, identical for everyone, and never looks at the keeper. No hidden assistance in either direction.
8. **Skill shots** (recognised from the gesture, named generically):
   - **Chip:** a slow swipe (under 30% power) ending in the middle third, with the finger held
     still for at least 120 ms before release. High, slow, drops under the bar.
   - **Driven:** over 75% power with the release point in the lower third of the goal. Flat, fast, skids.
   - **Curler:** bulge over 15% and power 45% to 80%. Maximum bend, slight dip late.
   Anything else is a normal shot.

Ball physics: drag, Magnus force from spin about two axes (side spin and top/back spin), spin
decay, bounce and skid on the turf, true collisions with round posts and bar (inside of the
post goes in, outside comes out), and rebounds off the keeper's hands, body and legs with
energy loss, so parried saves can still creep in or be pushed onto the post.

### Saving

1. **What you read** (always physically true):
   - **Plant foot:** at the plant, the standing foot points at the side the ball goes. It never lies.
   - **Hips:** open hips mean across the body, closed hips mean the striker's natural side. True from 150 ms before the strike.
   - **Run-up angle:** a wide approach favours one side. This is a habit, not a promise; better strikers vary it.
   Difficulty changes **how late** the true cues appear and how fast the shot is, not whether they are honest.
2. **Dive:** swipe from anywhere. Direction and length give a target on the goal plane (same
   projection as shooting); the keeper dives there at up to 6.2 m/s after a 70 ms push-off.
3. **Timing:**
   - release within 0 to 90 ms after the ball is struck: **perfect dive** (speed and reach +15%);
   - later: normal dive; you simply have less time, and far corners become unreachable;
   - earlier than the striker's "read window" before the strike (shown on the striker's card:
     Rookie 0 ms, Pro 140 ms, World Class 220 ms): the striker sees you go and **switches side**,
     at 85% power and double scatter. Guessing early is a real gamble against good strikers.
4. **Contact:** hands within reach catch slow, central balls; parry fast or stretched ones;
   fingertips deflect. The outcome comes from the collision, not from a dice roll.
5. **Staying put:** not swiping keeps the keeper central, which stops chips and central drives.

### AI honesty

- **Keeper AI** (four levels): reads the same cues you would, with a reaction time (320 ms down
  to 190 ms) and a guess rate. It never sees the shot before the strike.
- **Striker AI** (four levels): picks a target and shot type before the run-up, shows the cues
  above, and can only switch if you dive inside its read window.
- A balance test in CI simulates thousands of kicks per level and fails if conversion drifts
  outside target bands (for example 70% to 80% at Medium, like real penalties).

### Tutorial, latency, haptics

- **Tutorial:** four playable beats, about 60 seconds: swipe to shoot, time the plant, bend one,
  dive to save. Each beat repeats until done once; skippable; replayable from settings.
- **Latency budget (under 50 ms, touch to visible response):** pointer events on the canvas
  with coalesced samples, no awaits or layout work on touch, the trail and the striker's first
  frame drawn in the next animation frame. At 60 Hz that is one frame (16.7 ms) plus touch
  sampling (about 8 ms) plus display scan-out. A built-in probe flashes the screen on touch so
  you can verify with the iPhone's slow-motion camera; I can't measure this from the cloud.
- **Haptics:** light tick when the run-up starts, medium on a clean strike, sharp double on a
  perfect strike, heavy thud on a save, a ring on post or bar, a long swell on a goal. One
  setting turns them off. Screen shake is small and respects Reduce Motion.

## 6. Performance budget

Default tier comes from a 2-second GPU probe at first launch plus the device's screen size and
core count; it can be changed in settings. A watchdog drops render scale by 10% if the frame
rate stays under target for 3 seconds.

| | Low | Medium | High | Ultra |
| --- | --- | --- | --- | --- |
| Expected default | iPhone 11, XR | iPhone 12, 13 mini | iPhone 13, 14 | iPhone 15 Pro and newer |
| Target | 30 fps or better | 60 fps | 60 fps | 60 fps |
| Render scale (of device pixels) | 0.6 | 0.75 | 0.9 | 1.0 |
| Anti-aliasing | FXAA | SMAA | SMAA | SMAA + temporal jitter in replays |
| Shadows | 1 cascade, 1024, players only | 2 cascades, 1024 | 3 cascades, 2048, soft | 3 cascades, 2048, soft + contact shadows |
| Bloom | Quarter-res, 3 levels | Half-res, 4 levels | Half-res, 5 levels | Half-res, 6 levels + lens flare |
| Depth of field (replays) | Off | Off | On, half-res | On, full quality |
| Motion blur | Ball stretch only | Ball stretch only | Ball + camera in replays | Ball + camera in replays |
| Crowd | Impostors only, 6k | 2k meshes + 8k impostors | 5k meshes + 13k impostors | 8k meshes + 14k impostors |
| Net cloth | 24 x 10 nodes | 40 x 16 | 56 x 22 | 72 x 28 |
| Grass blades near camera | Off | 20k | 45k | 80k |
| Player triangles (each) | 5k | 8k | 12k | 12k |
| Scene triangles, draw calls | 250k, 60 | 500k, 90 | 900k, 120 | 1.4M, 140 |
| Texture memory | 60 MB | 110 MB | 180 MB | 220 MB |

These numbers are starting points from experience, to be corrected by your device reports.

## 7. Code structure and tests

```
v3/
  index.html, style.css, manifest, icons
  js/core/      physics, keeper model, kick input, rules, rng, challenge (v1 + v2), profile (migration), modes
  js/render/    renderer, post chain, quality tiers, stadium, pitch, net cloth, crowd, characters, cameras, replay
  js/game/      state machine, shootout flow, tutorial, AI, audio, haptics, clip recorder
  js/ui/        HUD, menus, scoreboard, captions, settings
  assets/       models (glb, meshopt), textures (ktx2), audio (m4a), fonts
  test/         node --test suites
```

- `js/core/` has no rendering or DOM code, so it runs in Node.
- Tests (`npm run test:v3`, and `npm run test:v2` keeps working until the swap): ball physics
  and collisions, gesture recognition (every rule in section 5 as a test), scatter determinism,
  keeper timing windows, striker switch rule, rules and scoring, AI balance bands, challenge link
  v1 decoding and v2 round trip, damaged links, save migration from v1 and v2, quality-tier selection.
- A headless smoke test plays a full shootout in Chromium on every push.

## 8. Milestones

After each one I push to `v3/rebuild`, give you a test URL path and tell you exactly what to
check and how it should feel. Order follows your list.

| | Milestone | You can test |
| --- | --- | --- |
| a | Stadium, lighting, cameras, quality tiers, benchmark screen | Walk the cameras around the empty stadium; report fps per tier from the benchmark |
| b | Shooting feel: gesture rules, timing, physics, post and bar, net cloth, haptics, latency probe | Shoot at an empty goal and against a static keeper; does one swipe do what you meant? |
| c | Keeper and saving feel: cues, dive timing, contact, striker and keeper AI levels | Keep against all four striker levels; can you learn the tells? |
| d | Players and animation: skinned bodies, kits, run-up, strike, dives, reactions | Close-ups and replays: do the bodies and movement hold up? |
| e | Crowd, walkout, replays, captions, audio, share clip | A full quick shootout start to finish with presentation |
| f | Modes, menus, tutorial, migration, challenge links, polish, store screenshots and text | Everything; then the swap of `v2/` and the final written rule check |

At the end: six iPhone 6.9" and six iPad 13" screenshots rendered from the real game into
`screenshots/v3/`, store text updated to match, and a written confirmation against hard rules 1, 2 and 7.

## 9. Decisions I need from you before I start

1. **Assets:** Plan A (allow the six domains in section 4) or Plan B (everything made in code)?
   Recommended: Plan A.
2. **Expectation:** OK with the target as stated in section 0, "console-quality penalty box on a
   phone", with authored (not captured) keeper animation?
3. **Folder plan:** OK to build in `v3/` and turn `v2/` into a forwarding page at the end, so old links keep working?
4. **Device reports:** will you run the benchmark and latency probe on your iPhone after
   milestones a and b? Which iPhone models can you test on?
