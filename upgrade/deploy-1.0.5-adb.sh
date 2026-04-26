#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_ARCHIVE="${1:-$SCRIPT_DIR/simpleadmin-1.0.5-payload.tar.gz}"
REMOTE_ARCHIVE="/tmp/simpleadmin-1.0.5-payload.tar.gz"
REMOTE_DIR="/tmp/simpleadmin-1.0.5-payload"

log() {
    printf '[simpleadmin-deploy] %s\n' "$*"
}

die() {
    printf '[simpleadmin-deploy][ERROR] %s\n' "$*" >&2
    exit 1
}

command -v adb >/dev/null 2>&1 || die "adb not found in PATH"
[ -f "$PAYLOAD_ARCHIVE" ] || die "Payload archive not found: $PAYLOAD_ARCHIVE"

log "Waiting for ADB device"
adb wait-for-device

log "Using device:"
adb devices -l | sed -n '2p'

log "Pushing payload archive to modem"
adb push "$PAYLOAD_ARCHIVE" "$REMOTE_ARCHIVE"

log "Extracting payload and running modem-side upgrade"
adb shell "cd /tmp && rm -rf '$REMOTE_DIR' && tar -xzf '$REMOTE_ARCHIVE' && sh '$REMOTE_DIR/upgrade-to-1.0.5.sh'"

log "Done"
