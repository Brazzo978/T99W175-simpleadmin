#!/bin/sh
# Build system_bridge (static ARM, musl) into bin/system_bridge.
#
#   deploy/system_bridge/build.sh
#
# Uses the musl cross compiler of a T99W175-diag-json-bridge checkout next
# to this repository, or the one named by CC.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
CC="${CC:-$HERE/../../../T99W175-diag-json-bridge/toolchains/arm-linux-musleabihf-cross/bin/arm-linux-musleabihf-gcc}"

if [ ! -x "$CC" ]; then
  echo "❌ No ARM musl compiler at $CC"
  echo "   Clone T99W175-diag-json-bridge next to this repository, or set CC."
  exit 1
fi

echo "🔨 Compiling system_bridge..."
mkdir -p "$HERE/bin"
"$CC" -O2 -static -s -Wall -Wextra -Wno-unused-parameter \
  "$HERE/src/system_bridge.c" "$HERE/src/ws.c" "$HERE/src/bands.c" "$HERE/src/auth.c" \
  -o "$HERE/bin/system_bridge"
echo "✅ bin/system_bridge ($(stat -c %s "$HERE/bin/system_bridge") bytes)"
