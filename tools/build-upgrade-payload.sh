#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/dist/simpleadmin-1.0.5-payload}"
ARCHIVE_PATH="${OUT_DIR}.tar.gz"

log() {
    printf '[build-payload] %s\n' "$*"
}

rm -rf "$OUT_DIR" "$ARCHIVE_PATH"
mkdir -p "$OUT_DIR"

log "Creating payload at $OUT_DIR"
cp -R "$ROOT_DIR/www" "$OUT_DIR/www"
cp -R "$ROOT_DIR/scripts" "$OUT_DIR/scripts"
cp -R "$ROOT_DIR/Tailscale" "$OUT_DIR/Tailscale"
cp "$ROOT_DIR/upgrade/upgrade-to-1.0.5.sh" "$OUT_DIR/upgrade-to-1.0.5.sh"
cp "$ROOT_DIR/VERSION.md" "$OUT_DIR/VERSION.md"

chmod +x "$OUT_DIR/upgrade-to-1.0.5.sh"
chmod +x "$OUT_DIR/scripts/watchdog/connection-watchdog"
chmod +x "$OUT_DIR/scripts/ttl/ttl-override"
chmod +x "$OUT_DIR/scripts/init.d/crontab"

log "Creating archive $ARCHIVE_PATH"
tar -C "$(dirname "$OUT_DIR")" -czf "$ARCHIVE_PATH" "$(basename "$OUT_DIR")"

log "Payload ready"
log "Release asset:"
log "  $ARCHIVE_PATH"
log "Modem-side download:"
log "  cd /tmp && rm -rf simpleadmin-1.0.5-payload && wget -qO- https://github.com/Brazzo978/T99W175-simpleadmin/releases/download/1.0.5/simpleadmin-1.0.5-payload.tar.gz | tar -xz"
log "  sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh"
log "ADB:"
log "  adb push \"$OUT_DIR\" /tmp/simpleadmin-1.0.5-payload"
log "  adb shell sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh"
log "SSH:"
log "  scp -r \"$OUT_DIR\" root@192.168.225.1:/tmp/simpleadmin-1.0.5-payload"
log "  ssh root@192.168.225.1 'sh /tmp/simpleadmin-1.0.5-payload/upgrade-to-1.0.5.sh'"
