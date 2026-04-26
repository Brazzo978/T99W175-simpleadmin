#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/tailscale/tailscale.git"
STABLE_INDEX_URL="https://pkgs.tailscale.com/stable/"
OUT_DIR="$SCRIPT_DIR"
WORKDIR=""
KEEP_WORKDIR=0
TS_VERSION=""
MODEM_REVISION="1"
USE_UPX=1
PRINT_LATEST=0

OUTPUT_NAME_UPX="tailscaled-armv7-sdxprairie-latest.upx"
OUTPUT_NAME_RAW="tailscaled-armv7-sdxprairie-latest"
VERSION_FILE_NAME="VERSION.md"

usage() {
    cat <<'EOF'
Usage: build_tailscale_modem.sh [options]

Build the custom Tailscale binary used by the modem integration.

Options:
  -v, --version X.Y.Z     Build a specific Tailscale version.
                          Default: latest stable from pkgs.tailscale.com.
  -r, --revision N        Set modem metadata revision suffix. Default: 1
                          Example output version: 1.94.2-modem.1
  -o, --out-dir DIR       Output directory. Default: script directory.
  -w, --workdir DIR       Reuse a specific work directory.
      --keep-workdir      Do not delete the temporary work directory.
      --no-upx            Skip UPX compression.
      --print-latest      Print the latest stable version and exit.
  -h, --help              Show this help.

Outputs:
  - tailscaled-armv7-sdxprairie-latest.upx
  - VERSION.md

Requirements:
  - git
  - go
  - perl
  - curl
  - upx or upx-ucl (required unless --no-upx is used)
EOF
}

log() {
    printf '%s\n' "$*"
}

have_cmd() {
    command -v "$1" >/dev/null 2>&1
}

need_cmd() {
    if ! have_cmd "$1"; then
        log "Missing required command: $1"
        exit 1
    fi
}

latest_stable_version() {
    curl -fsSL "$STABLE_INDEX_URL" \
        | grep -oE 'tailscale_[0-9]+\.[0-9]+\.[0-9]+' \
        | sed 's/^tailscale_//' \
        | sort -V \
        | tail -n 1
}

find_upx() {
    if have_cmd upx-ucl; then
        printf '%s\n' "upx-ucl"
        return 0
    fi
    if have_cmd upx; then
        printf '%s\n' "upx"
        return 0
    fi
    return 1
}

patch_localapi_access() {
    local file="$1"

    if grep -q 'MODEM PATCH: allow local CLI access on embedded builds' "$file"; then
        return 0
    fi

    perl -0pi -e 's/lah\.PermitCert = actor\.CanFetchCerts\(\)\n\t\t\}/lah.PermitCert = actor.CanFetchCerts()\n\t\t\t\/\/ MODEM PATCH: allow local CLI access on embedded builds\n\t\t\tlah.PermitRead, lah.PermitWrite = true, true\n\t\t}/' "$file"

    if ! grep -q 'MODEM PATCH: allow local CLI access on embedded builds' "$file"; then
        log "Failed to patch local API access in $file"
        exit 1
    fi
}

write_version_file() {
    local target="$1"
    local version_string="$2"

    cat > "$target" <<EOF
- Current-Version: \`${version_string}\`
- Source-Tag: \`v${TS_VERSION}\`
- Build-Flavor: \`modem\`
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -v|--version)
            TS_VERSION="${2:-}"
            shift 2
            ;;
        -r|--revision)
            MODEM_REVISION="${2:-}"
            shift 2
            ;;
        -o|--out-dir)
            OUT_DIR="${2:-}"
            shift 2
            ;;
        -w|--workdir)
            WORKDIR="${2:-}"
            shift 2
            ;;
        --keep-workdir)
            KEEP_WORKDIR=1
            shift
            ;;
        --no-upx)
            USE_UPX=0
            shift
            ;;
        --print-latest)
            PRINT_LATEST=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

need_cmd git
need_cmd curl

if [ "$PRINT_LATEST" -eq 1 ]; then
    latest_stable_version
    exit 0
fi

need_cmd go
need_cmd perl

if [ "$USE_UPX" -eq 1 ] && ! find_upx >/dev/null 2>&1; then
    log "UPX is required for a modem-compatible artifact."
    log "Install upx or upx-ucl, or use --no-upx if you only want an uncompressed test build."
    exit 1
fi

if [ -z "$TS_VERSION" ]; then
    TS_VERSION="$(latest_stable_version)"
fi

if [ -z "$TS_VERSION" ]; then
    log "Unable to determine the latest stable Tailscale version."
    exit 1
fi

mkdir -p "$OUT_DIR"

if [ -z "$WORKDIR" ]; then
    WORKDIR="$(mktemp -d)"
fi

cleanup() {
    if [ "$KEEP_WORKDIR" -eq 0 ] && [ -n "${WORKDIR:-}" ] && [ -d "$WORKDIR" ]; then
        rm -rf "$WORKDIR"
    fi
}
trap cleanup EXIT

SRC_DIR="$WORKDIR/tailscale-src"
RAW_BUILD_PATH="$WORKDIR/$OUTPUT_NAME_RAW"
FINAL_BUILD_PATH="$OUT_DIR/$OUTPUT_NAME_RAW"
FINAL_UPX_PATH="$OUT_DIR/$OUTPUT_NAME_UPX"
FINAL_VERSION_PATH="$OUT_DIR/$VERSION_FILE_NAME"
VERSION_STRING="${TS_VERSION}-modem.${MODEM_REVISION}"
UPX_BIN=""

log "Building Tailscale modem artifact"
log "  Source tag: v$TS_VERSION"
log "  Output dir: $OUT_DIR"
log "  Work dir:   $WORKDIR"

rm -rf "$SRC_DIR"
git clone --depth 1 --branch "v${TS_VERSION}" "$REPO_URL" "$SRC_DIR"

patch_localapi_access "$SRC_DIR/ipn/ipnserver/server.go"

pushd "$SRC_DIR" >/dev/null
BUILD_TAGS="$(go run ./cmd/featuretags --min --add=osrouter),ts_include_cli,ts_omit_unixsocketidentity"

CGO_ENABLED=0 \
GOOS=linux \
GOARCH=arm \
GOARM=7 \
go build \
    -tags="$BUILD_TAGS" \
    -trimpath \
    -ldflags='-s -w' \
    -o "$RAW_BUILD_PATH" \
    ./cmd/tailscaled
popd >/dev/null

if [ "$USE_UPX" -eq 1 ]; then
    UPX_BIN="$(find_upx)"
    "$UPX_BIN" --lzma --best -o "$FINAL_UPX_PATH" "$RAW_BUILD_PATH"
    log "Wrote compressed modem build: $FINAL_UPX_PATH"
else
    cp "$RAW_BUILD_PATH" "$FINAL_BUILD_PATH"
    chmod 755 "$FINAL_BUILD_PATH"
    log "Wrote uncompressed build: $FINAL_BUILD_PATH"
fi

write_version_file "$FINAL_VERSION_PATH" "$VERSION_STRING"

log "Wrote version metadata: $FINAL_VERSION_PATH"
log "Build complete."

