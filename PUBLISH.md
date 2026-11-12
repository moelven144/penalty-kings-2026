# Publish Penalty Kings v3.0 to the App Store

Everything is prepared on the `v3/rebuild` branch. Three steps need you.

## 1. Sign in to Xcode (once)

Xcode ▸ Settings ▸ Accounts ▸ add the Apple account that has App Store Connect access for team
`PK59WM2GKM`. The upload on 12 Nov 2026 failed only on this: "App Store Connect access for
PK59WM2GKM is required".

## 2. Upload the build

```bash
scripts/upload-appstore.sh
```

It runs the tests, copies `v3/` into the iOS project (without docs, tests or development tools),
archives version **3.0 (build 7)** and uploads it. The build then shows under TestFlight. Nothing
is public yet. If you upload again, raise `CURRENT_PROJECT_VERSION` in
`ios/App/App.xcodeproj/project.pbxproj` first.

Try the TestFlight build on your iPhone before going further: this exact release build has not
been played by a person.

## 3. Decide about `main`, then submit

**Challenge links.** Links made by v3 point to
`https://moelven144.github.io/penalty-kings-2026/v3/`, and old links to `.../v2/` are forwarded
there. Both only work once this branch is on `main` (GitHub Pages serves `main`). Until then a
friend without the app gets a 404, and the store text's "they can play it straight away, even
without the app" is not true. **Merge PR #5 before submitting for review.**

Then in App Store Connect:

1. **Penalty Kings: Shootout ▸ Distribution**, **+** next to iOS App, create version **3.0**.
2. Under **Build**, add build 7. Export compliance: "None of the algorithms".
3. Paste the text from `v3/STORE.md`: promotional text, description, keywords, What's New. The subtitle is unchanged.
4. Replace the screenshots with `screenshots/v3/iphone69-*.png` (6.9") and `screenshots/v3/ipad13-*.png` (iPad 13"), in number order.
5. App Privacy stays **Data Not Collected**.
6. **Add for Review**, then **Submit**.

## If App Review pushes back

- **5.2.1 (IP):** see `v3/RULES_CHECK.md`. No tournament, federation, club, sponsor or player names; nations appear as name and flag only.
- **2.3 (accurate metadata):** `v3/STORE.md` lists every claim and where it lives in the build.
