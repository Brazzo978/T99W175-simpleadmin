# Complete documentation for "Simple T99"

## Introduction
"Simple T99" is a static administration interface for Foxcon T99W175 modems. Bootstrap 5 and Alpine.js power the UI, while Bash CGI scripts execute AT commands, read/write configuration, and expose quick utilities (connection watchdog, TTL override, scheduled reboot, SMS). Everything is meant to live on the modem web partition and run through the built-in HTTP server.

## Repository layout
- `README.md`: overview, install, credits.
- `install.sh`: installs everything on a modem over SSH (see *Development tools*).
- `VERSION.md`: current version, checked by the UI against GitHub `main`.
- `deploy/`: everything that goes on the modem, one folder per module, split by kind (`bin/`, `lib/`, `scripts/`, `systemd/`, ...).
  - `install-modem.sh`: the modem side of `install.sh`.
  - `www/`: the web payload the modem serves (`*.html`, `css/`, `js/`, `fonts/`, `cgi-bin/`, `config/simpleadmin.conf`).
  - `diag_bridge/`: DIAG radio metrics daemon (binary linked from the `T99W175-diag-json-bridge` repository) and its unit.
  - `curl/`, `jq/`: bundled tools with their libraries.
  - `modem-config/scripts/modem_config`: interactive Bash CLI that mirrors most UI features (APN, band/cell lock, TTL, roaming, LAN IP, bridge mode, reboot, etc.), all credits to [stich86](https://github.com/stich86); installed in `/data/simpleadmin/bin`, run as `modem_config`.
  - `ttl/`: `scripts/ttl-override` (sets or removes the TTL configured in the UI) and its unit.
  - `crontab/`: `init.d/crontab` (starts/stops `crond` on `/persist/cron`) and its unit.
  - `watchdog/`: `scripts/connection-watchdog`, its default `config/Watchdog` and unit.
  - `euicc/`: unit of the eSIM LPA server.
  - `persistent-mac/`: fixed MAC for `eth0`/`bridge0` (see its README).
  - `tailscale/`: custom Tailscale build and installer, downloaded by the UI from GitHub, not pushed by `install.sh`.
- `docs/`: documentation; `docs/default-config-files/` holds XML baselines extracted from a default modem:
  - `mobileap_cfg.xml`: LAN IP, DHCP, APN template, and network defaults.
  - `mobileap_firewall.xml`: default firewall ruleset.

## HTML pages: what they do and how they do it
### `deploy/www/index.html` — Home / status
- Purpose: live dashboard for modem health (temperature, SIM, signal, uptime, LTE/5G throughput, cell details, IPs).
- How: the Alpine component `processAllInfos()` builds a batch of AT commands and sends them to `cgi-bin/get_atcommand`, parses responses into cards/tables, refreshes periodically, and uses timeouts plus loading spinners to handle slow modems.

### `deploy/www/radio-settings.html` — Radio settings
- Purpose: band locking, cell locking, SIM slot, APN, and the eSIM page switch.
- How: `js/radio-settings.js` reads the current state with AT queries (`js/parse-settings.js`), `populateCheckboxes()` draws band checkboxes per RAT (LTE/NSA/SA) with the locked ones preselected, `js/generate-freq-box.js` builds EARFCN/PCI pairs for cell lock; the eSIM switch goes through `cgi-bin/toggle_esim`. Changes are confirmed in modals before they are applied.

### `deploy/www/settings.html` — Advanced utilities
- Purpose: consolidated hub for terminal access and maintenance tasks.
- How: `js/settings.js` offers:
  - AT terminal with history and multi-command send (`cgi-bin/user_atcommand`).
  - LAN/DHCP and IP passthrough settings, with the ARP table to pick the client (`cgi-bin/network_settings`, `cgi-bin/get_arp`).
  - TTL override (`cgi-bin/get_ttl_status`, `cgi-bin/set_ttl`).
  - Scheduled reboot (`cgi-bin/reboot_schedule`).
  - Connection watchdog configuration and log (`cgi-bin/connection_watchdog`, `cgi-bin/get_watchdog_log`).
  - Modal confirmations keep UI switches aligned with CGI outputs even when commands take a few seconds.

### `deploy/www/advanced.html` — Advanced
- Purpose: Web UI update check, reboot, factory reset, TTL, AT terminal and Tailscale.
- How: `js/advanced.js` drives `cgi-bin/factory_reset`, `cgi-bin/get_ttl_status` / `set_ttl`, `cgi-bin/user_atcommand` and `cgi-bin/tailscale`.

### `deploy/www/monitor.html` — Connection monitoring
- Purpose: ping targets and DNS tests used by the dashboard connectivity checks.
- How: `js/monitor.js` reads and saves them through `cgi-bin/get_connection_config` / `set_connection_config`.

### `deploy/www/credentials.html` — Accounts
- Purpose: manage the admin/user accounts.
- How: `js/credentials.js` calls `cgi-bin/manage_credentials`.

### `deploy/www/login.html` and `deploy/www/webguioff.html`
- `login.html`: sign-in form (`js/login.js` → `cgi-bin/authenticate`), used when `SIMPLEADMIN_ENABLE_LOGIN=1`.
- `webguioff.html`: page shown while the GUI is locked (`SIMPLEADMIN_GUI_LOCKED=1`, see the README).

### `deploy/www/sms.html` — SMS inbox and sender
- Purpose: read, delete, and send SMS (including multipart UCS-2).
- How: `fetchSMS()` calls `AT+CMGL="ALL"` through `cgi-bin/get_atcommand`, decodes UCS-2 with `convertHexToText`, normalizes timestamps, and supports multi-select delete. Sending builds UDH headers for multipart UCS-2 messages before posting to `cgi-bin/send_sms`, with per-message status feedback.

### `deploy/www/deviceinfo.html` — Device details
- Purpose: display identity/network info and let you change the IMEI.
- How: `fetchDeviceInfo()` issues AT queries (`AT+CGMI`, `AT+CGMM`, `^VERSION?`, `+CIMI`, `+ICCID`, `+CGSN`, `+CNUM`, `+CGCONTRDP`) plus `/cgi-bin/get_lanip` for LAN details. `updateIMEI()` prepares `^NV` strings to write a new IMEI and triggers a reboot countdown so users wait for the modem to return.

### `deploy/www/config/simpleadmin.conf`
- Purpose: front-end feature toggle.
- How: the flag `SIMPLEADMIN_ENABLE_LOGIN` sets whether the interface requires credentials (1) or is openly accessible (0).
- Additional flags:
  - `SIMPLEADMIN_ENABLE_ESIM` shows/hides the eSIM management page powered by the `euicc-client` REST server.
  - `SIMPLEADMIN_ESIM_BASE_URL` sets the base URL for the intermediate eSIM server (default `http://localhost:8080/api/v1`).
  - `SIMPLEADMIN_CSRF_CHECK` (default `1`) makes `session_load` reject any CGI request whose `Referer` is missing or points to another host. busybox httpd passes neither `Origin` nor `Sec-Fetch-*` to CGI scripts, so the Referer is the only same-origin signal; it is required because a cross-site page can suppress it.

### `deploy/www/esim.html` — eSIM management
- Purpose: GUI to interact with the intermediate `euicc-client` REST API (EID, profile lifecycle, downloads, notifications).
- How: enabled only when `SIMPLEADMIN_ENABLE_ESIM=1`; the page uses `js/esim.js` + `js/esim-config.js` to fetch the base URL from `/cgi-bin/esim_config` and make REST calls to the configured server.

#### Advanced flow and operation mapping
- Bootstrapping: `esimManager.bootstrap()` reads the configuration from `/cgi-bin/esim_config` (includes the `enabled` flag and `base_url`). If the endpoint points to `localhost`, `computeFallbackBaseUrl()` tries to rewrite it using the browser’s `hostname` to allow cross-device access to the same `euicc-client` instance.
- Health check: before loading data, `checkHealth()` queries `GET /health` on the API and sets `serverHealthy`; if the endpoint does not respond, it shows a blocking alert.
- Data refresh: `refreshAll()` runs `GET /eid`, `GET /profiles`, and `GET /notifications` in parallel to populate the EID, profile list, and notification queue.
- Profile management: commands always act on `/profile/*` with JSON payload `{ iccid }`:
  - `POST /profile/enable` and `POST /profile/disable` apply the operational state and reload the table.
  - `POST /profile/delete` requires a client-side `confirm()`, then calls `refreshAll()` to update everything.
  - `POST /profile/nickname` accepts `iccid` and `nickname` (empty = removal) to annotate local aliases.
- Downloading a new profile: `POST /download` sends `{ smdp, matching_id, confirmation_code?, auto_confirm }`. The confirmation code is optional and is removed from the payload when empty. Afterwards, the form is cleared and a `refreshAll()` is triggered to show the status.
- GSMA notifications: the table is fed by `GET /notifications` and two dedicated actions:
  - `POST /notifications/process` with `{ iccid, process_all, sequence_number? }` to consume the queue (response `processed_count`).
  - `POST /notifications/remove` accepts optional filters (`remove_all`, `iccid`, `sequence_number`) and returns `removed_count` to confirm cleanup.
- Error handling and fallback: `apiFetch()` first tries `baseUrl`, then the optional fallback; it treats non-OK responses as invalid, exposes the error message returned by the server, and dynamically updates `baseUrl` if the fallback responds correctly.

## JavaScript files
- `deploy/www/js/dark-mode.js`: toggles light/dark themes by updating `data-bs-theme`, saves preference in `localStorage`, and defaults to dark when no choice exists.
- `deploy/www/js/generate-freq-box.js`: dynamically builds EARFCN/PCI input pairs for manual lock; responds to `NumCells` changes and emits Alpine-compatible markup (`x-show`).
- `deploy/www/js/parse-settings.js`: parses AT replies to detect active SIM, APN, current locks, and RAT preferences; returns a normalized object consumed by `cellLocking().getCurrentSettings()`.
- `deploy/www/js/populate-checkbox.js`: renders band-selection grids, preselects locked bands, and attaches listeners that keep the `cellLock` model in sync while minimizing reflows via `DocumentFragment`.
- `deploy/www/js/alpinejs.min.js`: minified Alpine.js 3 build used across the UI.
- `deploy/www/js/bootstrap.bundle.min.js`: Bootstrap 5 bundle (with Popper) for layout and components.

## CSS and assets
- `deploy/www/css/styles.css`: imports Poppins fonts, incorporates `all.min.css` icons, and defines custom styles for loaders, modals, and utility classes.
- `deploy/www/css/bootstrap.min.css`: local Bootstrap 5.3 distribution for offline-consistent UI.
- `deploy/www/css/all.min.css`: minified icon set (Font Awesome-derived) referenced by buttons and labels.
- `deploy/www/fonts/*.woff2`: Poppins font family (weights 300–700, regular/italic) to avoid external CDN dependencies.
- `deploy/www/favicon.ico`: site icon.

## CGI scripts (`deploy/www/cgi-bin/`)
All of them source `session_utils.sh` (configuration from `config/simpleadmin.conf`, sessions, CSRF via `Referer`, JSON helpers) and, unless noted, require a session; changes require the `admin` role.

Session and accounts:
- `authenticate`: checks username/password against `credentials.txt` and opens a session cookie; refuses with 423 while the GUI is locked.
- `session_status`: reports whether the browser is logged in, its role, and the GUI lock state.
- `logout`: invalidates the session and expires the cookie.
- `manage_credentials`: admin management of the accounts in `credentials.txt` (SHA-512 crypt hashes).
- `credentials.txt` / `credentials.stock`: accounts (`username:role:password`) and the shipped default (`admin:admin:admin`, to change); `install.sh` keeps the existing `credentials.txt`.
- `login_config`: reads `SIMPLEADMIN_ENABLE_LOGIN` for the front end.
- `gui_toggle`: locks or unlocks the GUI with `SIMPLEADMIN_GUI_TOGGLE_KEY` (see the README).

Modem and network:
- `get_atcommand`: URL-decodes `atcmd`, runs it through `atcli_smd8` with retries; read-only accounts may only send queries.
- `user_atcommand`: variant of `get_atcommand` for the terminal in `settings.html` (ANSI sequences stripped).
- `send_sms`: sends an SMS through AT commands.
- `get_sys_info`: uptime and system figures for the dashboard.
- `get_ping`: connectivity test against `SIMPLEADMIN_PING_TARGETS`.
- `get_lanip`: reads the LAN address from `/etc/data/mobileap_cfg.xml`.
- `get_arp`: ARP table of the LAN clients.
- `network_settings`: LAN/DHCP and IP passthrough settings in `mobileap_cfg.xml` (admin).
- `get_connection_config` / `set_connection_config`: ping targets and DNS tests in `simpleadmin.conf`.
- `factory_reset`: restores the modem defaults and reboots (admin).

Services installed by `install.sh`:
- `get_ttl_status` / `set_ttl`: TTL override, read from the iptables mangle table; set through `/persist/ttlvalue` and `/opt/scripts/ttl/ttl-override`.
- `reboot_schedule`: scheduled reboot in `/persist/cron/root` (run by `crontab.service`).
- `connection_watchdog`: reads and writes `/opt/scripts/Watchdog` and enables or disables `connection-watchdog.service` accordingly.
- `get_watchdog_log`: tail of `/tmp/connection-watchdog.log`.
- `esim_config` / `toggle_esim`: eSIM page switch (`SIMPLEADMIN_ENABLE_ESIM`) and the `euicc` service.
- `get_esim_server_config` / `esim_server_config`: the eSIM LPA server configuration in `/home/root/client.yaml`.
- `tailscale` / `tailscale-helper`: Tailscale status and actions; the helper downloads `deploy/tailscale/install_tailscale_modem.sh` from GitHub (`main`) and installs to `/data/tailscale`.

## Development tools
### `install.sh` — Deployment script
- Purpose: installs SimpleAdmin on the modem over SSH in one go: the `www` directory, `diag_bridge`, `curl`, `jq` and the system scripts and units (TTL, crontab, connection watchdog, euicc).
- Prerequisites: an SSH key installed for the `root` user on the modem (passwordless SSH access).
- Safety: before copying anything it checks that the target is a T99W175 (hostname `sdxprairie`, `AT+CGMM` = `T99W175`, `/WEBSERVER` present) and refuses any other host.
- Usage: `./install.sh [HOST] [--nologin|--login] [--noesim|--esim]` (default host `192.168.225.1`). Without flags the modem keeps its current `simpleadmin.conf` values and `cgi-bin/credentials.txt`; the flags set `SIMPLEADMIN_ENABLE_LOGIN` / `SIMPLEADMIN_ENABLE_ESIM`. Conflicting flags (`--login` with `--nologin`, `--esim` with `--noesim`) are an error.
- How it works: the payload is streamed as a tar over SSH to `/tmp/simpleadmin-install` and `deploy/install-modem.sh` runs on the modem: it replaces `/WEBSERVER/www` (restarting `qcmap_httpd.service`), installs the binaries in `/data/simpleadmin`, the scripts in `/opt/scripts` and `/etc/init.d`, the units in `/lib/systemd/system`, restarts the services and removes what older installs left in `/opt/simpleadmin`.

## Operational notes
- All pages load `js/dark-mode.js` so theme preference stays consistent through `localStorage`.
- AT batches sent to `cgi-bin/get_atcommand` combine multiple commands with `;`; keep generous timeouts and show loaders (`.loader`) for long replies.
- CGI scripts rely on firmware helpers such as `atcli_smd8`; `install.sh` checks that the target is a T99W175 before installing anything.
