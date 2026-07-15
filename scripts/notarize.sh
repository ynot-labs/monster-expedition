#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DMG="$ROOT/build/Monster-Expedition.dmg"
[ -f "$DMG" ] || { echo "Run npm run package:dmg first." >&2; exit 1; }
: "${APPLE_ID:?Set APPLE_ID}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"
: "${APPLE_APP_PASSWORD:?Set APPLE_APP_PASSWORD}"
xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
xcrun stapler staple "$DMG"
spctl --assess --type open --context context:primary-signature "$DMG"
