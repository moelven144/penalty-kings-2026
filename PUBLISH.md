# Publish Penalty Kings v2.0 to the App Store (on your Mac)

Everything is prepared in the repo. These steps need your Mac, Xcode and your
Apple login, so they can't run from a cloud session. About 30 minutes.

## 0. Decide about the challenge link (once)

Challenge links point to `https://moelven144.github.io/penalty-kings-2026/v2/`.
That page only exists after the `v2/foundation` branch is merged into `main`
(GitHub Pages serves `main`). Until then, a friend who opens a link without the
app sees a 404. **Merge the PR before submitting**, or the main viral loop is broken.

## 1. Get the code

```bash
cd ~/path/to/penalty-kings-2026
git fetch origin
git checkout v2/foundation
git pull
npm install
```

## 2. Test it in the browser first

```bash
npm run test:v2
npm run serve:v2
```

Open http://localhost:8000/v2/ and play a shootout. On your iPhone (same Wi-Fi),
open http://YOUR-MAC-IP:8000/v2/ to feel the swipe.

## 3. Copy the game into the iOS project and run it on your iPhone

```bash
npx cap sync ios
npm run ios
```

In Xcode, pick your iPhone at the top and press Run (▶). Signing is already set
up (team PK59WM2GKM). Play a few shootouts: check the swipe feel, the sound
(tap once to start audio) and haptics.

## 4. Upload the build

In Xcode:
1. Pick **Any iOS Device (arm64)** as the destination.
2. Choose **Product ▸ Archive**.
3. In the Organizer: **Distribute App ▸ App Store Connect ▸ Upload**, keeping automatic signing.

The version is already **2.0 (build 6)**.

## 5. App Store Connect

1. Open **Penalty Kings: Shootout ▸ Distribution**, then **+** next to iOS App and create version **2.0**.
2. Under **Build**, add build 6. Answer export compliance with "None of the algorithms".
3. Paste the text from `v2/STORE.md`: subtitle (under App Information), promotional text, description, keywords, What's New.
4. Delete the old screenshots. Upload `screenshots/v2/iphone69-*.png` (6.9") and `screenshots/v2/ipad13-*.png` (iPad 13") in number order.
5. App Privacy stays **Data Not Collected**. v2 still has no analytics, ads or accounts.
6. Click **Add for Review**, then **Submit**.

Review usually takes 24–48 hours. The reviewer note can say: "Free penalty
shootout game. No login. Fictional tournament; uses country names and flags only."

## If App Review pushes back

- **5.2.1 (IP):** v2 contains no "World Cup", "FIFA", "2026", crests or player names. Check any new text you add.
- **2.3 (accurate metadata):** the listing only claims features in the build. Keep it that way.
