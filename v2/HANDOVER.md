# Handover: v2 art and feel pass

**Status 2026-11-11:** a first art pass is DONE (`js/scene.js`, `js/audio.js`):
the night stadium, crowd, floodlights, net bulge, ball trail, jointed players
with animations, confetti, bloom, slow motion, synthesised sound, title screen,
icon and store screenshots. The next session should **improve** it, not start
over. Best wins, in order: better player models and animation (they're still
simple primitives), a goal replay camera, a richer crowd (flags, scarves, a
second tier), the vertical clip frame, and swipe-feel tuning on a real iPhone.

Read this first. The plan, research and decisions are in the "Penalty Kings
Remake Plan" doc; this file is the working brief for the code.

## Hard rules (decided with the owner, don't revisit)

- **100% free:** no ads, no in-app purchases, no subscriptions, no ad or IAP SDKs.
- **Zero expenses:** build every asset in code (procedural geometry, shaders,
  canvas textures, Web Audio sound). No bought or third-party models,
  textures, sounds or fonts (open-licence fonts are OK).
- **Keep the name and the app:** Penalty Kings: Shootout, bundle
  `com.penaltywc.game`, shipped as v2.0 over the live 1.0.
- **IP-safe:** no "World Cup", "FIFA", "2026", crests, club names or real
  player names or faces. Flags and national colours are fine.
- **Fair keeper:** the CPU keeper must never use information a human keeper
  wouldn't have. Keep that in `keeper.js`.
- **Engine:** Three.js r170 in `vendor/`, no build step, works offline.

## What exists (all tested: `npm run test:v2`, 29 tests)

| File | State | Touch in the art pass? |
| --- | --- | --- |
| `js/physics.js` | Final-ish. Ball flight, curve, woodwork | Only to tune feel numbers |
| `js/keeper.js` | Final-ish. Dive model and fair CPU keeper | Only to tune |
| `js/kick.js` | Final-ish. Swipe to kick, CPU shooter, results | Tune swipe sensitivity on a real phone |
| `js/rules.js` | Done | No |
| `js/challenge.js` | Done. Links are versioned: never change the byte layout without bumping VERSION | No |
| `js/profile.js` | Done. XP, coins, streaks, unlocks, v1 migration | No |
| `js/modes.js` | Logic done; no UI yet for Daily, Road to Glory or the cosmetics shop | Build the UI |
| `js/clip.js` | Done. Records each kick, keeps the best moment | Add the vertical branded frame |
| `js/main.js` | **Prototype.** Placeholder scene, cameras, HUD | **Replace the "scene" section** and the UI |

## The art pass, in priority order

1. **Stadium at night.** Procedural bowl, floodlight towers with volumetric
   cones, wet-grass pitch shader with mowing stripes, ad boards reading
   "PENALTY KINGS", an instanced crowd (about 10,000 low-poly fans in
   home-nation colours, phone lights, flags waving). Fog and bloom.
2. **Players and keeper.** Stylised, slightly heroic proportions, built
   from primitives with a toon or PBR look. Kits from the nation's c1/c2
   colours. Code-driven animation: run-up, strike, dives (low, high,
   fingertip), celebrations, keeper taunts. Replace `person()` in main.js.
3. **Ball and net.** Panelled ball texture, a trail when curved, and a net
   that deforms where the ball hits (vertex displacement), plus a ripple.
4. **Cameras and moments.** Slow motion for the last 0.5 s of close shots,
   a ball cam on top-corner goals, a short replay after each goal or save,
   heartbeat and a vignette in sudden death.
5. **Sound** (Web Audio, synthesised): crowd bed, a rising murmur, a hush
   before the kick, roar or groan, ball strike, net, post ping, glove slap,
   and short announcer-style stings.
6. **UI.** Title, nation picker, mode select (Quick, Daily, Road to Glory,
   Tournament, Challenge), results with XP and coins, cosmetics locker,
   onboarding. Big chunky type, nation-colour accents.
7. **Clip framing.** 9:16 vertical crop, the logo watermark, the score and
   nation flags burned in, so the clip makes sense on TikTok without context.
8. **Store assets.** App icon (ball bursting through a crown-shaped net),
   favicon and web icons, launch screen, 6 screenshots and the preview video,
   all rendered from the game. Captions are in `STORE.md`.

## Performance budget

- 60 fps locked on an iPhone 12, and 120 fps on ProMotion where possible
- First kick within 5 s of opening a challenge link; web payload under 8 MB
- App download under 80 MB
- Use the `prefers-reduced-motion` setting to turn off shake and slow motion

## Still to build after the art (not graphics)

- **Game Center** (leaderboards, achievements, iOS 26 challenges): a
  Capacitor plugin. Needed before the store text's Nation League claim is true.
- **Nation League:** a weekly leaderboard per nation in Game Center; rank
  each nation by its top 100 scores.
- **Capacitor:** point `webDir` at `v2/` (or move v2 into `www/`), add an
  Info.plist version bump to 2.0, and test on a device.
- **Web play link:** GitHub Pages serves `main`. Merge so
  `https://moelven144.github.io/penalty-kings-2026/v2/` works, then update
  `PLAY_URL` in main.js if the path changes.
- **Rating prompt:** Apple's native prompt after a won shootout or a 3-day
  streak, never after a loss.

## How to check your work

```bash
npm run test:v2        # must stay green
npm run serve:v2       # open http://localhost:8000/v2/
```

Headless check: Playwright with Chromium (`--use-gl=swiftshader`) at iPhone 13
size can play full shootouts and take screenshots. See the PR description for
what was verified.
