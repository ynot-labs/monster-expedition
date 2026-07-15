#!/bin/sh
set -eu

APP_NAME="Monster Expedition.app"

HELPER=""
RUNTIME_NODE=""
RUNTIME_SERVER=""
for app_root in "/Applications/$APP_NAME" "$HOME/Applications/$APP_NAME"; do
  helper="$app_root/Contents/MacOS/MonsterExpeditionHelper"
  if [ -x "$helper" ]; then
    HELPER="$helper"
    # The Helper is an accessory application: opening it never takes focus or
    # creates a Dock icon. The Node MCP process below remains the one complete,
    # versioned gameplay authority during development and writes its visual-only
    # bridge for the Pet to render.
    open -gj "$app_root" >/dev/null 2>&1 || true
    runtime_node="$app_root/Contents/Resources/runtime/node"
    runtime_server="$app_root/Contents/Resources/server/monster-expedition-server.mjs"
    if [ -x "$runtime_node" ] && [ -f "$runtime_server" ]; then
      RUNTIME_NODE="$runtime_node"
      RUNTIME_SERVER="$runtime_server"
    fi
    break
  fi
done

if [ -n "$RUNTIME_NODE" ]; then
  exec env MONSTER_EXPEDITION_RESOURCE_ROOT="$(dirname "$(dirname "$RUNTIME_NODE")")" "$RUNTIME_NODE" "$RUNTIME_SERVER"
fi

if command -v node >/dev/null 2>&1 && [ -f "./dist/server/index.js" ]; then
  exec node ./dist/server/index.js
fi

if [ -n "$HELPER" ]; then
  exec "$HELPER" --mcp-stdio
fi

echo "Monster Expedition.app is not installed and the development MCP build is unavailable." >&2
echo "Install the bundled app or run npm run build from the plugin source." >&2
exit 1
