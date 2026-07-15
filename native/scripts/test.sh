#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

DEVELOPER_DIR_PATH="$(xcode-select -p 2>/dev/null || true)"
if printf '%s' "$DEVELOPER_DIR_PATH" | grep -q '/Xcode.app/'; then
  # GitHub's full Xcode toolchain discovers Swift Testing automatically; the
  # explicit flag only exists in newer standalone toolchains.
  exec swift test "$@"
fi

# The standalone Command Line Tools bundle ships Swift Testing as a framework,
# but its generated SwiftPM runner does not add that framework search path.
FRAMEWORKS="/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
exec swift test \
  --enable-swift-testing \
  -Xswiftc -F \
  -Xswiftc "$FRAMEWORKS" \
  -Xswiftc -Xfrontend \
  -Xswiftc -disable-cross-import-overlays \
  -Xlinker -rpath \
  -Xlinker "$FRAMEWORKS" \
  "$@"
