# ⚽ Penalty Kings 2026

A pseudo-3D **penalty-shootout tournament** game. Pick one of the **48 real
nations** of the 2026 international football tournament (Canada · Mexico · USA) and
win your way from the group stage to the final — where *every* match is decided from
the penalty spot. You against the CPU: you take the kicks **and** dive in goal.

> Public/App Store name avoids FIFA's "World Cup"/"FIFA" trademarks — see
> [APPSTORE.md](APPSTORE.md). The real national teams & flags are fine to use.

Runs as a **web app / PWA** and ships as a native **iOS app** (Capacitor).

Inspired by the highest-rated browser penalty games (Poki's *Penalty Shooters 2*
and friends): pick a team → shoot → switch to keeper → knockout run to glory.

## Run the web version

Plain HTML/CSS/JS in `www/` — no build step:

```bash
npm run serve        # python3 -m http.server 8000 --directory www
# → open http://localhost:8000
```

(Any static server works; the web root is the `www/` folder.)

## How to play

- **Pick your nation** from any of the 12 groups.
- **Group stage** – play 3 matches; finish top 2 of your group, or as one of the
  8 best third-placed teams, to advance. Every other match is auto-simulated.
- **Knockout** – Round of 32 → Round of 16 → Quarter-final → Semi-final → Final.
  Lose once and you're out.
- **Career & History** – every finished tournament is saved on-device with full
  stats (titles, win rate, penalties scored, save %, best finish, and a match
  log per run). Best played in **landscape** on a phone for a full-screen pitch.

### Controls

| Situation | Touch / mouse | Keyboard |
|-----------|---------------|----------|
| **Shooting** | tap to lock direction, tap again to lock height/power | `SPACE` / `Enter` |
| **Keeping**  | tap a goal zone | `Q W E` (top L/C/R) · `A S D` (low L/C/R) |

Aim into the corners to beat the keeper — overshoot the frame and you miss. The
better the opponent, the better they read you.

## iOS app (Capacitor)

The native iOS project lives in `ios/` (Capacitor 8, Swift Package Manager — no
CocoaPods needed). App icons & splash are generated from `assets/icon.png` and
`assets/splash.png`.

```bash
npm run sync                 # copy www/ into the iOS app + sync plugins
npm run icons                # regenerate app icons & splash from assets/
npm run ios                  # open the project in Xcode
```

### Run on the iOS Simulator (no Apple account needed)

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
xcrun simctl boot "iPhone 17"; open -a Simulator
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.penaltywc.game
```

### Run on a real iPhone — already set up ✅

Signing is configured: `DEVELOPMENT_TEAM = PK59WM2GKM` (automatic signing) is set
in the Xcode project, and the app has already been built, signed, installed and
launched on a connected iPhone. To redeploy after changes:

```bash
npm run sync
DEV=$(xcrun xctrace list devices 2>&1 | grep -i iphone | grep -v Simulator | head -1 | grep -oE '\([0-9A-F-]{8,}\)$' | tr -d '()')
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$DEV" -derivedDataPath ios/build-device -allowProvisioningUpdates build
xcrun devicectl device install app --device "$DEV" \
  ios/build-device/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device "$DEV" com.penaltywc.game
```

Or simply open it in Xcode (`npm run ios`), pick your iPhone, and press **▶ Run**.

### Submit to the App Store

See **[APPSTORE.md](APPSTORE.md)** for the full checklist (archive → upload →
App Store Connect listing). The bundle ID `com.penaltywc.game` is already
registered on the developer account; change the ID / app name in
[`capacitor.config.json`](capacitor.config.json) + the Xcode project first if you
want a different one, then `npm run sync`.

## Project layout

```
www/                 web app (this is the Capacitor web root)
  index.html         shell + canvas + PWA meta
  styles.css         menu / HUD styling (responsive, safe-area aware)
  manifest.webmanifest, sw.js   PWA install + offline cache
  icons/, favicon.*  web/PWA icons
  js/teams.js        all 48 teams (groups, flags, kit colours, strength) — edit here
  js/tournament.js   group stage, qualification, knockout bracket, auto-sim
  js/shootout.js     the pseudo-3D canvas shootout engine
  js/store.js        localStorage career stats + tournament history
  js/game.js         screens & flow (title → select → hub → match → result → history)
assets/              icon.png (1024) + splash.png source art for the app icons
ios/                 native iOS project (Capacitor)
screenshots/         captured from the iPhone 17 simulator
capacitor.config.json, package.json
```

## Notes

- **Teams** reflect the official Final Draw (Washington D.C., 5 Dec 2025) plus the
  March 2026 play-off winners. To correct any qualifier, edit one line in
  [`www/js/teams.js`](www/js/teams.js).
- **Web/PWA hosting:** it's fully static — drop `www/` on GitHub Pages, Netlify,
  Vercel, or Cloudflare Pages. It's installable to the Home Screen as a PWA.
- **Save data** is stored locally per device (browser localStorage / WKWebView);
  it isn't synced across devices.
