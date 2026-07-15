#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

# The standalone Command Line Tools bundle ships Swift Testing as a framework,
# but its generated SwiftPM runner does not add that framework search path.
if swift test -help 2>&1 | grep -q -- '--enable-swift-testing'; then
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
fi

# Full Xcode runners discover Swift Testing without the standalone flag.
exec swift test "$@"
