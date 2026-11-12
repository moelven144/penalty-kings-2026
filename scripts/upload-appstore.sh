#!/bin/bash
# Build the release app from v3/ and upload it to App Store Connect.
# Needs an Apple account with App Store Connect access for team PK59WM2GKM signed in to Xcode
# (Xcode > Settings > Accounts). The build then appears under TestFlight; nothing is released
# to the public until a version is submitted for review in App Store Connect.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run test:v3
scripts/sync-ios.sh
OUT=ios/build-release
rm -rf "$OUT"
mkdir -p "$OUT"
(cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "../build-release/PenaltyKings.xcarchive" -allowProvisioningUpdates archive 2>&1 | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)")
cat > "$OUT/ExportOptions.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>destination</key><string>upload</string>
	<key>teamID</key><string>PK59WM2GKM</string>
	<key>signingStyle</key><string>automatic</string>
	<key>uploadSymbols</key><true/>
	<key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive -archivePath "$OUT/PenaltyKings.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" -allowProvisioningUpdates 2>&1 | grep -E "error|rror:|EXPORT (SUCCEEDED|FAILED)|Upload|access" || true
