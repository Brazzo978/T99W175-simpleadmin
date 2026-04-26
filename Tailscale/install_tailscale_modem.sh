#!/bin/sh

set -eu

REPO_OWNER="${REPO_OWNER:-Brazzo978}"
REPO_NAME="${REPO_NAME:-T99W175-simpleadmin}"
REPO_BRANCH="${REPO_BRANCH:-Beta}"
REPO_TAILSCALE_DIR="${REPO_TAILSCALE_DIR:-Tailscale}"
BIN_NAME="${BIN_NAME:-tailscaled-armv7-sdxprairie-latest.upx}"
BIN_URL_DEFAULT="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${REPO_TAILSCALE_DIR}/${BIN_NAME}"
BIN_URL="${BIN_URL:-$BIN_URL_DEFAULT}"
VERSION_URL_DEFAULT="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${REPO_TAILSCALE_DIR}/VERSION.md"
VERSION_URL="${VERSION_URL:-$VERSION_URL_DEFAULT}"

BASE_DIR="/data/tailscale"
BIN_PATH="${BASE_DIR}/tailscaled"
CLI_PATH="${BASE_DIR}/tailscale"
CONFIG_PATH="${BASE_DIR}/config.json"
STATE_PATH="${BASE_DIR}/tailscaled.state"
LOG_PATH="${BASE_DIR}/tailscaled.log"
INSTALLED_VERSION_PATH="${BASE_DIR}/VERSION.md"
SERVICE_PATH="/lib/systemd/system/tailscaled.service"
SOCKET_PATH="/var/run/tailscale/tailscaled.sock"
AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"
HOSTNAME_VALUE="${TAILSCALE_HOSTNAME:-}"
REMOVE_ONLY=0
UPDATE_ONLY=0
REMOTE_VERSION=""
INSTALLED_VERSION=""

usage() {
    cat <<EOF
Usage: $0 [-R] [-U] [-k AUTH_KEY] [-H HOSTNAME] [-b BIN_URL] [-v VERSION_URL]

Options:
  -R            Remove Tailscale and all deployed files.
  -U            Update only if remote VERSION.md is newer than installed one.
  -k AUTH_KEY   Create or replace ${CONFIG_PATH} with this auth key.
  -H HOSTNAME   Optional hostname to write into ${CONFIG_PATH}.
  -b BIN_URL    Override the binary URL.
  -v VERSION_URL Override the version metadata URL.

Env:
  TAILSCALE_AUTH_KEY   Same as -k
  TAILSCALE_HOSTNAME   Same as -H
  BIN_URL              Same as -b
  VERSION_URL          Same as -v
EOF
}

log() {
    printf '%s\n' "$*"
}

need_root() {
    if [ "$(id -u)" != "0" ]; then
        log "This script must run as root."
        exit 1
    fi
}

have_cmd() {
    command -v "$1" >/dev/null 2>&1
}

download_file() {
    url="$1"
    dest="$2"
    if have_cmd wget; then
        wget -O "$dest" "$url"
        return
    fi
    if have_cmd curl; then
        curl -fsSL "$url" -o "$dest"
        return
    fi
    log "Neither curl nor wget is available."
    exit 1
}

extract_version() {
    file_path="$1"
    if [ ! -f "$file_path" ]; then
        return 1
    fi
    sed -n 's/^- Current-Version: `\([^`]*\)`/\1/p' "$file_path" | head -n 1
}

fetch_remote_version_file() {
    tmp_version="/tmp/tailscale-version.md"
    download_file "$VERSION_URL" "$tmp_version"
    printf '%s\n' "$tmp_version"
}

copy_version_file() {
    src="$1"
    mkdir -p "$BASE_DIR"
    cp "$src" "$INSTALLED_VERSION_PATH"
    chmod 644 "$INSTALLED_VERSION_PATH"
}

versions_differ() {
    [ "$REMOTE_VERSION" != "$INSTALLED_VERSION" ]
}

write_config() {
    mkdir -p "$BASE_DIR"
    chmod 700 "$BASE_DIR"
    {
        printf '{\n'
        printf '  "Version": "alpha0",\n'
        printf '  "AuthKey": "%s",\n' "$AUTH_KEY"
        printf '  "Enabled": true,\n'
        if [ -n "$HOSTNAME_VALUE" ]; then
            printf '  "Hostname": "%s",\n' "$HOSTNAME_VALUE"
        fi
        printf '  "AcceptDNS": false,\n'
        printf '  "AcceptRoutes": false,\n'
        printf '  "RunSSHServer": false,\n'
        printf '  "RunWebClient": false\n'
        printf '}\n'
    } > "$CONFIG_PATH"
    chmod 600 "$CONFIG_PATH"
}

write_service() {
    mkdir -p /var/run/tailscale
    cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Tailscale node agent (modem custom build)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${BIN_PATH} --config=${CONFIG_PATH} --state=${STATE_PATH} --socket=${SOCKET_PATH} --statedir=${BASE_DIR}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 "$SERVICE_PATH"
}

install_symlinks() {
    ln -sf "$BIN_PATH" "$CLI_PATH"
    ln -sf "$BIN_PATH" /usr/bin/tailscaled
    ln -sf "$CLI_PATH" /usr/bin/tailscale
}

install_binary() {
    tmp_bin="/tmp/${BIN_NAME}"
    download_file "$BIN_URL" "$tmp_bin"
    mkdir -p "$BASE_DIR"
    chmod 700 "$BASE_DIR"
    cp "$tmp_bin" "$BIN_PATH"
    chmod 755 "$BIN_PATH"
    rm -f "$tmp_bin"
}

start_service() {
    systemctl daemon-reload
    systemctl enable tailscaled.service >/dev/null 2>&1 || true
    systemctl restart tailscaled.service
    sleep 3
    systemctl --no-pager --full status tailscaled.service | sed -n '1,20p'
}

uninstall_all() {
    systemctl stop tailscaled.service >/dev/null 2>&1 || true
    systemctl disable tailscaled.service >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/multi-user.target.wants/tailscaled.service
    rm -f "$SERVICE_PATH"
    systemctl daemon-reload || true
    rm -f /usr/bin/tailscale /usr/bin/tailscaled
    rm -rf "$BASE_DIR"
    rm -f "$SOCKET_PATH"
    rmdir /var/run/tailscale >/dev/null 2>&1 || true
    log "Tailscale removed from modem."
}

while getopts "RUk:H:b:v:h" opt; do
    case "$opt" in
        R) REMOVE_ONLY=1 ;;
        U) UPDATE_ONLY=1 ;;
        k) AUTH_KEY="$OPTARG" ;;
        H) HOSTNAME_VALUE="$OPTARG" ;;
        b) BIN_URL="$OPTARG" ;;
        v) VERSION_URL="$OPTARG" ;;
        h) usage; exit 0 ;;
        *) usage; exit 1 ;;
    esac
done

need_root

if [ "$REMOVE_ONLY" -eq 1 ]; then
    uninstall_all
    exit 0
fi

tmp_remote_version="$(fetch_remote_version_file)"
REMOTE_VERSION="$(extract_version "$tmp_remote_version" || true)"
INSTALLED_VERSION="$(extract_version "$INSTALLED_VERSION_PATH" || true)"

if [ -z "$REMOTE_VERSION" ]; then
    log "Could not read remote version metadata from ${VERSION_URL}."
    exit 1
fi

if [ "$UPDATE_ONLY" -eq 1 ] && [ -n "$INSTALLED_VERSION" ] && ! versions_differ; then
    log "Installed version is already current: ${INSTALLED_VERSION}"
    rm -f "$tmp_remote_version"
    exit 0
fi

if [ -n "$AUTH_KEY" ]; then
    write_config
elif [ ! -f "$CONFIG_PATH" ]; then
    log "No auth key provided and ${CONFIG_PATH} does not exist."
    log "Use -k AUTH_KEY or set TAILSCALE_AUTH_KEY."
    exit 1
fi

install_binary
install_symlinks
write_service
copy_version_file "$tmp_remote_version"
rm -f "$tmp_remote_version"
start_service

log ""
log "Installed files:"
log "  Binary: ${BIN_PATH}"
log "  CLI:    /usr/bin/tailscale"
log "  Config: ${CONFIG_PATH}"
log "  State:  ${STATE_PATH}"
log "  Log:    ${LOG_PATH}"
log "  Version:${INSTALLED_VERSION_PATH}"
log ""
log "Notes:"
log "  - This build is custom for the modem."
log "  - Remote version: ${REMOTE_VERSION}"
if [ -n "$INSTALLED_VERSION" ]; then
log "  - Previous installed version: ${INSTALLED_VERSION}"
fi
log "  - Service socket path: ${SOCKET_PATH}"
log "  - If 'tailscale status' is restricted on this firmware, inspect ${LOG_PATH}."
