#!/bin/sh
set -eu

APP_NAME="Monster Expedition.app"
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

HELPER=""
# A checked-out plugin can be tested immediately after `npm run package:app`.
# Public installs continue to prefer the player's Applications copy.
for app_root in "$ROOT/build/$APP_NAME" "/Applications/$APP_NAME" "$HOME/Applications/$APP_NAME"; do
  helper="$app_root/Contents/MacOS/MonsterExpeditionHelper"
  if [ -x "$helper" ]; then
    HELPER="$helper"
    # The Helper is an accessory application: opening it never takes focus or
    # creates a Dock icon. It is also the sole local game authority.
    open -gj "$app_root" >/dev/null 2>&1 || true
    break
  fi
done

if [ -n "$HELPER" ]; then
  exec "$HELPER" --mcp-stdio
fi

echo "Monster Expedition.app is not available." >&2
echo "Run npm run package:app for a local checkout, or install the small native Helper. No Node runtime is needed for players." >&2
exit 1
