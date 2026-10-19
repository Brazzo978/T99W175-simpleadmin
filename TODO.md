# TODO

## Web interface (Next.js front-end)

Port of the QManager frontend onto the bridges and the SimpleAdmin CGIs
(README, "Web interface"). Upstream reference: QManager-RM520N `7a7007c`;
pages removed from `frontend/` are re-imported from there when ported.

### Done
- Shell: sidebar, session gate, login, user menu (theme, language,
  reconnect, reboot, logout), en + it.
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

### Next
- [ ] Page strings are English only: move them to `locales/` (en, it).
- [ ] Verify on the modem the actions not exercised yet (they send the same
      commands as the classic pages did): band/cell lock, APN change, SIM
      switch, SMS send/delete, IMEI write, watchdog save, eSIM download.

### Features chosen from QManager (first round)
- [ ] Network events: diag_bridge now pushes DIAG events (`rrc`, `events`)
      and Signal Details shows them. Still to do: feed the dashboard "Recent
      Activities" with them (`hooks/use-recent-activities.ts`), plus data
      link up/down from system_bridge.
- [ ] Signal history (30 min) and latency history (24 h) kept in the bridges
      and sent on connect; today the store samples them in the browser.
- [ ] Connectivity: upstream moved from the HTTP 204 probe back to ICMP; ours
      (ICMP + DNS) is equivalent. Decide whether a captive-portal probe is
      still wanted.
- [ ] Watchdog with 4 tiers (COPS → CFUN → SIM switch → reboot) and rate
      limit, replacing `connection_watchdog`.
- [ ] Antenna statistics and alignment pages (per-chain RSRP/SINR from DIAG),
      EARFCN/ARFCN frequency calculator (frontend only).
- [ ] Per-SIM profiles (APN + TTL) applied on SIM change.
- [ ] Persistent data counter (rmnet bytes across reboots) in system_bridge
      (`hooks/use-data-used.ts`).

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
- [ ] NR timing advance: 0xB825 arrives but `ta_scs_estimated` stays true,
      so its decoder probably does not extract the SCS (bridge side).
- [ ] Recent Activities and the radio events log could share one event
      model (categories, labels) once the dashboard uses the events.

### Gaps in the dashboard
- [ ] system_bridge: hostname, kernel version, storage of `/data`
      (`hooks/use-modem-subsys.ts`), connection uptime, LTE category.
- [ ] Change password from the user menu (today it is in Credentials).
- [ ] `lib/bridge/radio.ts`: copy the QMI NR SINR only onto the same NR
      PCI (today a single DIAG NR cell takes it unconditionally, wrong for a
      few seconds around an NR handover); recompute `summary` after the QMI
      merge if anything starts reading it.
- [ ] Rootfs space: www is 5.5 MB with the gzip copies and the rootfs has
      4.9 MB free (2026-10-19); check whether busybox httpd can serve `.gz`
      without the original.
- [ ] `frontend/build.sh` always stamps `BUILD` as `-dirty`: it rewrites
      `deploy/www-nextjs` before running `git describe`.
- [ ] Bump `next` past 16.0.7 (advisory concerns server features, not the
      static export).

## Other
- [ ] `bridge0` link-local changes at every boot (derived from the random
      MAC before persistent-mac sets the fixed one); ra-guard withdraws the
      old one, a stable one would make that unnecessary.
- [ ] Verify a real SMS send through `atcli_smd8 -p` (`cgi-bin/send_sms`).
- [ ] Verify QMI service rediscovery after an actual modem restart.
- [ ] Remove the unused `cgi-bin/get_sys_info`?
- [ ] `config/simpleadmin.conf` is readable without login and holds
      `SIMPLEADMIN_GUI_TOGGLE_KEY` (predates the new interface).
- The Tailscale auth key travels in the GET query string of
  `cgi-bin/tailscale`: risk accepted (2026-10-07).
