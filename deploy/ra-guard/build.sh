#!/bin/sh
# Build ra-guard (static ARM, musl) into bin/ra-guard.
#
#   deploy/ra-guard/build.sh
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

echo "🔨 Compiling ra-guard..."
mkdir -p "$HERE/bin"
"$CC" -O2 -static -s -Wall -Wextra "$HERE/src/ra-guard.c" -o "$HERE/bin/ra-guard"
echo "✅ bin/ra-guard ($(stat -c %s "$HERE/bin/ra-guard") bytes)"
