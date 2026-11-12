# Hard-rule check for v3.0 (12 Nov 2026)

Checked against the files that go into the app (`ios/App/App/public` after `scripts/sync-ios.sh`),
the store text (`v3/STORE.md`) and the screenshots (`screenshots/v3/`).

## 1. Original game, no third-party IP

- **Nothing copied from another football game.** Stadium, pitch, goal, net, ball artwork, crowd, kits,
  interface, sound and all player movement were written for this game (`v3/ASSETS.md`, "Made by us").
  The only third-party content is listed under rule 2.
- **No "World Cup", "FIFA" or tournament, federation, club, sponsor or brand names** in the shipped
  game or the store text. Searched for: world cup, fifa, uefa, messi, ronaldo, nike, adidas, puma,
  wembley. No matches.
- **No real players.** Players have no names or faces from real people; the body is a generic CC0
  model. One real player's surname was used in v2 as the name of a shot. In v3 nothing a player can
  see uses it: the shot is called a chip, and the level text reads "Score a chip down the middle".
  The word remains only inside the code as an identifier (`panenka` level type and two save-file
  keys), kept so existing saves and level numbering do not break.
- **No real kits, crests, sponsors or stadiums.** Kits are one of three generic templates (plain,
  sash, hoops) in a nation's two colours, with no crest, maker's mark, sponsor or number. The
  stadium is invented. LED boards carry only "PENALTY KINGS", "SHOOT", "SAVE", "SEND IT TO YOUR
  MATES", "100% FREE" and "NO ADS".
- **Nations appear only as country name and flag** (`v3/js/core/teams.js`: name, flag emoji, two colours).
- **"2026"** appears in three places, none of them store text or game text: the address of the
  existing web version (`moelven144.github.io/penalty-kings-2026/`, which you asked to keep working
  and which appears in shared challenge links), the v1 save-file key (`pwc2026_save_v1`, needed to
  migrate old saves), and a date in a code comment. The repository and npm package names also
  contain it. If App Review objected to the link address, the fix is a new address for the web
  version, which would break old links.

## 2. Assets: own work or CC0-equivalent, all recorded

Shipped third-party files, all recorded in `v3/ASSETS.md` with source and licence:

- Poly Haven "Sparse Grass" and "Concrete Wall 008" texture maps (CC0).
- Quaternius "Universal Base Characters": one body, two hair meshes and their textures (CC0;
  the pack's licence file is shipped next to them).
- Three.js r187 and four of its addons (MIT, a code library; licence file shipped).

Not shipped, kept in `assets-src/` for possible later use: the rest of the Quaternius packs (CC0) and
CMU motion-capture data (free to copy, modify and redistribute). No motion capture is in the game.
No fonts are bundled (system fonts). No audio files (all sound is synthesised).
The store screenshots use Helvetica Neue from macOS for the captions.

## 3. 100% free, offline, small

- No ads, purchases, subscriptions, tracking, analytics or accounts. Native dependencies are
  Capacitor and its Haptics plugin only (`ios/App/CapApp-SPM/Package.swift`).
- **No network requests.** The shipped JavaScript contains no `fetch`, `XMLHttpRequest`,
  `WebSocket` or `sendBeacon`; it loads only its own bundled files. The only outward actions are the
  system share sheet, when the player taps Share or Challenge a friend, and the link inside it.
- The development tools that talk to a Mac (`v3/js/dev/auto.js`) are replaced by an empty file in
  the app (`scripts/sync-ios.sh`).
- **Size:** the release app is 9 MB (limit 150 MB).

## 4. Performance

- **Measured:** iPhone 17 Pro, in the app: 59.7 fps average over a whole session on High (a shootout
  and three Road to Glory levels, 10,411 frames; 1.4% of frames over 20 ms), and a locked 60 fps on
  Medium and High in every gameplay camera with the stadium alone. Ultra runs at about 50 to 59 fps
  and is never chosen automatically.
- **Not measured:** iPhone 13, 12 and 11. "60 fps on iPhone 13 and newer, playable on iPhone 11"
  is therefore **not confirmed**. Low and Medium exist for those phones, the first-launch probe and
  the frame-rate watchdog pick and adjust the level, but nobody has run them there.
- Heat: after about 90 minutes of continuous test runs the phone throttled to about 50 fps on High.

## 5. Links, address and bundle ID

- Old challenge links (version 1) decode and replay as targets (`v3/test/links.test.mjs`).
- `v2/index.html` forwards to `../v3/` with the challenge code. This works on the live site only
  after the branch is merged to `main`.
- Bundle ID is `com.penaltywc.game`. The UIScene code in `AppDelegate.swift` and `Info.plist` is
  unchanged; one debug-only line keeps the screen awake in development builds.

## 6. Store text matches the build

Every claim in `v3/STORE.md` is listed there with the file that implements it. Two depend on things
outside the build: "even without the app" needs the merge to `main`, and "runs smoothly on older
iPhones" rests on unmeasured levels (see 4). Soften or remove that last bullet if you want the
listing to claim only what has been measured.

## Where v3.0 falls short of the plan

- Player and keeper movement is hand-authored and solved onto the skeleton; it is not motion capture.
- The walkout is a short camera arrival with a caption, not two captains walking out.
- Replays are slow motion from beside the post; there is no depth of field or motion blur.
- Sound is the synthesised v2 sound, not recorded crowd and ball sounds.
- Keeping is played from a raised camera behind the striker, not from behind the goal line: in
  portrait the goal does not fit from there.
- No lens flare, contact shadows, cascaded shadows or SMAA; anti-aliasing is MSAA.
- The stand, roof and sky are still plain.
