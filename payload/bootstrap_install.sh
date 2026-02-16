#!/bin/sh
set -eu

# Download and run payload directly from modem shell:
# curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<ref>/payload/bootstrap_install.sh | sh -s -- --repo <owner>/<repo> --ref <ref>

REPO="${REPO:-}"
REF="${REF:-main}"
WORKDIR="/tmp/qcport_payload_bootstrap"

die() {
    echo "[QCPORT][ERROR] $*" >&2
    exit 1
}

log() {
    echo "[QCPORT] $*"
}

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --repo)
            REPO="${2:-}"
            shift 2
            ;;
        --ref)
            REF="${2:-}"
            shift 2
            ;;
        *)
            die "Unknown arg: $1"
            ;;
    esac
done

[ -n "$REPO" ] || die "Set repository via --repo <owner/repo> or REPO env"

need_cmd curl
need_cmd tar
need_cmd sh

ARCHIVE_URL="https://codeload.github.com/$REPO/tar.gz/$REF"
log "Downloading repository archive: $ARCHIVE_URL"

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

curl -fL "$ARCHIVE_URL" -o repo.tgz
tar -xzf repo.tgz

TOP_DIR="$(find . -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -n "$TOP_DIR" ] || die "Unable to find extracted repository directory"

INSTALLER="$TOP_DIR/payload/qcport_payload/install_modem.sh"
[ -f "$INSTALLER" ] || die "Installer not found in archive: $INSTALLER"

chmod 755 "$INSTALLER"
log "Running modem installer"
sh "$INSTALLER"

log "Done"
