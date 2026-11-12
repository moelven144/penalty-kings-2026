#!/bin/bash
# Build the Capacitor app with the current v3/ and run it on a connected iPhone.
#   scripts/ios-device.sh                 build, install, launch
#   scripts/ios-device.sh "auto=bench"    same, but the app starts with that query string
#                                         (development runs; see v3/js/dev/auto.js) and its
#                                         console is streamed here until you press Ctrl-C
# The device is the first connected physical iPhone, or $PK_DEVICE (a UDID).
set -euo pipefail
cd "$(dirname "$0")/.."
QUERY="${1:-}"
DEVICE="${PK_DEVICE:-$(xcrun devicectl list devices 2>/dev/null | awk '/physical/ && /connected|available/ {for(i=1;i<=NF;i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) {print $i; exit}}')}"
[ -n "$DEVICE" ] || { echo "No connected iPhone found"; exit 1; }

scripts/sync-ios.sh --dev >/dev/null
PUBLIC=ios/App/App/public
if [ -n "$QUERY" ]; then
  # only the synced copy (git-ignored build output) is changed, never v3/index.html
  python3 - "$PUBLIC/index.html" "$QUERY" <<'EOF'
import sys
p, q = sys.argv[1], sys.argv[2]
s = open(p).read()
s = s.replace('<script type="module"', '<script>window.__PK3_QUERY = "%s";</script>\n  <script type="module"' % q, 1)
open(p, 'w').write(s)
EOF
fi

(cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$DEVICE" -derivedDataPath ../build-device -allowProvisioningUpdates build 2>&1 \
  | grep -E "error:|BUILD (SUCCEEDED|FAILED)")
APP=ios/build-device/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device install app --device "$DEVICE" "$APP" 2>&1 | grep -E "installed|error|Error" || true
if [ -n "$QUERY" ]; then
  xcrun devicectl device process launch --console --terminate-existing --device "$DEVICE" com.penaltywc.game
else
  xcrun devicectl device process launch --terminate-existing --device "$DEVICE" com.penaltywc.game 2>&1 | tail -1
fi
