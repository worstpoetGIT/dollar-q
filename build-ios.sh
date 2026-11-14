#!/bin/bash
# Builds the unsigned "$?" iPhone app on a Mac. Output: DollarQ-unsigned.ipa (sign and install it with iLoader).
# Needs: Xcode (with the iOS platform installed) and an internet connection the first time (it downloads Capacitor).
set -euo pipefail
cd "$(dirname "$0")"

command -v xcodebuild >/dev/null || { echo "Xcode command-line tools not found. Install Xcode, open it once, then run: sudo xcode-select -s /Applications/Xcode.app"; exit 1; }
echo "Using $(xcodebuild -version | tr '\n' ' ')"

rm -rf build Payload DollarQ-unsigned.ipa
echo "Building (the first run takes a few minutes)..."
xcodebuild \
  -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath build/DollarQ.xcarchive \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  archive > build-log.txt 2>&1 || { echo "Build failed. Last lines of build-log.txt:"; tail -40 build-log.txt; exit 1; }

APP="build/DollarQ.xcarchive/Products/Applications/App.app"
[ -d "$APP" ] || { echo "Build finished but $APP is missing. See build-log.txt"; exit 1; }
mkdir Payload
cp -R "$APP" Payload/
zip -qry DollarQ-unsigned.ipa Payload
rm -rf Payload
echo "Done: $(pwd)/DollarQ-unsigned.ipa ($(du -h DollarQ-unsigned.ipa | cut -f1))"
echo "Next: open iLoader, sign in with your Apple ID, and install this .ipa on your iPhone."
