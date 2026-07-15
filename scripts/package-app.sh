#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP="$ROOT/build/Monster Expedition.app"
BIN="$ROOT/native/.build/release/MonsterExpeditionHelper"

cd "$ROOT"
npm run build:widget
swift build -c release --package-path native

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/widget"
cp "$ROOT/native/Distribution/Info.plist" "$APP/Contents/Info.plist"
cp "$BIN" "$APP/Contents/MacOS/MonsterExpeditionHelper"
cp "$ROOT/dist/widget/index.html" "$APP/Contents/Resources/widget/index.html"
chmod 755 "$APP/Contents/MacOS/MonsterExpeditionHelper"

IDENTITY="${SIGNING_IDENTITY:--}"
if [ "$IDENTITY" = "-" ]; then
  codesign --force --sign - "$APP/Contents/MacOS/MonsterExpeditionHelper"
  codesign --force --sign - "$APP"
  echo "Built native-only, ad-hoc signed app: $APP"
else
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP/Contents/MacOS/MonsterExpeditionHelper"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP"
  echo "Built native-only Developer ID signed app: $APP"
fi
