#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP="$ROOT/build/Monster Expedition.app"
BIN="$ROOT/native/.build/release/MonsterExpeditionHelper"
NODE_BINARY="${BUNDLED_NODE_BINARY:-$(command -v node)}"

if [ ! -x "$NODE_BINARY" ]; then
  echo "A Node 24 runtime is required to package the complete local MCP server." >&2
  exit 1
fi

cd "$ROOT"
npm run build
swift build -c release --package-path native

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/widget" "$APP/Contents/Resources/runtime" "$APP/Contents/Resources/server"
cp "$ROOT/native/Distribution/Info.plist" "$APP/Contents/Info.plist"
cp "$BIN" "$APP/Contents/MacOS/MonsterExpeditionHelper"
cp "$ROOT/dist/widget/index.html" "$APP/Contents/Resources/widget/index.html"
cp "$NODE_BINARY" "$APP/Contents/Resources/runtime/node"
cp "$ROOT/dist/runtime/monster-expedition-server.mjs" "$APP/Contents/Resources/server/monster-expedition-server.mjs"
chmod 755 "$APP/Contents/MacOS/MonsterExpeditionHelper"
chmod 755 "$APP/Contents/Resources/runtime/node"

IDENTITY="${SIGNING_IDENTITY:--}"
if [ "$IDENTITY" = "-" ]; then
  codesign --force --sign - "$APP/Contents/Resources/runtime/node"
  codesign --force --sign - "$APP"
  echo "Built ad-hoc signed app: $APP"
else
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP/Contents/Resources/runtime/node"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP"
  echo "Built Developer ID signed app: $APP"
fi
