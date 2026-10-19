# TODO

## Status (2026-10-19, afternoon)

Working through this list item by item; one commit per item on `Beta`,
pushed at the end.

- **In progress** (separate worktrees, merged when done):
  - system_bridge: dashboard gaps, persistent data counter, signal and
    latency history kept in the bridge, captive-portal probe.
  - 4-tier watchdog and per-SIM profiles (APN + TTL).
  - diag_bridge repo: a former PCell published next to the serving one
    (the dashboard then counts too many carriers and reports false band
    changes), and the NR TA subcarrier spacing not taken from 0xB825.
- **Merged, not deployed yet** (waiting for the agents above, because the
  `next` bump needs a fresh `npm ci` of the shared `node_modules`): next
  16.4.2, clean `BUILD` stamp, change password from the user menu (open to
  every role: each user changes their own password after typing the current
  one; confirm this choice), `get_sys_info` removed, GUI toggle key moved
  to `/data/simpleadmin/gui_toggle.key`, Antenna Statistics, Antenna
  Alignment, Frequency Calculator.
- **Done and verified on the modem today**: text assets installed
  gzip-only (web root 5.5 → 2 MB, rootfs 4.9 → 7 MB free); band lock,
  cell lock and APN change exercised and restored; APN change and airplane
  mode moved from `CFUN=0` (lost the SIM until a reboot) to `CFUN=4`;
  system_bridge back with every QMI service after a restart; `bridge0`
  link-local stable across reboots (`fe80::255:7bff:feb5:7df7`); Recent
  Activities fed (internet restored, CA and band changes, 5G handovers
  seen live).
- **Next**: deploy and verify the merged items, then move the page strings
  to `locales/` (after every page change is in), then the Signal Details
  cleanup (last, so the log counters cover more time under traffic).
- **Outside this repository**: dc-rtr-01 keeps SLAAC default routes in
  `lte-backup` via modem link-locals that ra-guard withdraws (router
  lifetime 0, sent every 5 minutes, confirmed with a dump), and old SLAAC
  addresses on `vl300_lte1` since lte-watch was removed. Reported to the
  proxmox-infra session; core-side.

## Web interface (Next.js front-end)

Port of the QManager frontend onto the bridges and the SimpleAdmin CGIs
(README, "Web interface"). Upstream reference: QManager-RM520N `7a7007c`;
pages removed from `frontend/` are re-imported from there when ported.

### Done
- Shell: sidebar, session gate, login, user menu (theme, language,
  change password, reconnect, reboot, logout), en + it.
- Dashboard from diag_bridge / system_bridge (`lib/bridge/`), About page,
  reboot countdown.
- Every former page rebuilt: Signal Details, Cellular Settings, Band and
  Cell Locking, SMS Center, eSIM, Local Network, Connection Monitoring,
  Tailscale, AT Terminal, Credentials, System. The classic pages stay in
  `deploy/www-alpine` (`./install.sh --www-alpine`).
- Signal Details on the AirScreen-based diag_bridge (2026-10-17/18):
  aggregate throughput with its trend, carrier table, radio events log
  (LTE RRC state, failure counters, category badges, whole session kept in
  the store), throughput by carrier, trends and histograms over a 1/5/10 min
  window, LTE neighbour cells, per-carrier cards (CQI, rank, TX power with
  MTPL/Pcmax, PHR, timing advance distance, DL/UL link table), DIAG log
  coverage. Dashboard: CQI, rank, TX power, cell distance from `ta_m`.
  The classic pages were not extended (decided 2026-10-17).
- Dashboard Recent Activities (2026-10-19), derived in the browser
  (`lib/bridge/activities.ts`) with the event model of the Signal Details
  radio events log (`lib/bridge/events.ts`): DIAG failures, cell changes and
  abnormal RRC transitions; PCell band/cell, SCell set and 5G NR leg changes
  between radio snapshots; internet lost/restored and high latency from the
  system_bridge checks.
- Antenna Statistics (per-chain live values and statistics over the radio
  history), Antenna Alignment (three slots of five samples, recommendation)
  and the Frequency Calculator (EARFCN/NR-ARFCN ↔ frequency and band), ported
  from QManager onto the bridges (2026-10-19).

### Next
- [ ] Page strings are English only: move them to `locales/` (en, it).
- [ ] Verify on the modem the actions not exercised yet (they send the same
      commands as the classic pages did): SIM switch, SMS send/delete, IMEI
      write, watchdog save, eSIM download. Verified on 2026-10-19: band lock
      and reset, LTE and NR cell lock and unlock, APN change (after moving
      its radio restart from CFUN=0 to CFUN=4: CFUN=0 lost the SIM until a
      reboot). Unlocking leaves `AT^SLMODE` at 1,0 (automatic), not at the
      previous value (1,7 here).

### Features chosen from QManager (first round)
- [ ] Network events: Recent Activities is fed (see Done). Data link
      up/down from system_bridge is covered only as internet lost/restored
      (its ping/DNS checks). The log lives in the page, so a reload empties
      it. Check on the modem that the hold times and the dashboard filter
      keep it readable (RRC idle/connected cycles, SCell churn).
- [ ] (in progress) Signal history (30 min) and latency history (24 h) kept
      in the bridges and sent on connect; today the store samples them in
      the browser.
- [ ] (in progress) Captive-portal probe (HTTP 204) added to the ICMP + DNS
      checks: wanted (decided 2026-10-19).
- [ ] (in progress) Watchdog with 4 tiers (COPS → CFUN=4/1 → SIM switch →
      reboot) and rate limit, replacing `connection_watchdog` (decided
      2026-10-19; never CFUN=0 on this modem).
- [ ] Antenna Statistics, Antenna Alignment and Frequency Calculator are
      built (2026-10-19); check them on the modem: `rx_diversity` against
      the chains that report, NR per-chain SNR (`snr_rx`, not seen so far),
      an alignment recording under QMI fallback (2 s polls), and the
      calculator's band tables against the serving carriers.
- [ ] (in progress) Per-SIM profiles (APN + TTL) applied on SIM change
      (decided 2026-10-19).
- [ ] (in progress) Persistent data counter across reboots
      (`hooks/use-data-used.ts`). The source must include IPA-offloaded
      traffic: diag_bridge's rates do, but they are rates with HARQ
      retransmissions and the bridge reads DIAG only while a page is open;
      a cumulative IPA-inclusive counter (QMI WDS byte totals) is preferred.

### Signal Details cleanup (after watching it under traffic)
Every log is subscribed and every field shown, empty or not, to see what
this firmware sends (the "DIAG log coverage" card counts each log code).
- [ ] Trim the diag_bridge subscription to the logs that arrive. Never seen
      so far: 0xB823, 0xB8D8 (NR SNR), 0xB884 (NR UL power, path loss),
      0xB180 (LTE neighbours), 0xB9CD. 0xB8A1 arrives at thousands a minute
      and is debug-only: first to drop.
- [ ] Then hide the fields that never come (NR SNR, NR path loss, NR TX
      power...) instead of showing a dash, and decide whether the coverage
      card stays or moves to a diagnostics page.
- [ ] (in progress, bridge repo) NR timing advance: 0xB825 arrives but
      `ta_scs_estimated` stays true, so its decoder probably does not
      extract the SCS.
- [ ] (in progress, bridge repo) A former PCell stays in `lte[]` next to the
      serving one (seen: B20/PCI 26 still "measured" after the PCell moved to
      B1/PCI 406), so Recent Activities counts 6 LTE carriers instead of 4
      and reports a false band change.

### Gaps in the dashboard
- [ ] (in progress) system_bridge: hostname, kernel version, storage of
      `/data` (`hooks/use-modem-subsys.ts`), connection uptime, LTE category.

## Other
- [ ] Verify a real SMS send through `atcli_smd8 -p` (`cgi-bin/send_sms`).
- [ ] QMI service rediscovery while Linux keeps running (a modem subsystem
      restart): `AT+CFUN=1,1` and `reboot` both restart the whole system,
      after which system_bridge finds every service again (checked
      2026-10-19); the in-process path (`qmi_lookup` when a service is
      marked lost) has no way to be triggered from AT.
- [ ] `config/simpleadmin.conf` is still served without login, but holds no
      secret since the GUI toggle key moved to
      `/data/simpleadmin/gui_toggle.key`. Hiding it too would take a `D:*`
      line in a `config/httpd.conf`, untested on the modem's busybox 1.29.3
      httpd (started without `-c`, no `/etc/httpd.conf`).
- The Tailscale auth key travels in the GET query string of
  `cgi-bin/tailscale`: risk accepted (2026-10-07).
