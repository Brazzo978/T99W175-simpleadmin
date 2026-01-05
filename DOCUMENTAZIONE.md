# Complete documentation for "Simple T99"

## Introduction
"Simple T99" is a static administration interface for Foxcon T99W175 modems. Bootstrap 5 and Alpine.js power the UI, while Bash CGI scripts execute AT commands, read/write configuration, and expose quick utilities (Watchcat, TTL override, SMS). Everything is meant to live on the modem web partition and run through the built-in HTTP server.

## Repository layout
- `README.md`: quick overview and credits.
- `DOCUMENTAZIONE.md`: this detailed walkthrough.
- `Default config files/`: XML baselines extracted from default modem env.
  - `mobileap_cfg.xml`: LAN IP, DHCP, APN template, and network defaults.
  - `mobileap_firewall.xml`: default firewall ruleset.
- `modem_config`: interactive Bash CLI that mirrors most UI features (APN, band/cell lock, TTL, roaming, LAN IP, bridge mode, reboot, etc.) all credits to [stich86](https://github.com/stich86).
- `www`: root of the web payload the modem serves.
  - HTML pages (`*.html`).
  - Static assets (`css/`, `js/`, `fonts/`, `favicon.ico`).
  - CGI helpers in `cgi-bin/`.
  - Front-end settings in `config/simpleadmin.conf`.
- `scripts`: root of Linux scripts used by TTL and scheduler
  - `ttl-override`: the script that set or remove the custom TTL configured with WebUI
  - `init.d/crontab`: the script used to start or stop `crontab` daemon
  - `systemd/crontab.service`: the wrapper that calls `/etc/init.d/crontab` script
  - `systemd/ttl-override.service`: the wrapper that calls `/opt/scripts/ttl/ttl-override`

## HTML pages: what they do and how they do it
### `www/index.html` — Home / status
- Purpose: live dashboard for modem health (temperature, SIM, signal, uptime, LTE/5G throughput, cell details, IPs).
- How: the Alpine component `processAllInfos()` builds a batch of AT commands and sends them to `cgi-bin/get_atcommand`, parses responses into cards/tables, refreshes periodically, and uses timeouts plus loading spinners to handle slow modems.

### `www/network.html` — Radio and network tools
- Purpose: band locking, cell locking, and quick network utilities.
- How: `cellLocking()` fetches allowed bands with `AT^BAND_PREF_EXT?`, then `populateCheckboxes()` draws dynamic checkboxes per RAT (LTE/NSA/SA) and preselects locked bands. The page lets you lock PCI/EARFCN combos, run pings, toggle TTL override, trigger resets, and shows confirmation modals before applying changes.

### `www/settings.html` — Advanced utilities
- Purpose: consolidated hub for terminal access and maintenance tasks.
- How: the `simpleSettings()` component offers:
  - AT terminal with history and multi-command send (falls back to `ATI` when empty).
  - One-Click utilities: reboot, AT config reset, IP passthrough, DNS proxy toggle, USB mode switch (RMNET/ECM/MBIM/RNDIS), and scheduled reboot timer.
  - TTL override panel reading from `/cgi-bin/get_ttl_status` and applying changes via `/cgi-bin/set_ttl` with inline logs.
  - Watchcat configuration that syncs current state from `/cgi-bin/set_watchcat` responses and shows countdowns for safe reboots.
  - Modal confirmations keep UI switches aligned with CGI outputs even when commands take a few seconds.

### `www/sms.html` — SMS inbox and sender
- Purpose: read, delete, and send SMS (including multipart UCS-2).
- How: `fetchSMS()` calls `AT+CMGL="ALL"` through `cgi-bin/get_atcommand`, decodes UCS-2 with `convertHexToText`, normalizes timestamps, and supports multi-select delete. Sending builds UDH headers for multipart UCS-2 messages before posting to `cgi-bin/send_sms`, with per-message status feedback.

### `www/deviceinfo.html` — Device details
- Purpose: display identity/network info and let you change the IMEI.
- How: `fetchDeviceInfo()` issues AT queries (`AT+CGMI`, `AT+CGMM`, `^VERSION?`, `+CIMI`, `+ICCID`, `+CGSN`, `+CNUM`, `+CGCONTRDP`) plus `/cgi-bin/get_lanip` for LAN details. `updateIMEI()` prepares `^NV` strings to write a new IMEI and triggers a reboot countdown so users wait for the modem to return.

### `www/config/simpleadmin.conf`
- Purpose: front-end feature toggle.
- How: the flag `SIMPLEADMIN_ENABLE_LOGIN` sets whether the interface requires credentials (1) or is openly accessible (0).
- Additional flags:
  - `SIMPLEADMIN_ENABLE_ESIM` shows/hides the eSIM management page powered by the `euicc-client` REST server.
  - `SIMPLEADMIN_ESIM_BASE_URL` sets the base URL for the intermediate eSIM server (default `http://localhost:8080/api/v1`).

### `www/esim.html` — eSIM management
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
- `www/js/dark-mode.js`: toggles light/dark themes by updating `data-bs-theme`, saves preference in `localStorage`, and defaults to dark when no choice exists.
- `www/js/generate-freq-box.js`: dynamically builds EARFCN/PCI input pairs for manual lock; responds to `NumCells` changes and emits Alpine-compatible markup (`x-show`).
- `www/js/parse-settings.js`: parses AT replies to detect active SIM, APN, current locks, and RAT preferences; returns a normalized object consumed by `cellLocking().getCurrentSettings()`.
- `www/js/populate-checkbox.js`: renders band-selection grids, preselects locked bands, and attaches listeners that keep the `cellLock` model in sync while minimizing reflows via `DocumentFragment`.
- `www/js/alpinejs.min.js`: minified Alpine.js 3 build used across the UI.
- `www/js/bootstrap.bundle.min.js`: Bootstrap 5 bundle (with Popper) for layout and components.

## CSS and assets
- `www/css/styles.css`: imports Poppins fonts, incorporates `all.min.css` icons, and defines custom styles for loaders, modals, and utility classes.
- `www/css/bootstrap.min.css`: local Bootstrap 5.3 distribution for offline-consistent UI.
- `www/css/all.min.css`: minified icon set (Font Awesome-derived) referenced by buttons and labels.
- `www/fonts/*.woff2`: Poppins font family (weights 300–700, regular/italic) to avoid external CDN dependencies.
- `www/favicon.ico`: site icon.

## CGI scripts (`www/cgi-bin/`)
- `get_atcommand`: decodes the URL-encoded `atcmd` parameter, sends concatenated commands to `atcli_smd8`, waits for `OK`/`ERROR`, and returns the full modem response with progressive timeouts.
- `user_atcommand`: variant of `get_atcommand` that strips ANSI sequences with `awk`, tailored for the advanced terminal in `settings.html`.
- `get_ping`: runs `ping -c 1 8.8.8.8` and returns `OK` or `ERROR` to test connectivity.
- `get_uptime`: calls `uptime` and outputs plain-text for the Uptime card.
- `get_lanip`: reads `APIPAddr` from `mobileap_cfg.xml` and returns it as JSON, defaulting to "0" if missing.
- `get_ttl_status`: inspects `iptables -t mangle` to detect the TTL rule; returns JSON with `isEnabled` and `ttl`.
- `set_ttl`: reads `ttlvalue` from the query string, stops `/usrdata/simplefirewall/ttl-override`, calls `ttl_script.sh` to enable/disable the value, restarts the service, and returns a JSON log array.
- `get_watchcat_status`: serves `/tmp/watchcat.json` (or `{}`) to show watchdog status and logs.
- `set_watchcat`: creates/updates the `watchcat.service` unit with parameters (`status`, `IpDNS`, `cooldown`, `failures`, `action`); when enabled it writes `/usrdata/simpleadmin/script/watchat.sh` to ping targets, log results, and reboot or swap SIM. Supports full removal when disabled.
- `watchcat_maker`: simplified helper that validates params and delegates to `create_watchcat.sh`/`remove_watchcat.sh`, returning plain-text messages.
- `send_sms`: accepts number and UCS-2 message, runs `AT+CMGS` through `atcli_smd8`, pipes the body to `microcom` with `CTRL+Z`, and returns the raw modem reply.
- `esim_config`: reads `SIMPLEADMIN_ENABLE_ESIM` and `SIMPLEADMIN_ESIM_BASE_URL` from `simpleadmin.conf`, enforces authentication, and returns a JSON payload for the front-end feature toggle.

## Init.d\System Scrips (`opt/scripts` - `/etc/init.d`)

To enable TTL mod and crontab, copy `*.service` files into `/lib/systemd/system/` then make a symlink to make it bootable with these commands:

```
ln -s /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service
ln -s /lib/systemd/system/ttl-override.service /lib/systemd/system/multi-user.target.wants/ttl-override.service
```

Then copy `ttl-override` script into `/opt/scripts/ttl/` and make it executable with `chmod +x ttl-override`
For enable reboot schedulare, create `/persit/cron` folder

## Development tools
### `deploy-www.sh` — Deployment script
- Purpose: automated deployment of the `www` directory to the modem's web server partition.
- Prerequisites: the script assumes an SSH key is already installed for the `root` user on the modem. Ensure passwordless SSH access is configured before running.
- Usage: execute from the repository root with optional host and flags:
  - `./deploy-www.sh`: standard deployment to default host `192.168.225.1` (preserves existing config settings).
  - `./deploy-www.sh [HOST]`: deploy to a custom host IP/address (e.g., `./deploy-www.sh 192.168.1.100`).
  - `./deploy-www.sh --nologin`: disables login requirement by setting `SIMPLEADMIN_ENABLE_LOGIN=0` in the config file (uses default host).
  - `./deploy-www.sh --noesim`: disables eSIM management by setting `SIMPLEADMIN_ENABLE_ESIM=0` in the config file (uses default host).
  - `./deploy-www.sh [HOST] --nologin --noesim`: combine custom host with flags (host must be the first argument if not starting with `--`).
- How it works: the script copies the local `www` directory to `/tmp` on the remote modem via `scp`, then via SSH it stops `qcmap_httpd.service`, removes the old `/WEBSERVER/www` directory, moves the new files to `/WEBSERVER/www`, sets permissions (`chmod -R 755`), optionally modifies `simpleadmin.conf` based on flags, and restarts the web server service.

## Operational notes
- All pages load `js/dark-mode.js` so theme preference stays consistent through `localStorage`.
- AT batches sent to `cgi-bin/get_atcommand` combine multiple commands with `;`; keep generous timeouts and show loaders (`.loader`) for long replies.
- CGI scripts assume proprietary helpers like `atcli_smd8` and `/usrdata/simpleadmin/script/...`; verify your firmware has them before deploying.
