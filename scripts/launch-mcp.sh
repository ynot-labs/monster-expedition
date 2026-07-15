#!/bin/sh
set -eu

APP_NAME="Monster Expedition.app"

HELPER=""
for app_root in "/Applications/$APP_NAME" "$HOME/Applications/$APP_NAME"; do
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

echo "Monster Expedition.app is not installed." >&2
echo "Install the small native Helper first; no Node runtime is needed for players." >&2
exit 1
