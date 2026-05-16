# Persistent MAC for `eth0` and `bridge0`

Pin the modem's Ethernet MAC across reboots, sourcing the value from `<EarlyEthMACAddr>` in `/etc/data/mobileap_cfg.xml`.

## The problem

The Foxconn T99W175 has a Realtek **RTL8125** PCIe Ethernet controller on board (driver `r8125`). Foxconn shipped these modems with **no factory MAC programmed** in the RTL8125's storage. Consequences:

- `ethtool -e eth0` returns `Cannot get EEPROM data: Operation not supported` — no readable MAC source for the driver.
- The `r8125` driver falls back to a **freshly random MAC every boot** for `eth0` (`/sys/class/net/eth0/addr_assign_type = 1` = "random").
- `QCMAP_ConnectionManager` then explicitly runs `system("ifconfig bridge0 hw ether <random>")` at boot, generating yet another random MAC for `bridge0` (the LAN-facing interface hosting `192.168.225.1`). Strace confirms this happens right after `brctl addbr bridge0`:
  ```
  18:39:53 execve("/usr/sbin/brctl", ["brctl", "addbr", "bridge0"], …)
  18:39:53 ioctl(SIOCGIFHWADDR, "bridge0") = 0a:57:39:60:10:63
  18:39:53 execve("/sbin/ifconfig",
                  ["ifconfig", "bridge0", "hw", "ether", "a:57:39:63:13:66"], …)
  ```
  The MAC is built via the format string `%x:%x:%x:%x:%x:%x` (unpadded hex; located at offset `0xd5fbd` in the binary) — six independent `rand()` calls per boot.

Net effect: the upstream router sees a different MAC for the modem on every reboot. This breaks DHCP reservations, MAC-pinned firewall rules, ARP-stable monitoring, etc.

## The fix — two stages

| Stage | Mechanism | What it pins | Why |
|---|---|---|---|
| **1** | **udev rule + script** on `r8125` driver-add | `eth0` | Catches eth0 the instant the kernel creates it, before any userspace component touches it. |
| **2** | **`/sbin/ifconfig` wrapper** that intercepts `bridge0 hw ether X` | `bridge0` | QCMAP's bridge MAC is set via `system("ifconfig …")`. By replacing `/sbin/ifconfig` with a tiny shell wrapper, we intercept that exact call without modifying or even touching QCMAP. |

Both stages read the SAME source of truth — `<EarlyEthMACAddr>` in `mobileap_cfg.xml` — so changing the fleet-wide MAC is just an XML edit + reboot.

## Files in this folder

| File | Installed to | Purpose |
|---|---|---|
| `98-eth0-fixed-mac.rules` | `/etc/udev/rules.d/` | udev trigger on `r8125 add` |
| `set-eth0-mac.sh` | `/etc/udev/scripts/` | reads XML, sets `eth0` MAC |
| `ifconfig-wrapper.sh` | `/sbin/ifconfig` | replaces the busybox `ifconfig` symlink; intercepts the `bridge0 hw ether` invocation |
| `install.sh` | (run locally) | pushes the files to the modem via SSH, preserves the original `/sbin/ifconfig` as `/sbin/ifconfig.real` for safe uninstall |

## Install

```bash
./install.sh                    # default host 192.168.225.1
./install.sh 192.168.225.1      # explicit host
```

Then reboot the modem.

## Verify

```bash
ssh root@192.168.225.1 'cat /sys/class/net/eth0/address && cat /sys/class/net/bridge0/address'
```

Both should equal the value of `<EarlyEthMACAddr>` in `/etc/data/mobileap_cfg.xml`, and stay that value across reboots. Boot timing visible in `dmesg`:

```
[set-eth0-mac] eth0 set to 00:55:7b:b5:7d:f7
[ifconfig-wrapper] override: 0a:57:39:63:13:66 -> 00:55:7b:b5:7d:f7
```

(The wrapper's kmsg log only appears when QCMAP is the caller — QCMAP runs as `radio:radio` which may not have write permission to `/dev/kmsg`, so the log line can be silently dropped while the override still works. Trust the `addr_assign_type` and the actual MAC value as the source of truth.)

## Change the MAC

Edit `<EarlyEthMACAddr>...</EarlyEthMACAddr>` in `/etc/data/mobileap_cfg.xml`, then either reboot or re-trigger:

```bash
/etc/udev/scripts/set-eth0-mac.sh         # re-pin eth0
ifconfig bridge0 hw ether de:ad:be:ef:00:01   # any args - wrapper overrides
```

## Uninstall

```bash
./install.sh --uninstall
```

This restores `/sbin/ifconfig.real` → `/sbin/ifconfig` and removes the udev rule + script. Reboot to clear the explicit MACs; `eth0` will go back to random-per-boot.

## Notes / quirks for future maintainers

### Why does the wrapper call `busybox ifconfig` directly?

The naïve approach — `exec /sbin/ifconfig.real "$@"` — does NOT work on this firmware. `/sbin/ifconfig` is a symlink to `/usr/lib/busybox/sbin/ifconfig`, which is itself a **shebang script** `#!/bin/busybox.nosuid`. When Linux interprets the shebang, it ignores `exec -a` and passes the script path as `argv[1]` to the interpreter. Busybox uses `argv[0]`'s basename to pick an applet, so it sees `ifconfig.real` and fails with **"applet not found"**.

The fix is to invoke busybox **directly**, supplying `ifconfig` as the applet name:

```sh
exec /bin/busybox.nosuid ifconfig "$@"
```

The wrapper enumerates common busybox paths so it works across firmware variations.

### Why not flash the RTL8125 EEPROM?

Technically possible with Realtek's proprietary `rtnicpg` tool, but:
- The stock `r8125` driver doesn't expose write-EEPROM ioctls via `ethtool`. You'd need a patched/recompiled driver or a different host.
- M.2 modems typically use EFUSE (one-time programmable) instead of external EEPROM — you get **one shot** and a bad checksum bricks the NIC.
- Writing requires knowing the exact format (vendor/sub-vendor IDs, length, checksum), undocumented for the specific RTL8125 revision Foxconn used.

The udev rule + ifconfig wrapper is reversible, requires no special tools, and survives firmware updates as long as `/etc/udev/rules.d/` and `/sbin/ifconfig` aren't wiped — both can be re-applied in 30 seconds if they ever are.
