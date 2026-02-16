#!/bin/sh
set -eu

PAYLOAD_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
FILES_DIR="$PAYLOAD_DIR/files"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/tmp/qcport_payload_backup_$TS"
CHANGED=0

log() { printf '%s\n' "[QCPORT] $*"; }
warn() { printf '%s\n' "[QCPORT][WARN] $*" >&2; }
die() { printf '%s\n' "[QCPORT][ERROR] $*" >&2; exit 1; }

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

backup_if_exists() {
    src="$1"
    [ -e "$src" ] || return 0
    dst="$BACKUP_DIR$src"
    mkdir -p "$(dirname "$dst")"
    cp -a "$src" "$dst"
}

install_file() {
    src="$1"
    dst="$2"
    mode="$3"
    [ -f "$src" ] || die "Missing payload file: $src"
    backup_if_exists "$dst"
    mkdir -p "$(dirname "$dst")"
    cp -f "$src" "$dst"
    chmod "$mode" "$dst"
    CHANGED=1
}

link_enable_service() {
    svc="$1"
    mkdir -p /lib/systemd/system/multi-user.target.wants
    ln -sfn "/lib/systemd/system/$svc" "/lib/systemd/system/multi-user.target.wants/$svc"
}

disable_socat_unit() {
    unit="$1"
    systemctl stop "$unit" >/dev/null 2>&1 || true
    systemctl disable "$unit" >/dev/null 2>&1 || true

    if [ -f "/lib/systemd/system/$unit" ]; then
        backup_if_exists "/lib/systemd/system/$unit"
        mv "/lib/systemd/system/$unit" "/lib/systemd/system/$unit.disabled"
        CHANGED=1
    fi
}

install_atcli_stack() {
    log "Installing atcli binaries and disabling socat bridge units"
    install_file "$FILES_DIR/bin/atcli" "/usrdata/simpleadmin/atcli" 755
    install_file "$FILES_DIR/bin/atcli_smd11" "/usrdata/simpleadmin/atcli_smd11" 755

    disable_socat_unit "socat-smd7.service"
    disable_socat_unit "socat-smd7-to-ttyIN2.service"
    disable_socat_unit "socat-smd7-from-ttyIN2.service"
    disable_socat_unit "socat-smd7-to-ttyIN.service"
    disable_socat_unit "socat-smd7-from-ttyIN.service"
    disable_socat_unit "socat-smd11.service"
    disable_socat_unit "socat-smd11-to-ttyIN.service"
    disable_socat_unit "socat-smd11-from-ttyIN.service"

    log "Applying udev permissions for /dev/smd7 and /dev/smd11"
    install_file "$FILES_DIR/udev/99-smd-perms.rules" "/etc/udev/rules.d/99-smd-perms.rules" 644

    if command -v udevadm >/dev/null 2>&1; then
        udevadm control --reload-rules >/dev/null 2>&1 || true
        udevadm trigger --action=add --name-match=smd7 --name-match=smd11 >/dev/null 2>&1 || true
        udevadm settle >/dev/null 2>&1 || true
    fi

    chgrp radio /dev/smd7 /dev/smd11 >/dev/null 2>&1 || true
    chmod 660 /dev/smd7 /dev/smd11 >/dev/null 2>&1 || true
}

install_disable_ssh_menu() {
    log "Disabling auto console menu on SSH login"
    backup_if_exists "/usrdata/root/.profile"
    cat > /usrdata/root/.profile <<'EOF'
#!/bin/bash

# Path
export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/opt/bin:/opt/sbin:/usrdata/root/bin

# Post-login execution
# Run interactive menu only on local console, not over SSH.
if [ -z "$SSH_CONNECTION" ]; then
  /usrdata/simpleadmin/console/menu/start_menu.sh
fi
EOF
    chmod 755 /usrdata/root/.profile
    CHANGED=1
}

install_auto_reboot_cron() {
    log "Installing auto reboot cron stack"
    install_file "$FILES_DIR/etc-init.d/crontab" "/etc/init.d/crontab" 755
    install_file "$FILES_DIR/systemd/crontab.service" "/lib/systemd/system/crontab.service" 644
    install_file "$FILES_DIR/cgi-bin/reboot_schedule" "/usrdata/simpleadmin/www/cgi-bin/reboot_schedule" 755

    link_enable_service "crontab.service"
    systemctl daemon-reload
    systemctl start crontab >/dev/null 2>&1 || true
}

install_rootfs_rw_on_boot() {
    log "Installing rootfs-rw.service"
    backup_if_exists "/lib/systemd/system/rootfs-rw.service"
    cat > /lib/systemd/system/rootfs-rw.service <<'EOF'
[Unit]
Description=Remount root filesystem as read-write
DefaultDependencies=no
After=local-fs.target
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/mount -o remount,rw /
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 /lib/systemd/system/rootfs-rw.service
    link_enable_service "rootfs-rw.service"
    systemctl daemon-reload
    systemctl start rootfs-rw.service >/dev/null 2>&1 || true
    CHANGED=1
}

install_ttl_clean() {
    log "Installing clean TTL backend and CGI"
    install_file "$FILES_DIR/cgi-bin/set_ttl" "/usrdata/simpleadmin/www/cgi-bin/set_ttl" 755
    install_file "$FILES_DIR/cgi-bin/get_ttl_status" "/usrdata/simpleadmin/www/cgi-bin/get_ttl_status" 755
    install_file "$FILES_DIR/simplefirewall/ttl-override" "/usrdata/simplefirewall/ttl-override" 755
    install_file "$FILES_DIR/systemd/ttl-override.service" "/lib/systemd/system/ttl-override.service" 644

    if [ ! -f /usrdata/simplefirewall/ttlvalue ]; then
        mkdir -p /usrdata/simplefirewall
        printf '0\n' > /usrdata/simplefirewall/ttlvalue
        chmod 666 /usrdata/simplefirewall/ttlvalue
        CHANGED=1
    fi

    link_enable_service "ttl-override.service"
    systemctl daemon-reload
    systemctl restart ttl-override >/dev/null 2>&1 || true
}

run_tests() {
    log "Running post-install tests"
    test -x /usrdata/simpleadmin/atcli || die "atcli missing: /usrdata/simpleadmin/atcli"
    test -x /usrdata/simpleadmin/atcli_smd11 || die "atcli_smd11 missing: /usrdata/simpleadmin/atcli_smd11"
    grep -q 'if \[ -z "\$SSH_CONNECTION" \]' /usrdata/root/.profile || die "SSH menu guard not found in /usrdata/root/.profile"

    test -f /lib/systemd/system/crontab.service || die "crontab.service missing"
    test -x /etc/init.d/crontab || die "/etc/init.d/crontab missing/executable"
    test -x /usrdata/simpleadmin/www/cgi-bin/reboot_schedule || die "reboot_schedule missing/executable"

    test -f /lib/systemd/system/rootfs-rw.service || die "rootfs-rw.service missing"
    test -x /usrdata/simpleadmin/www/cgi-bin/set_ttl || die "set_ttl missing/executable"
    test -x /usrdata/simpleadmin/www/cgi-bin/get_ttl_status || die "get_ttl_status missing/executable"
    test -x /usrdata/simplefirewall/ttl-override || die "ttl-override missing/executable"
    test -f /lib/systemd/system/ttl-override.service || die "ttl-override.service missing"

    sh -n /usrdata/simpleadmin/www/cgi-bin/reboot_schedule || die "Syntax check failed: reboot_schedule"
    sh -n /usrdata/simpleadmin/www/cgi-bin/set_ttl || die "Syntax check failed: set_ttl"
    sh -n /usrdata/simpleadmin/www/cgi-bin/get_ttl_status || die "Syntax check failed: get_ttl_status"
    sh -n /usrdata/simplefirewall/ttl-override || die "Syntax check failed: ttl-override"

    /usrdata/simplefirewall/ttl-override restart >/dev/null 2>&1 || die "ttl-override restart failed"

    test -f /etc/udev/rules.d/99-smd-perms.rules || die "Missing udev rule: /etc/udev/rules.d/99-smd-perms.rules"

    if command -v systemctl >/dev/null 2>&1; then
        systemctl status crontab --no-pager >/dev/null 2>&1 || warn "crontab status check failed"
        systemctl status rootfs-rw.service --no-pager >/dev/null 2>&1 || warn "rootfs-rw status check failed"
    fi

    log "All tests passed"
}

print_summary() {
    log "Backup directory: $BACKUP_DIR"
    log "Applied modules:"
    log " - atcmd_to_atcli"
    log " - DISABLE_SSH_CONSOLE_MENU"
    log " - ENABLE_AUTO_REBOOT_CRON"
    log " - ENABLE_ROOTFS_RW_ON_BOOT"
    log " - ENABLE_TTL_CLEAN_502"
}

main() {
    [ "$(id -u)" = "0" ] || die "Run as root"
    need_cmd cp
    need_cmd chmod
    need_cmd mkdir
    need_cmd systemctl
    mkdir -p "$BACKUP_DIR"

    install_atcli_stack
    install_disable_ssh_menu
    install_auto_reboot_cron
    install_rootfs_rw_on_boot
    install_ttl_clean
    run_tests
    print_summary
    log "OK"
}

main "$@"
