#!/bin/bash
# Copy the game (v3/) into the iOS project and leave out what is not part of the game.
set -euo pipefail
cd "$(dirname "$0")/.."
npx cap sync ios >/dev/null
P=ios/App/App/public
rm -rf "$P/test" "$P/README.md" "$P/package.json" "$P/REBUILD_PLAN.md" "$P/STORE.md" "$P/ASSETS.md" "$P/js/dev"
# the development-only automatic runs are not shipped: give the game an empty stand-in
mkdir -p "$P/js/dev"
printf 'export const autoParams = () => null;\nexport const runAuto = () => {};\n' > "$P/js/dev/auto.js"
[ "${1:-}" = "--dev" ] && cp v3/js/dev/auto.js "$P/js/dev/auto.js"
du -sh "$P" | cut -f1
