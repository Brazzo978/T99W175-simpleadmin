#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD_DIR="$SCRIPT_DIR/qcport_payload"
REMOTE_DIR="/tmp/qcport_payload"
ADB_BIN="${ADB_BIN:-adb}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[QCPORT][ERROR] Missing command: $1" >&2
    exit 1
  }
}

echo "[QCPORT] Starting ADB deployment"
need_cmd "$ADB_BIN"
[ -d "$PAYLOAD_DIR" ] || {
  echo "[QCPORT][ERROR] Missing payload dir: $PAYLOAD_DIR" >&2
  exit 1
}

"$ADB_BIN" wait-for-device
"$ADB_BIN" shell "id >/dev/null 2>&1" >/dev/null

echo "[QCPORT] Preparing remote directory: $REMOTE_DIR"
"$ADB_BIN" shell "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR'"
echo "[QCPORT] Pushing payload..."
"$ADB_BIN" push "$PAYLOAD_DIR/." "$REMOTE_DIR/" >/dev/null

echo "[QCPORT] Running installer on modem"
"$ADB_BIN" shell "chmod 755 '$REMOTE_DIR/install_modem.sh' && sh '$REMOTE_DIR/install_modem.sh'"

echo "[QCPORT] Deployment completed"
