# App Store listing for v3.0

Paste into App Store Connect when v3.0 is submitted. Every claim below is in the build (checked
against the code on 12 Nov 2026; see "Claims and where they live"). No tournament, federation,
club, sponsor or player names anywhere.

## Name (30): keep

Penalty Kings: Shootout

## Subtitle (30)

Shoot. Save. Beat your mates.  ← 29 characters

## Promotional text (170)

Rebuilt from the ground up: a floodlit 3D stadium, real ball physics and a keeper you have to read. Send your five penalties to a friend. 100% free: no ads, no purchases.  ← 170 characters

## Keywords (100)

penalty,soccer,football,shootout,goalkeeper,free kick,striker,goal,nations,friends,challenge,offline  ← 100 characters

## Description

Step up. Pick your corner. Hold your nerve.

Penalty Kings is the penalty shootout game you play with your friends. Swipe to shoot, bend it into the top corner, then switch sides and dive to save. Every shootout ends with a clip and a challenge link: your friend faces your exact five kicks, then takes theirs.

100% FREE. FOR REAL.
No ads. No purchases. No energy bars. No account. Nothing to buy, ever. Everything in the game is earned by playing.

SWIPE TO SHOOT
• Touch the ball to start the run-up, swipe at the goal, and let go as the standing foot plants
• Where you let go is where you aim. Swipe faster for power, in an arc for curve
• Chip it, drive it low, or curl it round the keeper
• Hit it too hard and it flies over the bar
• Real ball physics: it swerves, dips, skids and comes back off the post

DIVE TO SAVE
• Read the striker: the run-up, the hips, and the standing foot that always points where the ball goes
• Swipe to dive. Time it with the kick for a perfect dive
• Go too early against a good striker and they will see you and switch sides
• A fair keeper on both sides: a save is the ball hitting hands, never a dice roll

CHALLENGE YOUR FRIENDS
• Send your five penalties as a link. They can play it straight away, even without the app
• Share a clip of your best goal or save
• Rematch. Repeat. Settle it.

PLAY FOR YOUR NATION
• 48 national teams, picked in one tap
• A new Daily Challenge every day, the same match for everyone in the world
• Keep your streak alive, level up and earn coins with every goal and save

ROAD TO GLORY
• 300 levels across five regions, with three stars to earn in each
• Target practice, bending shots, keeper trials, sudden death and chip tests

UNDER THE LIGHTS
• A 3D night stadium with a crowd that reacts to every kick
• Slow-motion replays of your best moments
• Four graphics levels, so it runs smoothly on older iPhones too

Plays offline. Made for one thumb.

Penalty Kings is an independent game and is not affiliated with any football federation, league, club or tournament.

## What's New (v3.0)

(As entered in App Store Connect on 13 Nov 2026. The version on the store before this was 1.0; 2.0 was never released.)

Penalty Kings has been rebuilt from the ground up.
• A new 3D stadium, crowd and players
• New shooting: time the run-up, then swipe to aim, bend, chip or drive
• Real ball physics, with posts, bar and a net that moves
• New goalkeeping: read the striker's body, then dive
• Challenge friends with a link: they face your exact penalties
• Daily Challenge and Road to Glory with 300 levels
• Slow-motion replays from beside the post
• Still 100% free: no ads, nothing to buy

## Screenshots (`screenshots/v3/`)

Taken from the real game running in the iOS Simulator (`scripts/store-shots.sh`), captions added by
`scripts/store_screenshots.py`. iPhone 6.9" (1320×2868) and iPad 13" (2048×2732), upload in this order. An `iphone63-*` set (1206×2622) is there too for App Store Connect's medium-display slot; it was not needed, the slot scales from the 6.9" set.

| # | File | Caption |
| --- | --- | --- |
| 1 | `iphone69-01-flight.png` | SWIPE. BEND. SCORE. |
| 2 | `iphone69-02-save.png` | THEN DIVE TO SAVE IT |
| 3 | `iphone69-03-end.png` | SEND IT TO YOUR MATES |
| 4 | `iphone69-04-party.png` | RELIVE IT IN SLOW MOTION |
| 5 | `iphone69-05-map.png` | 300 LEVELS: ROAD TO GLORY |
| 6 | `iphone69-06-title.png` | 100% FREE. NO ADS. NOTHING TO BUY. |

The `ipad13-*` files go in the iPad 13" slot in the same order.

## App Privacy

Data Not Collected. The app makes no network requests, has no analytics, ads, accounts or tracking.

## Reviewer note

Free penalty shootout game. No login. Fictional competition; uses country names and flags only.
No real players, kits, crests, sponsors or stadiums. No third-party SDKs except Capacitor (the web-view shell) and its Haptics plugin.

## Claims and where they live

| Claim | In the build |
| --- | --- |
| Run-up timing, aim at release, power, curve, chip / driven / curler, over the bar | `v3/js/core/gesture.js`, `shot.js`, tested in `v3/test/gesture.test.mjs` |
| Ball swerves, dips, skids, post and bar, moving net | `v3/js/core/ball.js`, `v3/js/render/net.js`, `v3/test/ball.test.mjs` |
| Cues, perfect dive, striker switches when you go early, saves are collisions | `v3/js/core/save.js`, `ai.js`, `v3/test/save.test.mjs` |
| Challenge link with the exact five kicks, playable in a browser | `v3/js/core/challenge.js` (version 2; version 1 links still open), `v3/test/links.test.mjs`. The browser version needs this branch on GitHub Pages (see PUBLISH.md) |
| Share a clip | `v3/js/game/clip.js`; recording confirmed on an iPhone 17 Pro in the app |
| 48 nations, Daily Challenge, streak, levels, coins | `v3/js/core/teams.js`, `modes.js`, `profile.js` |
| Road to Glory, 300 levels, five regions, three stars | `v3/js/core/modes.js` |
| Slow-motion replays | `v3/js/game/match.js` (`replay`) |
| Four graphics levels | `v3/js/core/quality.js`; measured on an iPhone 17 Pro only |
| Progress carries over | `v3/js/core/profile.js` (v2 and v1 saves migrate), `v3/test/links.test.mjs` |
| Plays offline, no ads, purchases, tracking or accounts | no network code in `v3/js` (only the dev tools under `v3/js/dev`, which are not shipped) |
