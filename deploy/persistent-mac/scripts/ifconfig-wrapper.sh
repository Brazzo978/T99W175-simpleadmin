#!/bin/sh
# ifconfig wrapper - intercepts "ifconfig bridge0 hw ether X" and replaces X
# with the value from /etc/data/mobileap_cfg.xml <EarlyEthMACAddr>.
# Pass-through for everything else.
#
# Background:
# QCMAP_ConnectionManager runs `system("ifconfig bridge0 hw ether <random>")`
# at every boot. By wrapping /sbin/ifconfig we intercept that exact call and
# substitute the configured fixed MAC, with zero changes to QCMAP itself.
#
# IMPORTANT: on this firmware /sbin/ifconfig is a busybox shebang-script wrapper.
# Shebang dispatch in Linux ignores `exec -a` for argv[0]: when the kernel
# evaluates `#!/bin/busybox.nosuid` it passes the script path as argv[1] of the
# interpreter, and busybox uses argv[0]'s basename to pick an applet. So
# exec'ing /sbin/ifconfig.real would make busybox see basename=ifconfig.real and
# fail with "applet not found". We work around this by calling busybox directly:
#   exec /bin/busybox.nosuid ifconfig <args...>
#
# Install: this file replaces /sbin/ifconfig. The original /sbin/ifconfig (a
# busybox symlink) is preserved as /sbin/ifconfig.real for uninstall convenience.

# Locate busybox (the binary we'll dispatch through)
BB=""
for p in /bin/busybox.nosuid /bin/busybox \
         /usr/bin/busybox.nosuid /usr/bin/busybox \
         /usr/lib/busybox/bin/busybox.nosuid /usr/lib/busybox/bin/busybox; do
    if [ -x "$p" ]; then BB="$p"; break; fi
done
if [ -z "$BB" ]; then
    echo "[ifconfig-wrapper] ERROR: no busybox binary found" >&2
    exit 127
fi

# Match the exact QCMAP signature: 4 args, "bridge0" "hw" "ether" "<MAC>"
if [ "$1" = "bridge0" ] && [ "$2" = "hw" ] && [ "$3" = "ether" ] && [ -n "$4" ]; then
    CFG=/etc/data/mobileap_cfg.xml
    if [ -f "$CFG" ]; then
        MAC=$(grep -oE "<EarlyEthMACAddr>[0-9a-fA-F:]+</EarlyEthMACAddr>" "$CFG" 2>/dev/null \
              | sed -E 's|<[^>]+>||g')
        if echo "$MAC" | grep -qE "^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$"; then
            # Log to kmsg if writable (silent fall-through if not)
            echo "[ifconfig-wrapper] override: $4 -> $MAC" > /dev/kmsg 2>/dev/null
            exec "$BB" ifconfig bridge0 hw ether "$MAC"
        fi
    fi
fi

# Everything else: pass-through to the real ifconfig applet
exec "$BB" ifconfig "$@"
