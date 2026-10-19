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

# bridge0 is already up when QCMAP sets its MAC, so its IPv6 link-local was
# derived from the bridge's random MAC, and kernel 4.14 does not derive it
# again when the MAC changes: it would differ at every boot, and routers on
# the LAN would keep the previous boot's one as a default router. Replace it
# with the EUI-64 link-local of the fixed MAC (radish, which advertises from
# it, has not started yet at this point of the boot).
stable_link_local() {
    set -- $(echo "$1" | tr ':' ' ')
    [ $# = 6 ] || return 0
    ll=$(printf 'fe80::%x:%x:%x:%x' \
        $(( ((0x$1 ^ 2) << 8) | 0x$2 )) $(( (0x$3 << 8) | 0xff )) \
        $(( 0xfe00 | 0x$4 )) $(( (0x$5 << 8) | 0x$6 )))
    command -v ip >/dev/null 2>&1 || return 0
    ip -6 addr add "$ll/64" dev bridge0 scope link 2>/dev/null
    for old in $(ip -6 addr show dev bridge0 scope link 2>/dev/null |
                 awk '/inet6/ {print $2}'); do
        [ "$old" = "$ll/64" ] || ip -6 addr del "$old" dev bridge0 2>/dev/null
    done
    echo "[ifconfig-wrapper] bridge0 link-local $ll" > /dev/kmsg 2>/dev/null
}

# Match the exact QCMAP signature: 4 args, "bridge0" "hw" "ether" "<MAC>"
if [ "$1" = "bridge0" ] && [ "$2" = "hw" ] && [ "$3" = "ether" ] && [ -n "$4" ]; then
    CFG=/etc/data/mobileap_cfg.xml
    if [ -f "$CFG" ]; then
        MAC=$(grep -oE "<EarlyEthMACAddr>[0-9a-fA-F:]+</EarlyEthMACAddr>" "$CFG" 2>/dev/null \
              | sed -E 's|<[^>]+>||g')
        if echo "$MAC" | grep -qE "^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$"; then
            # Log to kmsg if writable (silent fall-through if not)
            echo "[ifconfig-wrapper] override: $4 -> $MAC" > /dev/kmsg 2>/dev/null
            "$BB" ifconfig bridge0 hw ether "$MAC"
            rc=$?
            [ "$rc" = 0 ] && stable_link_local "$MAC"
            exit "$rc"
        fi
    fi
fi

# Everything else: pass-through to the real ifconfig applet
exec "$BB" ifconfig "$@"
