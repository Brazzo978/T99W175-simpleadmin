#!/bin/sh
set -eu

VERSION="Simple T99-1.0.5"
PAYLOAD_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_SRC="$PAYLOAD_DIR/www"
SCRIPTS_SRC="$PAYLOAD_DIR/scripts"
TAILSCALE_SRC="$PAYLOAD_DIR/Tailscale"
WEB_ROOT="/WEBSERVER"
WEB_DIR="$WEB_ROOT/www"
OPT_SCRIPTS="/opt/scripts"
SYSTEMD_DIR="/lib/systemd/system"
SYSTEMD_WANTS="$SYSTEMD_DIR/multi-user.target.wants"
ETC_SYSTEMD_WANTS="/etc/systemd/system/multi-user.target.wants"

log() {
    printf '[upgrade-1.0.5] %s\n' "$*"
}

warn() {
    printf '[upgrade-1.0.5][WARN] %s\n' "$*" >&2
}

die() {
    printf '[upgrade-1.0.5][ERROR] %s\n' "$*" >&2
    exit 1
}

require_dir() {
    [ -d "$1" ] || die "Missing payload directory: $1"
}

require_file() {
    [ -f "$1" ] || die "Missing payload file: $1"
}

copy_file() {
    src="$1"
    dst="$2"
    mode="$3"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    chmod "$mode" "$dst"
}

copy_tree_replace() {
    src="$1"
    dst="$2"
    tmp="${dst}.new.$$"

    rm -rf "$tmp"
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$tmp"
    rm -rf "$dst"
    mv "$tmp" "$dst"
}

backup_existing_web() {
    if [ -d "$WEB_DIR" ]; then
        BACKUP_DIR="/tmp/simpleadmin-www-backup-$(date +%Y%m%d-%H%M%S 2>/dev/null || echo now)"
        log "Backing up current web UI to $BACKUP_DIR"
        rm -rf "$BACKUP_DIR"
        cp -R "$WEB_DIR" "$BACKUP_DIR" || warn "Could not create web backup"
    else
        BACKUP_DIR=""
    fi
}

restore_user_state() {
    [ -n "${BACKUP_DIR:-}" ] || return 0

    if [ -f "$BACKUP_DIR/config/simpleadmin.conf" ]; then
        log "Preserving existing SimpleAdmin config"
        cp "$BACKUP_DIR/config/simpleadmin.conf" "$WEB_DIR/config/simpleadmin.conf"
    fi

    if [ -f "$BACKUP_DIR/cgi-bin/credentials.txt" ]; then
        log "Preserving existing credentials"
        cp "$BACKUP_DIR/cgi-bin/credentials.txt" "$WEB_DIR/cgi-bin/credentials.txt"
    fi
}

install_web_ui() {
    require_dir "$WEB_SRC"

    log "Stopping qcmap_httpd.service if present"
    systemctl stop qcmap_httpd.service >/dev/null 2>&1 || true

    backup_existing_web

    log "Installing web UI to $WEB_DIR"
    copy_tree_replace "$WEB_SRC" "$WEB_DIR"
    restore_user_state
    chmod -R 755 "$WEB_DIR"

    if [ -f "$WEB_DIR/config/simpleadmin.conf" ]; then
        chmod 644 "$WEB_DIR/config/simpleadmin.conf"
    fi
    if [ -f "$WEB_DIR/config/simpleadmin.conf.stock" ]; then
        chmod 644 "$WEB_DIR/config/simpleadmin.conf.stock"
    fi
    if [ -f "$WEB_DIR/cgi-bin/credentials.txt" ]; then
        chmod 600 "$WEB_DIR/cgi-bin/credentials.txt" || chmod 644 "$WEB_DIR/cgi-bin/credentials.txt"
    fi
    if [ -f "$WEB_DIR/cgi-bin/credentials.stock" ]; then
        chmod 600 "$WEB_DIR/cgi-bin/credentials.stock" || chmod 644 "$WEB_DIR/cgi-bin/credentials.stock"
    fi
}

install_runtime_scripts() {
    require_dir "$SCRIPTS_SRC"

    log "Installing runtime scripts"
    mkdir -p "$OPT_SCRIPTS/watchdog" "$OPT_SCRIPTS/ttl" /persist/cron /etc/init.d "$SYSTEMD_DIR" "$SYSTEMD_WANTS"

    copy_file "$SCRIPTS_SRC/watchdog/connection-watchdog" "$OPT_SCRIPTS/watchdog/connection-watchdog" 755

    if [ ! -f "$OPT_SCRIPTS/Watchdog" ]; then
        copy_file "$SCRIPTS_SRC/watchdog/Watchdog" "$OPT_SCRIPTS/Watchdog" 644
    else
        log "Keeping existing watchdog config at $OPT_SCRIPTS/Watchdog"
        chmod 644 "$OPT_SCRIPTS/Watchdog"
    fi

    copy_file "$SCRIPTS_SRC/ttl/ttl-override" "$OPT_SCRIPTS/ttl/ttl-override" 755
    if [ ! -f /persist/ttlvalue ]; then
        if [ -f "$SCRIPTS_SRC/ttl/ttlvalue" ]; then
            copy_file "$SCRIPTS_SRC/ttl/ttlvalue" /persist/ttlvalue 644
        else
            printf '0\n' > /persist/ttlvalue
            chmod 644 /persist/ttlvalue
        fi
    elif ! grep -Eq '^[[:space:]]*[0-9]{1,3}[[:space:]]*$' /persist/ttlvalue; then
        warn "Invalid /persist/ttlvalue found; resetting TTL override to 0"
        printf '0\n' > /persist/ttlvalue
        chmod 644 /persist/ttlvalue
    else
        log "Keeping existing TTL value at /persist/ttlvalue"
    fi

    copy_file "$SCRIPTS_SRC/init.d/crontab" /etc/init.d/crontab 755
    copy_file "$SCRIPTS_SRC/systemd/connection-watchdog.service" "$SYSTEMD_DIR/connection-watchdog.service" 644
    copy_file "$SCRIPTS_SRC/systemd/crontab.service" "$SYSTEMD_DIR/crontab.service" 644
    copy_file "$SCRIPTS_SRC/systemd/ttl-override.service" "$SYSTEMD_DIR/ttl-override.service" 644

    if [ -f "$SCRIPTS_SRC/systemd/euicc.service" ]; then
        copy_file "$SCRIPTS_SRC/systemd/euicc.service" "$SYSTEMD_DIR/euicc.service" 644
    fi
}

install_tailscale_payload() {
    [ -d "$TAILSCALE_SRC" ] || return 0

    log "Installing bundled Tailscale payload under /opt/simpleadmin/Tailscale"
    rm -rf /opt/simpleadmin/Tailscale
    mkdir -p /opt/simpleadmin
    cp -R "$TAILSCALE_SRC" /opt/simpleadmin/Tailscale
    chmod -R 755 /opt/simpleadmin/Tailscale
}

enable_services() {
    log "Enabling services"
    mkdir -p "$SYSTEMD_WANTS" "$ETC_SYSTEMD_WANTS"
    ln -sf "$SYSTEMD_DIR/crontab.service" "$SYSTEMD_WANTS/crontab.service"
    ln -sf "$SYSTEMD_DIR/ttl-override.service" "$SYSTEMD_WANTS/ttl-override.service"
    ln -sf "$SYSTEMD_DIR/connection-watchdog.service" "$SYSTEMD_WANTS/connection-watchdog.service"
    ln -sf "$SYSTEMD_DIR/crontab.service" "$ETC_SYSTEMD_WANTS/crontab.service"
    ln -sf "$SYSTEMD_DIR/ttl-override.service" "$ETC_SYSTEMD_WANTS/ttl-override.service"
    ln -sf "$SYSTEMD_DIR/connection-watchdog.service" "$ETC_SYSTEMD_WANTS/connection-watchdog.service"

    if command -v systemctl >/dev/null 2>&1; then
        systemctl daemon-reload >/dev/null 2>&1 || true
        systemctl enable crontab.service >/dev/null 2>&1 || true
        systemctl enable ttl-override.service >/dev/null 2>&1 || true
        systemctl enable connection-watchdog.service >/dev/null 2>&1 || true

        systemctl restart crontab.service >/dev/null 2>&1 || systemctl start crontab.service >/dev/null 2>&1 || true
        systemctl restart ttl-override.service >/dev/null 2>&1 || true

        if grep -q '^WD_ENABLED="1"' "$OPT_SCRIPTS/Watchdog" 2>/dev/null; then
            systemctl restart connection-watchdog.service >/dev/null 2>&1 || true
        else
            systemctl stop connection-watchdog.service >/dev/null 2>&1 || true
        fi

        systemctl start qcmap_httpd.service >/dev/null 2>&1 || true
    else
        /etc/init.d/crontab start >/dev/null 2>&1 || true
    fi
}

verify_install() {
    log "Verifying install"
    require_file "$WEB_DIR/js/app-version.js"
    require_file "$WEB_DIR/cgi-bin/session_utils.sh"
    require_file "$WEB_DIR/cgi-bin/connection_watchdog"
    require_file "$WEB_DIR/cgi-bin/set_ttl"
    require_file "$OPT_SCRIPTS/watchdog/connection-watchdog"
    require_file "$OPT_SCRIPTS/ttl/ttl-override"
    require_file "$SYSTEMD_DIR/connection-watchdog.service"
    require_file "$SYSTEMD_DIR/crontab.service"
    require_file "$SYSTEMD_DIR/ttl-override.service"

    if grep -q 'Simple T99-1.0.5' "$WEB_DIR/js/app-version.js"; then
        log "Version check OK: $VERSION"
    else
        die "Installed web UI does not contain $VERSION"
    fi
}

main() {
    [ "$(id -u)" = "0" ] || die "Run this script as root on the modem"
    require_dir "$WEB_SRC"
    require_dir "$SCRIPTS_SRC"

    log "Starting modem-side upgrade to $VERSION"
    install_web_ui
    install_runtime_scripts
    install_tailscale_payload
    enable_services
    verify_install
    log "Upgrade completed successfully"
}

main "$@"
