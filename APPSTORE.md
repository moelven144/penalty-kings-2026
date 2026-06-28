# App Store submission checklist — Penalty Kings: Shootout

> ✅ **APPROVED & LIVE on the App Store (2026-06-15)** — build 1.0 (3).
> App: **Penalty Kings: Shootout** (ID 6778324509, bundle `com.penaltywc.game`).
> https://apps.apple.com/app/penalty-kings-shootout/id6778324509
> (Journey: build 2 rejected under 5.2.1 IP → de-coupled from the World Cup, kept real
> national teams → build 3 resubmitted → approved.)
>
> **Rejection:** Apple rejected build 2 under **Guideline 5.2.1 (Intellectual Property)** —
> "content that resembles FIFA without authorization" (the World Cup 2026 resemblance).
> **Fix (de-couple, keep real teams):** renamed to "Penalty Kings: Shootout" (binary
> name "Penalty Kings"); removed every "2026"/"World Cup"/"WORLD CHAMPIONS" string and the
> "Canada·Mexico·USA" ad board (now "PENALTY KINGS ★ TAKE YOUR SHOT"); group draw is now
> **randomized each playthrough** (not the official draw); flat A–Z team picker; description/
> keywords reworded; hosted pages de-2026'd. Real national teams kept (country names + flags
> only). Build 3 uploaded, fresh de-coupled screenshots (iPhone 1284×2778 + iPad 2048×2732),
> reviewer note rewritten to state the de-coupling, then Resubmitted.
>
> **(Earlier) first submission:** v1.0 build 2 submitted 2026-06-09; App Privacy published
> (Data Not Collected), Free in all 175 countries, auto-release, contact Per Magne Helseth /
> +47 93074772 / permagnehelseth@gmail.com (no sign-in required).

---
## 🆕 v1.1 update — built & verified, ready to archive (2026-06-22)

**Version `1.1` build `4`** (bumped in `project.pbxproj`; `package.json` → 1.1.0).

**What's new in the code (all implemented + browser-verified):**
- **Sound effects** — Web Audio engine in `shootout.js` (kick, dive whoosh, goal
  fanfare + crowd swell, save thud, miss slide) with a **mute toggle** (speaker
  button top-right, also `M` key); persisted in `localStorage` (`pk_mute`).
- **Goal particles** — celebratory burst in the scorer's colours on every goal.
- **Haptics** — `@capacitor/haptics@8.0.2` installed + synced (SPM). Light on
  aim-lock/dive, medium on save, heavy on goal. Graceful no-op if unavailable.
- **Shooter personality** — aim-sweep speed & keeper reaction window re-rolled per
  kick and scaled by opponent strength, so weak/strong sides feel different.
- **Onboarding** — first-launch "How to play" tutorial (Shoot / Save / Win) +
  a "How to play" button on the title. Flag in `localStorage` (`pk_onboarded`).
- **Daily Challenge** — one deterministic fixture per UTC day (same for everyone),
  single shootout, streak + best-streak + win% tracked (`pk_daily_v1`, isolated
  from the save schema). New gold button on the title shows the live streak.
- **PWA cache** bumped `pk-v4` → `pk-v5` and assets versioned `?v=1.1` so returning
  web users get the update instead of a stale cache.

**Build status:** `cap sync` done; **simulator build = BUILD SUCCEEDED**, Haptics
plugin compiles & links. Web flow verified end-to-end in the preview (onboarding,
daily fixture Algeria–S.Korea, play→win→streak, mute toggle, particles).

**Polish folded into build 4 (verified in preview 2026-06-22):** canvas now re-fits
the device-pixel-ratio on resize/rotation (no more blur after rotating); goal
particles + title confetti respect the OS "reduce motion" setting; the mute button
is a ≥44px touch target; key input is ignored outside the interactive phases (no
stray AudioContext on menu keystrokes). Asset cache bumped `?v=1.1.1` / SW `pk-v6`.

**🔲 Remaining (needs you — Apple auth, same as before):**
1. Xcode ▸ **Window ▸ Organizer** (or `npm run ios`) ▸ select **App** ▸
   **Product ▸ Archive** (Release). The version is already 1.1 (4).
2. **Distribute App ▸ App Store Connect ▸ Upload** (keep automatic signing).
3. In App Store Connect: **➕ create the 1.1 version**, attach build 4, paste the
   **What's New** text below, then **Add for Review ▸ Submit**. (Screenshots carry
   over — no new uploads needed.)

**What's New (paste into the 1.1 version's "What's New in This Version"):**
> Penalty Kings just got louder and livelier:
> • Match-day sound effects and a one-tap mute
> • Goal celebrations with confetti in your nation's colours
> • Haptic feedback on every kick, dive and goal
> • New Daily Challenge — one shootout, one fixture for everyone, build your streak
> • A quick "How to play" tutorial for newcomers
> • Smarter keepers that feel different from one opponent to the next

## Already done ✅
- Native iOS app **signed** (Team `PK59WM2GKM`) and **installed + launched on your iPhone**.
- **App Store Connect app record created:** "Penalty Kings 2026", iOS, English (U.S.),
  SKU `penaltykings2026`, Full Access.
- **Build uploaded + ATTACHED:** v1.0 **build 2** attached to the version; export
  compliance answered ("None of the algorithms" / non-exempt encryption = none).
- **Listing copy saved:** Description, Promotional Text, Keywords (English U.S.).
- **App Information complete + saved:** Name "Penalty Kings 2026", Subtitle "Shoot your
  nation to glory", Category **Games → Sports**, **Content Rights = No third-party
  content**, **Age Rating 4+**, Apple Standard License Agreement.
- **URLs saved:** Privacy Policy `…/penalty-kings-2026/privacy.html`, Support
  `…/support.html`, Marketing `…/penalty-kings-2026/` (hosted on GitHub Pages,
  repo `moelven144/penalty-kings-2026`).
- **App Privacy PUBLISHED:** "Data Not Collected" (published, not just draft).
- **Pricing = Free**, all 175 countries. **Availability = all 175 countries.**
- **Release:** set to "Automatically release after approval".
- App icon (all sizes) + launch screen; display name **"Penalty Kings"**.
- Local signed copy: `ios/build/export/App.ipa` (5.9 MB).

## 🔲 Remaining — ONLY these 3 (each genuinely needs you)
On the version page (**Distribution → iOS App 1.0**):
1. **Screenshots** — drag these 4 ready files onto "Previews and Screenshots"
   (iPhone 6.5"). They're already the correct size (1284×2778):
   `screenshots/appstore/01-title-65.png`, `02-select-65.png`, `03-hub-65.png`,
   `04-match-65.png`. (I can't upload files myself — the browser tool only accepts
   files you've shared with the session, so this drag is yours.)
2. **App Review → Contact Information:** I filled First "Per Magne", Last "Helseth",
   Email `permagnehelseth@gmail.com`, unchecked "Sign-in required", and added a
   reviewer note — but the page would NOT save because the **Phone number** field is
   required and I don't have it. Type your phone, re-confirm "Sign-in required" is
   **unchecked** (the app has no login), then click **Save**.
3. **Add for Review** (top-right) → then **Submit**. Done.

---
## (Reference) earlier notes

## ⏳ Finishing the upload — this last step needs YOU
Everything is built, signed and verified. I cannot push it to App Store Connect
myself for two concrete reasons:
1. **Xcode won't accept my typing** — IDEs are restricted to clicking only (safety),
   and Xcode's upload needs the **app Name** typed to create the App Store record.
2. **App Store Connect isn't signed in** on this Mac (I checked — it returned a
   sign-in screen), and I won't enter an Apple ID password / 2FA.

### Fastest finish (~1 min, all in Xcode — it auto-creates the App Store record)
1. Xcode ▸ **Window ▸ Organizer** ▸ select the **App** archive ▸ **Distribute App**.
2. **App Store Connect** ▸ **Distribute**.
3. On *"Upload for App Store Connect"*, set **Name** to **`Penalty Kings 2026`**
   (must be unique on the store — change if taken).  ⚠️ Don't leave it as "App".
4. **Next** ▸ keep *Automatically manage signing* ▸ **Upload**. That creates the
   App Store record and uploads the keeper-fixed build (v1.0, build 1).

### Alternative — let me upload it headlessly going forward
Sign in to App Store Connect once, create an **App Store Connect API key**
(Users and Access ▸ Integrations, role *App Manager*), drop `AuthKey_*.p8` into
`~/.appstoreconnect/private_keys/`, and send me the **Issuer ID** + **Key ID**:
```bash
xcrun altool --upload-app -f ios/build/export/App.ipa -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>
```
(The app record must exist first — easiest to create it via the Xcode flow above.)

## ✅ Trademark-safe naming — done (confirm before submitting)
The app and all user-facing text were renamed away from FIFA's "World Cup" / "FIFA"
trademarks to **"Penalty Kings 2026"** (in-game title, manifest, page title, iOS
display name "Penalty Kings"). The 48 real national teams/flags stay — countries
aren't trademarks; only "FIFA"/"World Cup" wording is. Two things to confirm:
- **App Store name uniqueness:** "Penalty Kings 2026" must be unique on the store —
  if it's taken, pick another (change it in `www/js/game.js` title, `www/index.html`,
  `www/manifest.webmanifest`, `capacitor.config.json` appName + Info.plist display
  name, then `npm run sync` + re-archive).
- **Bundle ID** `com.penaltywc.game` becomes permanent once the App Store record is
  created — confirm it's what you want first.

## Before you submit
1. **Decide the bundle ID & name.** `com.penaltywc.game` / "Penalty WC26" work, or
   change them in [`capacitor.config.json`](capacitor.config.json) and the Xcode
   project, then `npm run sync`.
2. **Create the app record** at [App Store Connect](https://appstoreconnect.apple.com)
   → My Apps → ➕ → New App (pick the bundle ID, set the name & primary language).
3. **Archive & upload** (easiest in Xcode):
   ```bash
   npm run ios          # opens Xcode
   ```
   Then: select **Any iOS Device** as destination → **Product ▸ Archive** →
   in the Organizer click **Distribute App ▸ App Store Connect ▸ Upload**.

   CLI alternative to build the archive:
   ```bash
   xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -destination 'generic/platform=iOS' -archivePath ios/build/App.xcarchive \
     -allowProvisioningUpdates archive
   ```
   (Upload the resulting archive via Xcode Organizer or the Transporter app.)
4. **Fill the listing** (copy ready below), upload **screenshots**, answer
   **App Privacy**, set pricing (Free), then **Submit for Review**.

## ⚠️ SUPERSEDED reference copy — do NOT reuse the "2026" wording

> The LIVE App Store listing is **"Penalty Kings: Shootout"**. The app was
> de-coupled from the World Cup and renamed to resolve the **5.2.1 IP
> rejection** (see the banner at the very top). Everything below is the
> ORIGINAL pre-rejection draft, kept only for history. **Do not paste
> "Penalty Kings 2026" or a "2026" keyword into App Store Connect** — that
> exact wording is what triggered the rejection. Use the current de-coupled
> listing (name "Penalty Kings: Shootout", no "2026"/"World Cup" terms).

## Ready-to-use listing copy (historical — pre-de-coupling, superseded)

- **Name:** Penalty Kings 2026  *(trademark-safe; the build now uses this name. Check it's unique on the App Store, then keep or tweak.)*
- **Subtitle:** Shoot your nation to glory
- **Category:** Games → Sports (secondary: Arcade)
- **Age rating:** 4+ (no objectionable content)
- **Promotional text:** All 48 nations. Every match decided from the penalty spot.
- **Description:**
  > Take your nation all the way from the group stage to the final — where every
  > match is a nerve-shredding penalty shootout. Pick from all 48 teams of the
  > 2026 international tournament, step up to take your kicks, then switch sides and
  > dive in goal. Aim for the corners, read the striker, hold your nerve in sudden death.
  >
  > • All 48 real nations across 12 groups
  > • Full tournament: group stage → Round of 32 → final
  > • You shoot AND keep — pure penalty drama
  > • Career stats & tournament history saved on your device
  > • Plays great in portrait or landscape, fully offline
- **Keywords:** penalty,soccer,football,shootout,goalkeeper,2026,sports,arcade,free kick,tournament
- **Support URL / Marketing URL:** (add a page or your contact link — required)

## App Privacy (App Store Connect questionnaire)
- **Data collected:** **None.** The app has no network calls, no analytics, no
  accounts, no ads. Career/history data is stored only on-device (localStorage in
  the app's WebView). Answer **"Data Not Collected"** for every category.
- **Tracking:** No.

## Screenshots
Required size (Apple, 2025+): **6.9"** (1320×2868 portrait). Clean preview captures
of the renamed build are in [`screenshots/`](screenshots/): `01-title`, `02-select`,
`03-hub`. **Capture final listing screenshots fresh** at 6.9" from the current build
(it now shows "Penalty Kings", no trademarked text). Easiest path — boot a 6.9"
simulator, install, play into a match, and grab frames:
```bash
xcrun simctl boot "iPhone 17 Pro Max"; open -a Simulator
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.penaltywc.game
# navigate to a match, then:
xcrun simctl io booted screenshot screenshots/match.png
```
(The earlier match screenshots were removed because they predated the rename.)

## Notes
- A paid Apple Developer Program membership (you have one) is required to ship.
- First external review typically takes ~24–48h.
