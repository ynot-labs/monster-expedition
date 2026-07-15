#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP="$ROOT/build/Monster Expedition.app"
DMG="$ROOT/build/Monster-Expedition.dmg"

[ -d "$APP" ] || { echo "Run npm run package:app first." >&2; exit 1; }
rm -f "$DMG"
hdiutil create -volname "Monster Expedition" -srcfolder "$APP" -ov -format UDZO "$DMG"
echo "Created $DMG"
