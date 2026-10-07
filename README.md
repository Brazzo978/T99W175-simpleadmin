# Simpleadmin for Foxconn T99W175

Static web interface (HTML/JS with Bash CGI helpers) to administer Foxconn T99W175 modem. This version is heavily inspired by the work at [iamromulan/quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit) has some heavy edits to make it work with the T99W175 and some changes that i thought would make it better for us.

## Credits and thanks
- Original project: [iamromulan](https://github.com/iamromulan) – repo: [quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit).
- Core contributors for scripts, testing, and troubleshooting:
  - [1alessandro1](https://github.com/1alessandro1)
  - [stich86](https://github.com/stich86)
  - [gionag](https://github.com/gionag)


## Quick overview
- Responsive HTML pages (Bootstrap 5 + Alpine.js) served from the modem web partition.
- Bash CGI scripts in `deploy/www/cgi-bin/` that drive AT commands, the connection watchdog, TTL override, scheduled reboot and utility actions.
- Front-end settings via `deploy/www/config/simpleadmin.conf`, here you can enable or disable the login page and the esim configuration page,by default login is on , and esim is off
```
# SimpleAdmin configuration
# Set to 0 to completely disable login and allow open access.
# Set to 1 (default) to require user login.
SIMPLEADMIN_ENABLE_LOGIN=1

# Cross-site request protection: authenticated CGI calls must carry a Referer
# from the same host. Set to 0 only to drive the CGI endpoints from scripts
# that cannot send a Referer (curl users can pass -e http://<modem-ip>/).
SIMPLEADMIN_CSRF_CHECK=1

# GUI lock (maintenance mode)
# When locked, the UI redirects to SIMPLEADMIN_GUI_LOCK_PAGE and CGI endpoints
# behave as unauthenticated.
SIMPLEADMIN_GUI_LOCKED=0

# Pre-shared key required by /cgi-bin/gui_toggle?key=... (or ?k=...).
SIMPLEADMIN_GUI_TOGGLE_KEY=""

# Page shown while locked.
SIMPLEADMIN_GUI_LOCK_PAGE="/webguioff.html"

# eSIM management page (requires the intermediate euicc-client server)
# Set to 1 to show and enable the eSIM management UI, 0 to hide it.
SIMPLEADMIN_ENABLE_ESIM=0

# Base URL for the eSIM intermediate server (default: local euicc-client API)
SIMPLEADMIN_ESIM_BASE_URL="http://localhost:8080/api/v1"
```
### Security notes

- The default account is `admin` / `admin`: change its password after the first login. It is recreated only when no administrator account is left, and there is no default read-only account.
- Passwords in `deploy/www/cgi-bin/credentials.txt` are stored as SHA-512 crypt hashes (`$6$salt$hash`, the `/etc/shadow` format, via `openssl passwd -6` or busybox `cryptpw`). `./install.sh` converts any plaintext password left in the file to its hash; one that is still there (an install done by hand) works and is replaced by its hash on the next successful login.
- Accounts with the `user` role can only send read-only AT commands (queries, test commands, identification and the output-format settings the dashboard needs).
- With `SIMPLEADMIN_ENABLE_LOGIN=0` every CGI endpoint runs with administrator rights for anyone who can reach the modem; `SIMPLEADMIN_CSRF_CHECK=1` keeps other websites from driving it through the browser, but it does not replace a password.

Check [docs/Explaination.md](docs/Explaination.md) for file-by-file behavior, request flows, and how each page uses the CGI helpers.
For the dedicated Tailscale integration documentation, see [docs/Tailscale.md](docs/Tailscale.md).

## GUI lock (maintenance mode)

Goal: allow installers to open a "special link" from a browser to unlock the GUI, perform the work, then lock it again and show a static instruction page.

How it works:
- When `SIMPLEADMIN_GUI_LOCKED=1`, the frontend redirects to `SIMPLEADMIN_GUI_LOCK_PAGE` (default: `/webguioff.html`).
- Server-side, `session_load` is blocked, so all CGI endpoints that require a session behave as unauthenticated while locked.
- No extra "delay": the lock status is returned by the existing `/cgi-bin/session_status` request the UI already performs.

### Enable it
1. Set a strong key in `deploy/www/config/simpleadmin.conf`:
   - `SIMPLEADMIN_GUI_TOGGLE_KEY="use_a_long_random_string_here"`
2. Deploy files to the modem (see Installation).

### Use it (the "special link")
- Lock:
  - `/cgi-bin/gui_toggle?key=YOUR_KEY&mode=lock`
- Unlock:
  - `/cgi-bin/gui_toggle?key=YOUR_KEY&mode=unlock`
- Toggle (flips state):
  - `/cgi-bin/gui_toggle?key=YOUR_KEY&mode=toggle`

Notes:
- The key is in the URL: it can end up in browser history, screenshots, and (depending on server setup) logs. Use a long random key and only on trusted networks.
- If you lose the key, you can unlock by setting `SIMPLEADMIN_GUI_LOCKED=0` in `deploy/www/config/simpleadmin.conf` (or redeploying the stock config).

---

## 📸 Screenshots

### Home
![Home](docs/media/Home.jpg)

<details>
<summary><b>More screenshots</b></summary>

### Device info
![Device info](docs/media/Device%20info.jpg)

### Advanced / CA
![Advanced](docs/media/Advanced.jpg)
![CA](docs/media/CA.jpg)

### Network
![Network settings](docs/media/Network%20settings.jpg)
![Network Advisor](docs/media/Network%20Advisor.jpg)

### System / User / Login
![System Settings](docs/media/System%20Settings.jpg)
![User](docs/media/User.jpg)
![Login](docs/media/Login.jpg)

### Tools
![Ping](docs/media/Ping.jpg)
![Temp](docs/media/Temp.jpg)
![SMS](docs/media/Sms.jpg)

</details>



## 🛠 Installation

Simpleadmin is designed to run directly on the Foxconn T99W175 inside the modem’s web partition.
Follow these steps to deploy it safely.


1 Download or clone the repository

2 Extract the ZIP and locate the www folder

3 Connect via SSH to the modem (default IP: 192.168.225.1, default user: root)

4 Locate the webserver folder and inside it find the current www directory

5 Delete or rename the existing www folder

6 Upload the freshly downloaded www folder from the repository

7 Give the www folder recursive 777 permissions:

```bash
chmod -R 777 /www
```

8 Either reboot the modem or restart the webserver:

```bash
systemctl restart qcmap_httpd.service
```

Browse to the GUI and use Simpleadmin

### Deploying from a workstation

Everything that ends up on the modem lives in `deploy/`, one folder per
module, each split by kind (`bin/`, `lib/`, `scripts/`, `systemd/`, ...):

```
deploy/
  install-modem.sh       modem side of install.sh
  www/                   web UI
  diag_bridge/  curl/  jq/
  ttl/  crontab/  watchdog/  euicc/  persistent-mac/  modem-config/
  tailscale/             not pushed: the UI downloads it from GitHub
```

With SSH key access to the modem as `root`:

```bash
./install.sh [HOST] [--nologin|--login] [--noesim|--esim]
```

It first checks that `HOST` (default `192.168.225.1`) really is a T99W175
(hostname `sdxprairie`, `AT+CGMM` = `T99W175`, `/WEBSERVER` present) and
refuses anything else, then installs everything in one go
(`deploy/install-modem.sh` runs on the modem). Without flags the modem keeps
its current `simpleadmin.conf` values and `credentials.txt` (plaintext passwords
in it are converted to SHA-512 crypt); the flags set
`SIMPLEADMIN_ENABLE_LOGIN` / `SIMPLEADMIN_ENABLE_ESIM`.

Binaries go to `/data/simpleadmin` (persistent UBIFS `usrfs`): the root
filesystem has only a few MB free. Copies left in `/opt/simpleadmin` by older
installs are removed.

| What | Source in this repo | On the modem |
|---|---|---|
| Web UI | `deploy/www/` | `/WEBSERVER/www` (`qcmap_httpd` restarted) |
| `diag_bridge` | `deploy/diag_bridge/`: `bin/diag_bridge` (symlink into the bridge repository, see its `README.md`), `systemd/diag_bridge.service` | `/data/simpleadmin/bin/diag_bridge` (~4 MB) linked from `/usr/bin/diag_bridge`, `/lib/systemd/system/diag_bridge.service` (enabled) |
| `curl`, `jq` | `deploy/curl/`, `deploy/jq/` (`bin/`, `lib/`) | `/data/simpleadmin/{bin,lib}` with wrappers in `/usr/bin`; the firmware's `libcurl.so.4` is left untouched |
| System scripts | `deploy/ttl/`, `deploy/crontab/`, `deploy/watchdog/`, `deploy/euicc/` | `/opt/scripts/{ttl,watchdog}`, `/etc/init.d/crontab`, units in `/lib/systemd/system`; see `docs/Enable_New_feature.md` |
| `modem_config` | `deploy/modem-config/scripts/modem_config` | `/data/simpleadmin/bin/modem_config`, linked from `/usr/bin` and `/usr/sbin`: run `modem_config` from an SSH console |

## 📡 Advanced Signal Details: AT-based or DIAG-based

The signal card opens *Advanced Signal Details*, whose header has an
**AT-based / DIAG-based** switch (remembered per browser):

- **AT-based** parses `AT^DEBUG?` on every dashboard refresh.
- **DIAG-based** reads the WebSocket pushed by `diag_bridge` on port 9001,
  decoded from the Qualcomm DIAG interface. Besides per-antenna SINR it shows,
  per cell, a *Cell* row (TX antennas, Cell ID/TAC/PLMN when the firmware logs
  them, NR SSB/beams/neighbours), a *DL* row (modulation, MCS, throughput,
  BLER) and a *UL* row (LTE modulation/RB/throughput; NR MCS/PRB/throughput,
  power headroom and maximum power). LTE SCells come from the RRC
  configuration: this firmware does not measure them, so their RSRP/SINR read
  N/A while bandwidth and throughput are shown. The stream is open only while
  the modal is visible.

The dashboard cards stay AT-based in both cases.

`diag_bridge` is developed in its own repository (`T99W175-diag-json-bridge`)
and is not stored here: `deploy/diag_bridge/bin/diag_bridge` is a gitignored symlink to the
binary in a checkout next to this one (`deploy/diag_bridge/README.md`). The bridge's
`scripts/publish-to-simpleadmin.sh` builds it, creates the link and copies the
systemd unit. The
service listens on `bridge0` only (`-i bridge0`), so it is not reachable from
the mobile network.


## 🔧 Optional fix: persistent MAC for `eth0` / `bridge0`

The Realtek **RTL8125** NIC inside the T99W175 ships **without a factory-programmed MAC**, so every reboot the kernel assigns `eth0` a fresh random MAC. To compound it, `QCMAP_ConnectionManager` then runs `system("ifconfig bridge0 hw ether <random>")` and gives `bridge0` *yet another* random MAC. Upstream routers see the modem as a new device on each boot — breaking DHCP reservations, MAC-based firewall rules, ARP-stable monitoring, etc.

[`deploy/persistent-mac/`](deploy/persistent-mac/) provides an optional two-stage fix that pins both interfaces to the MAC declared in `/etc/data/mobileap_cfg.xml` `<EarlyEthMACAddr>`:

- **Stage 1** — udev rule fires on `r8125` driver-add → sets `eth0`'s MAC from the XML.
- **Stage 2** — `/sbin/ifconfig` is replaced with a tiny wrapper that intercepts the exact `ifconfig bridge0 hw ether <random>` call QCMAP makes and substitutes the XML value. No QCMAP changes, no binary patches.

`./install.sh` installs it (idempotently) with everything else; it applies at
the next reboot:

```bash
ssh root@192.168.225.1 'cat /sys/class/net/eth0/address && cat /sys/class/net/bridge0/address'
# both should now equal the XML value, and stay equal across reboots
```

To change the MAC fleet-wide, edit `<EarlyEthMACAddr>` in the XML and reboot — both the udev script and the wrapper re-read it. Removal steps are in the module README. See [`deploy/persistent-mac/README.md`](deploy/persistent-mac/README.md) for the full RE writeup (strace evidence, why busybox-direct invocation is required, why not flash the EEPROM).


## 💬 Questions, Support & Requests

For any questions, feature requests or support, feel free to reach out on Telegram:

👉 [Telegram Group](https://t.me/ltesperimentazioni)


## Troubleshooting
Ssh password not known : connect the modem via usb and install needed driver if windows doesnt automatically , then connect to adb using adb shell and run passwd , then you can change root password , and you can use that to access ssh.
