#!/bin/bash
# Install the persistent-MAC fix on a T99W175 modem.
# Mirrors deploy-www.sh style: optional HOST as first arg, ssh-based push.
#
# Two stages installed:
#   1. udev rule + script  -> pins eth0 MAC at r8125 driver-add time.
#   2. ifconfig wrapper    -> intercepts QCMAP's bridge0 MAC-set and substitutes
#                              the value from <EarlyEthMACAddr>.
#
# Usage:
#   ./install.sh                  # default host 192.168.225.1
#   ./install.sh 192.168.225.1    # explicit host
#   ./install.sh --uninstall      # full revert
#   ./install.sh 1.2.3.4 --uninstall

set -e

REMOTE_USER="root"
REMOTE_HOST="192.168.225.1"
MODE="install"

if [ $# -gt 0 ] && [[ ! "$1" =~ ^-- ]]; then
    REMOTE_HOST="$1"
    shift
fi

for arg in "$@"; do
    case "$arg" in
        --uninstall) MODE="uninstall" ;;
        --help|-h)
            echo "Usage: $0 [HOST] [--uninstall]"
            echo "  HOST defaults to 192.168.225.1"
            exit 0
            ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH="ssh -o BatchMode=yes ${REMOTE_USER}@${REMOTE_HOST}"

if [ "$MODE" = "uninstall" ]; then
    echo "[*] Uninstalling persistent-MAC fix on ${REMOTE_USER}@${REMOTE_HOST}..."
    $SSH '
        # Restore real ifconfig
        if [ -e /sbin/ifconfig.real ]; then
            rm -f /sbin/ifconfig
            mv /sbin/ifconfig.real /sbin/ifconfig
            echo "  /sbin/ifconfig restored"
        fi
        # Remove udev rule + script
        rm -f /etc/udev/rules.d/98-eth0-fixed-mac.rules
        rm -f /etc/udev/scripts/set-eth0-mac.sh
        echo "  udev rule + script removed"
        # Clean up any leftover from prior systemd-based version of this fix
        systemctl disable set-bridge0-mac.service 2>/dev/null || true
        rm -f /etc/systemd/system/set-bridge0-mac.service
        rm -f /etc/systemd/system/multi-user.target.wants/set-bridge0-mac.service
        rm -f /etc/udev/scripts/set-bridge0-mac.sh
        systemctl daemon-reload
        echo "done"'
    echo "[*] Reboot the modem to fully revert (eth0 will go back to random-per-boot)."
    exit 0
fi

echo "[*] Installing persistent-MAC fix on ${REMOTE_USER}@${REMOTE_HOST}..."

# ---- stage 1: eth0 udev rule + script ----
cat "$SCRIPT_DIR/98-eth0-fixed-mac.rules" | $SSH 'cat > /etc/udev/rules.d/98-eth0-fixed-mac.rules'
cat "$SCRIPT_DIR/set-eth0-mac.sh"         | $SSH 'cat > /etc/udev/scripts/set-eth0-mac.sh && chmod 755 /etc/udev/scripts/set-eth0-mac.sh'
echo "  [1/2] udev rule + set-eth0-mac.sh installed"

# ---- stage 2: ifconfig wrapper ----
$SSH '
    # Preserve real ifconfig (idempotent)
    if [ ! -e /sbin/ifconfig.real ]; then
        cp -a /sbin/ifconfig /sbin/ifconfig.real
        echo "  preserved original /sbin/ifconfig -> /sbin/ifconfig.real"
    else
        echo "  /sbin/ifconfig.real already exists, leaving as-is"
    fi'
cat "$SCRIPT_DIR/ifconfig-wrapper.sh" | $SSH '
    cat > /tmp/ifconfig.new
    chmod 755 /tmp/ifconfig.new
    mv /tmp/ifconfig.new /sbin/ifconfig'
echo "  [2/2] ifconfig wrapper installed at /sbin/ifconfig"

# ---- clean up any prior systemd-based version of this fix ----
$SSH '
    if systemctl list-unit-files set-bridge0-mac.service 2>/dev/null | grep -q set-bridge0-mac; then
        systemctl disable set-bridge0-mac.service 2>/dev/null || true
        rm -f /etc/systemd/system/set-bridge0-mac.service
        rm -f /etc/systemd/system/multi-user.target.wants/set-bridge0-mac.service
        rm -f /etc/udev/scripts/set-bridge0-mac.sh
        systemctl daemon-reload
        echo "  cleaned up old set-bridge0-mac.service (superseded by wrapper)"
    fi'

echo ""
echo "[*] Done. Reboot the modem to apply on next boot."
echo ""
echo "Verify after reboot:"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} \\"
echo "    'cat /sys/class/net/eth0/address && cat /sys/class/net/bridge0/address'"
echo "  Both should equal the value in <EarlyEthMACAddr> of /etc/data/mobileap_cfg.xml"
