# Detailed documentation for "Simple T99"

## Project overview
"Simple T99" is a web administration interface designed for modem/routers based on the Quectel T99W175 modem. The application consists of static HTML pages enhanced with Bootstrap 5 and Alpine.js on the client side, together with a collection of Bash CGI scripts that run AT commands, query the system state, and orchestrate utilities such as Watchcat, TTL override, or SMS sending. Every file is intended to be deployed on the device's web partition and executed by the embedded HTTP server.

## Repository structure
- `README.md`: brief project overview with a reference to this documentation.
- `www/`: main directory served by the modem's HTTP server.
  - Page HTML files (`index.html`, `network.html`, `scanner.html`, `settings.html`, `sms.html`, `deviceinfo.html`, `watchcat.html`, `watchcat_backup.html`).
  - Static assets (`css/`, `js/`, `fonts/`, `favicon.ico`).
  - Bash CGI scripts (`cgi-bin/`) invoked via fetch requests from the web pages.

## HTML file details
### `www/index.html`
Homepage showing the modem's general status. The template includes a Bootstrap navbar, summary widgets, and three main sections:
- "Device Overview" panel with cards for temperature, SIM status, signal, and uptime, all refreshed by `processAllInfos()` through AT command polling (`get_atcommand`).【F:www/index.html†L1-L384】【F:www/index.html†L600-L879】
- Numeric throughput panels for 5G/LTE derived from parsing `^NRSTAT` and `^SRVST` responses (`nrDownload`, `nonNrUpload`, etc.).【F:www/index.html†L384-L600】
- Detailed tables with cell identifiers (eNBID, CellID, TAC), IP addresses, network status, and quality indicators (RSRP/RSRQ/SINR) rendered with client-side progress bars.【F:www/index.html†L180-L384】【F:www/index.html†L520-L720】
The `processAllInfos()` function defines the initial state, performs cyclic fetches to the `get_atcommand` CGI, and parses AT responses to populate Alpine properties. It also handles fallbacks in case of errors and stores the last update timestamp.【F:www/index.html†L600-L879】

### `www/network.html`
Radio configuration interface. The Alpine component `cellLocking()` handles:
- Retrieval of supported and currently locked bands via `AT^BAND_PREF_EXT?`, dynamically filling the form with `populateCheckboxes()` and controls that display the operator-allowed bands.【F:www/network.html†L1-L260】【F:www/network.html†L440-L720】
- Ability to lock LTE/NR5G bands for each mode (LTE, NSA, SA) by sending `AT^BAND_PREF`. The code preserves the selected state and updates `updatedLockedBands` when checkboxes change.【F:www/network.html†L260-L520】
- Network utilities (ping, TTL, reset) and a confirmation modal, plus helpers to generate EARFCN/PCI inputs with `generate-freq-box.js` and interpret the current settings with `parseCurrentSettings()`.【F:www/network.html†L200-L360】【F:www/js/generate-freq-box.js†L1-L38】【F:www/js/parse-settings.js†L1-L92】

### `www/scanner.html`
Page dedicated to cell scanning. It loads Chart.js (for future charts) and instantiates `cellScanner()` which:
- Contains an MCC/MNC→operator name dictionary used to label scan results.【F:www/scanner.html†L1-L320】
- Provides `startCellScan()` and `parseCellScan()` functions (defined later in the file) that issue multi-step AT commands to obtain LTE and NR5G cell tables and populate the dynamic table with frequencies, bands, PCI, RSRP, and signal level.【F:www/scanner.html†L320-L520】
- Manages loading states, result clearing, mode switches (Full/LTE/NR5G), and disables buttons during scans to avoid concurrent commands.【F:www/scanner.html†L120-L220】【F:www/scanner.html†L320-L420】

### `www/settings.html`
Advanced utilities hub. `simpleSettings()` exposes several actions:
- AT terminal with output textarea, history, and send/clear buttons; supports multi-command input separated by commas and falls back to `ATI` when empty.【F:www/settings.html†L1-L200】【F:www/settings.html†L380-L540】
- "One Click Utilities" section for reboot, AT configuration reset, IP passthrough management, DNS proxy, and USB mode (RMNET/ECM/MBIM/RNDIS). The code prepares the `AT+QMAP`, `AT+QCFG` commands and calls `rebootDevice()` after changes.【F:www/settings.html†L200-L360】【F:www/settings.html†L540-L660】
- TTL override panel querying `/cgi-bin/get_ttl_status`, enabling/disabling the service with `/cgi-bin/set_ttl`, and displaying debug logs in the response.【F:www/settings.html†L660-L820】
- Watchcat monitor (reading `/cgi-bin/get_watchcat_status`) with buttons to open the dedicated page and regenerate the configuration via `/cgi-bin/set_watchcat`.【F:www/settings.html†L820-L940】
- Support for confirmation modals and reboot countdown, along with logic to keep UI switches synchronized with the values returned by the CGI scripts.【F:www/settings.html†L380-L540】【F:www/settings.html†L700-L860】

### `www/sms.html`
SMS module with bilingual comments (English/Chinese). The `fetchSMS()` component:
- Runs `AT+CMGL="ALL"` through `get_atcommand` to download the inbox, converting UCS-2 responses into readable text with `convertHexToText` and normalizing timestamps (`parseCustomDate`).【F:www/sms.html†L1-L160】【F:www/sms.html†L160-L360】
- Handles multi-selection, "Select All", deletion by specific indexes (`AT+CMGD=`) or bulk removal (`AT+CMGD=,4`).【F:www/sms.html†L200-L320】
- Implements multipart SMS sending in UCS-2 with UDH header calculation (`uid`, segment count) by posting the encoded parameters to the `send_sms` CGI. It shows visual notifications for the outcome and refreshes the inbox after sending.【F:www/sms.html†L320-L360】

### `www/deviceinfo.html`
Information dashboard with an IMEI change modal:
- `fetchDeviceInfo()` issues AT commands (`AT+CGMI`, `AT+CGMM`, `^VERSION?`, `+CIMI`, `+ICCID`, `+CGSN`, `+CNUM`, `+CGCONTRDP`) to obtain manufacturer, model, firmware version, IMSI, ICCID, IMEI, WWAN IP, phone number, and calls `/cgi-bin/get_lanip` for the LAN IP.【F:www/deviceinfo.html†L1-L220】【F:www/deviceinfo.html†L360-L520】
- Allows entering a new IMEI: `updateIMEI()` pads and swaps nibbles, formats the string, and prepares two concatenated `^NV` commands before invoking `rebootDevice()` to apply the change.【F:www/deviceinfo.html†L400-L500】
- Includes a reboot countdown modal, contributor section, and tables showing real-time data.【F:www/deviceinfo.html†L220-L360】【F:www/deviceinfo.html†L500-L520】

### `www/watchcat.html`
Modern interface for configuring the connectivity watchdog:
- The form collects IPs to ping, timeout, and failure threshold, enabling/disabling execution with a switch. `simpleWatchCat()` calls `/cgi-bin/watchcat_maker` with encoded parameters and reloads the state from `/cgi-bin/get_watchcat_status` to reflect the live data in `/tmp/watchcat.json`.【F:www/watchcat.html†L1-L200】【F:www/watchcat.html†L200-L340】
- The `isFormComplete` getter disables the switch until all fields are filled, preventing incomplete configurations.【F:www/watchcat.html†L220-L320】

### `www/watchcat_backup.html`
Previous version of the Watchcat page, almost identical but with slightly different bindings (`x:onchange` instead of `x-on:change`) and without fetching the initial state. Kept as a historical fallback.【F:www/watchcat_backup.html†L1-L200】

### `www/network.html` (Utility section)
Beyond band locking, the page includes tabs for IP passthrough, APN configuration, and manual PCI/EARFCN management using the inputs generated by `generateFreqNumberInputs`. The buttons trigger `cellLocking()` methods to send AT commands for locking, resetting, or opening modals. The checkboxes rely on `populateCheckboxes()` to preserve the locked state even after refreshing.【F:www/network.html†L120-L260】【F:www/js/populate-checkbox.js†L1-L80】

## JavaScript file details
### `www/js/dark-mode.js`
Controls the light/dark theme toggle by updating the `<html>` element's `data-bs-theme` attribute, stores the choice in `localStorage`, and flips the button label. If no preference is present, it defaults to the dark theme.【F:www/js/dark-mode.js†L1-L35】

### `www/js/generate-freq-box.js`
Dynamically creates up to 10 EARFCN/PCI input pairs for the "Manual Cell Locking" section. Listens to the `NumCells` input and fills the `freqNumbersContainer` with conditional markup powered by Alpine (`x-show`).【F:www/js/generate-freq-box.js†L1-L38】

### `www/js/parse-settings.js`
Parses AT command responses to extract the active SIM, APN, cell locking status, network preferences, and PCC/SCC bands. Returns an object with normalized fields used by `cellLocking().getCurrentSettings()`.【F:www/js/parse-settings.js†L1-L92】

### `www/js/populate-checkbox.js`
Generates the band selection checkboxes with a responsive layout (rows of five columns), pre-selects the currently locked ones, and adds listeners to update `cellLock` when the selection changes. It uses a `DocumentFragment` for performance.【F:www/js/populate-checkbox.js†L1-L80】

### Third-party libraries
- `www/js/alpinejs.min.js`: minified Alpine.js 3 build providing `x-data`, `x-show`, and `x-model` bindings throughout the pages.
- `www/js/bootstrap.bundle.min.js`: Bootstrap 5 bundle (including Popper) for UI components and responsive layout.

## CSS and asset details
### `www/css/styles.css`
Defines the import of Poppins fonts in multiple weights, pulls in `all.min.css` (likely Font Awesome), and adds custom styles for loading modals, animated loaders, and utility classes (`.is-warning`, `.is-medium`). Enforces the Poppins font across the app.【F:www/css/styles.css†L1-L120】【F:www/css/styles.css†L120-L200】

### `www/css/bootstrap.min.css`
Local minified distribution of Bootstrap 5.3 to guarantee a consistent offline UI.

### `www/css/all.min.css`
Minified icon stylesheet (derived from Font Awesome) used for optional symbols in the pages.

### `www/fonts/*.woff2`
Complete "Poppins" font set in multiple weights (300–700, regular/italic) loaded locally to reduce external dependencies.

### Other assets
- `www/favicon.ico`: site icon.

## CGI scripts (`www/cgi-bin/`)
### `get_atcommand`
Bash script that receives URL-encoded parameters (`atcmd`), decodes them (`urldecode`), sends the command to `atcli_smd8`, and waits for a response containing `OK` or `ERROR` before returning it as plain text. It gradually increases the waiting time for long responses.【F:www/cgi-bin/get_atcommand†L1-L33】

### `user_atcommand`
Variant of `get_atcommand` that uses `awk` to strip ANSI sequences from the AT response, meant for advanced commands entered by the user on the Settings page.【F:www/cgi-bin/user_atcommand†L1-L32】

### `get_ping`
Runs `ping -c 1 8.8.8.8` and returns "OK" or "ERROR" depending on packet loss, used to check Internet connectivity on the homepage.【F:www/cgi-bin/get_ping†L1-L18】

### `get_uptime`
Calls `uptime` and returns the result as plain text for the homepage Uptime card.【F:www/cgi-bin/get_uptime†L1-L11】

### `get_lanip`
Parses `mobileap_cfg.xml` to retrieve the LAN IP address (`APIPAddr`) and outputs it as JSON. Provides a "0" fallback when the value is missing.【F:www/cgi-bin/get_lanip†L1-L20】

### `get_ttl_status`
Inspects `iptables -t mangle` to find the TTL rule, determining whether the service is active and which value is applied. Produces JSON with `isEnabled` and `ttl`.【F:www/cgi-bin/get_ttl_status†L1-L19】

### `set_ttl`
Manages the TTL override: reads `ttlvalue` from the query string, stops the `/usrdata/simplefirewall/ttl-override` service, invokes `ttl_script.sh` to enable/disable the value, and restarts it. Returns debug logs in a JSON array for UI diagnostics.【F:www/cgi-bin/set_ttl†L1-L60】

### `get_watchcat_status`
Returns `/tmp/watchcat.json` (if present) to expose the watchdog status and log; otherwise responds with `{}`.【F:www/cgi-bin/get_watchcat_status†L1-L18】

### `set_watchcat`
Creates/updates the `watchcat.service` systemd unit based on URL parameters (`status`, `IpDNS`, `cooldown`, `failures`, `action`). When enabled, it generates a `/usrdata/simpleadmin/script/watchat.sh` script that pings the host, records outcomes, and can reboot the modem or swap SIMs. It also handles complete removal when disabled.【F:www/cgi-bin/set_watchcat†L1-L120】

### `watchcat_maker`
Simplified version that validates parameters and delegates to external scripts (`create_watchcat.sh`/`remove_watchcat.sh`) to enable or disable Watchcat, returning plain-text messages.【F:www/cgi-bin/watchcat_maker†L1-L80】

### `send_sms`
Receives UCS-2 number and message parameters (`number`, `msg`, `Command`), issues `AT+CMGS` via `atcli_smd8`, and forwards the body to `microcom` adding `CTRL+Z`. Returns the raw modem response (the script includes a minor parenthesis typo but works as a prototype).【F:www/cgi-bin/send_sms†L1-L40】

### `get_watchcat_status`, `watchcat_maker`, `set_watchcat`
Work together with `www/watchcat*.html` to create persistent services and save logs in `/tmp/watchat.json`, allowing the front-end to display status and ping history.【F:www/cgi-bin/get_watchcat_status†L1-L18】【F:www/cgi-bin/watchcat_maker†L1-L80】【F:www/cgi-bin/set_watchcat†L1-L120】

### `get_lanip`, `get_ping`, `get_uptime`
Provide lightweight JSON or text APIs that feed Device Info, connectivity tests, and the homepage "Uptime" card respectively.【F:www/cgi-bin/get_lanip†L1-L20】【F:www/cgi-bin/get_ping†L1-L18】【F:www/cgi-bin/get_uptime†L1-L11】

## Project notes and overall behavior
- All pages include `js/dark-mode.js`, enabling theme persistence via shared `localStorage` across the entire site.【F:www/index.html†L600-L640】【F:www/settings.html†L1-L60】
- Calls to `/cgi-bin/get_atcommand` concatenate multiple AT commands with `;` to minimize round trips, requiring careful timeout management; the interface shows loaders (`.loader`) while waiting for responses.【F:www/index.html†L600-L720】【F:www/css/styles.css†L80-L140】
- The CGI scripts assume proprietary tools (`atcli_smd8`, `/usrdata/simpleadmin/script/...`) are available, confirming the repository is meant to be deployed on the modem's customized firmware.

