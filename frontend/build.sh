#!/bin/sh
# Builds the web UI (Next.js static export) and publishes it to
# deploy/www-nextjs/, which ./install.sh installs (the default front-end) on
# top of the CGIs and configuration in deploy/www/.
#
# The output is versioned, like the system_bridge binary, so installing
# needs no Node.js toolchain.
#
# Usage: frontend/build.sh [--install]   (--install runs npm ci first)
set -eu

cd "$(dirname "$0")"
DEST=../deploy/www-nextjs

if [ "${1:-}" = "--install" ] || [ ! -d node_modules ]; then
  echo "📦 Installing dependencies"
  npm ci --no-audit --no-fund
fi

echo "🏗️  Building the static export"
rm -rf .next out
npx next build

echo "📤 Publishing to deploy/www-nextjs"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R out/. "$DEST/"
# Stamp read by install.sh: sources newer than it mean a stale build.
git describe --always --dirty --tags 2>/dev/null > "$DEST/BUILD" ||
  echo unknown > "$DEST/BUILD"

files=$(find "$DEST" -type f | wc -l)
size=$(du -sk "$DEST" | cut -f1)
echo "✅ $files files, ${size} KB in deploy/www-nextjs ($(cat "$DEST/BUILD"))"
