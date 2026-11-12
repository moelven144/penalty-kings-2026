# Penalty Kings v2 (in development)

The v2.0 remake: real 3D (Three.js), swipe-to-curve shooting, swipe-to-dive
keeping, a fair CPU keeper and challenge links. Free, no ads, no purchases,
no bought assets. The live 1.x game in `www/` is untouched until v2 replaces it.

Status: **playable prototype with placeholder graphics.** See `HANDOVER.md` for the art pass and `STORE.md` for the App Store text. Game logic is final-ish
and tested; everything visual in `js/main.js` ("scene" section) gets replaced in
the art pass.

## Run

```bash
npm run serve:v2      # then open http://localhost:8000/v2/
npm run test:v2       # 29 tests: physics, keeper, swipe, rules, links, balance, progression, modes
```

## Files

| File | What it does |
| --- | --- |
| `js/physics.js` | Ball flight: drag, curve (Magnus), dip, bounce, woodwork; goal-line prediction |
| `js/keeper.js` | Dive model shared by player and CPU; CPU only guesses from the run-up tell or reacts after its reaction time (no cheating) |
| `js/kick.js` | Swipe -> kick (direction, height, power, curve); CPU shooter; kick -> goal/save/miss/post with a reason |
| `js/rules.js` | Best of five, early finish, sudden death |
| `js/challenge.js` | 5 kicks packed into a ~38-character link (`#c=...`), checksummed; no server needed |
| `js/teams.js` | The 48 nations. Challenge links store the INDEX: append only, never reorder |
| `js/rng.js` | Seeded random numbers so challenges replay identically |
| `js/profile.js` | XP, levels, earned coins, daily streak with freezes, unlocks, stats; carries v1 careers over |
| `js/modes.js` | Daily Challenge fixture, 300 Road to Glory levels with stated stars, cosmetics catalogue |
| `js/clip.js` | Records each kick, keeps the best moment, shares it as a video with the challenge link |
| `js/main.js` | Prototype scene, input, game loop and UI |
| `vendor/three.module.min.js` | Three.js r170, bundled locally so the app works offline |

## Balance (CPU vs CPU, 4,000 kicks)

About 80% scored, 14% saved, 6% missed or off the woodwork. Real-world
penalties are roughly 75% scored. Tune in `keeper.js` and `kick.js`; the
balance test fails if conversion leaves 66–84%.
