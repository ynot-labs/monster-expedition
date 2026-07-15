#!/bin/sh
set -eu

APP_NAME="Monster Expedition.app"

HELPER=""
for app_root in "/Applications/$APP_NAME" "$HOME/Applications/$APP_NAME"; do
  helper="$app_root/Contents/MacOS/MonsterExpeditionHelper"
  if [ -x "$helper" ]; then
    HELPER="$helper"
    # The Helper is an accessory application: opening it never takes focus or
    # creates a Dock icon. The Node MCP process below remains the one complete,
    # versioned gameplay authority during development and writes its visual-only
    # bridge for the Pet to render.
    open -gj "$app_root" >/dev/null 2>&1 || true
    break
  fi
done

if command -v node >/dev/null 2>&1 && [ -f "./dist/server/index.js" ]; then
  exec node ./dist/server/index.js
fi

if [ -n "$HELPER" ]; then
  exec "$HELPER" --mcp-stdio
fi

echo "Monster Expedition Helper is not installed and the development MCP build is unavailable." >&2
echo "Install Monster Expedition.app or run npm run build from the plugin source." >&2
exit 1
