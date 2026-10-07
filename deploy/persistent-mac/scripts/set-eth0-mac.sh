#!/bin/sh
# Extract <EarlyEthMACAddr> from /etc/data/mobileap_cfg.xml and apply to eth0.
# Triggered by /etc/udev/rules.d/98-eth0-fixed-mac.rules on driver add.
#
# Why: RTL8125 on the T99W175 has no factory MAC programmed; r8125 driver
# falls back to a random MAC each boot. This pins eth0 to a deterministic
# value from the Foxconn config so it stays stable across reboots.

LOG=/dev/kmsg
CFG=/etc/data/mobileap_cfg.xml

[ -f "$CFG" ] || { echo "[set-eth0-mac] $CFG missing" > $LOG; exit 0; }

MAC=$(grep -oE "<EarlyEthMACAddr>[0-9a-fA-F:]+</EarlyEthMACAddr>" "$CFG" | sed -E "s|<[^>]+>||g")
if ! echo "$MAC" | grep -qE "^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$"; then
    echo "[set-eth0-mac] invalid MAC in cfg: \"$MAC\"" > $LOG
    exit 0
fi
MAC=$(echo "$MAC" | tr A-F a-f)

/sbin/ip link set dev eth0 address "$MAC" \
    && echo "[set-eth0-mac] eth0 set to $MAC" > $LOG \
    || echo "[set-eth0-mac] FAILED to set $MAC" > $LOG
