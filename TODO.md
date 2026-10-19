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
- Dashboard Recent Activities (2026-10-19), derived in the browser
  (`lib/bridge/activities.ts`) with the event model of the Signal Details
  radio events log (`lib/bridge/events.ts`): DIAG failures, cell changes and
  abnormal RRC transitions; PCell band/cell, SCell set and 5G NR leg changes
  between radio snapshots; internet lost/restored and high latency from the
  system_bridge checks.

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

### Gaps in the dashboard
- [ ] system_bridge: hostname, kernel version, storage of `/data`
      (`hooks/use-modem-subsys.ts`), connection uptime, LTE category.
- [ ] Change password from the user menu (today it is in Credentials).
- [ ] `lib/bridge/radio.ts`: copy the QMI NR SINR only onto the same NR
      PCI (today a single DIAG NR cell takes it unconditionally, wrong for a
      few seconds around an NR handover); recompute `summary` after the QMI
      merge if anything starts reading it.
- [ ] `frontend/build.sh` always stamps `BUILD` as `-dirty`: it rewrites
      `deploy/www-nextjs` before running `git describe`.
- [ ] Bump `next` past 16.0.7 (advisory concerns server features, not the
      static export).

## Other
- [ ] `bridge0` link-local changes at every boot (derived from the random
      MAC before persistent-mac sets the fixed one); ra-guard withdraws the
      old one, a stable one would make that unnecessary.
- [ ] Verify a real SMS send through `atcli_smd8 -p` (`cgi-bin/send_sms`).
- [ ] QMI service rediscovery while Linux keeps running (a modem subsystem
      restart): `AT+CFUN=1,1` and `reboot` both restart the whole system,
      after which system_bridge finds every service again (checked
      2026-10-19); the in-process path (`qmi_lookup` when a service is
      marked lost) has no way to be triggered from AT.
- [ ] Remove the unused `cgi-bin/get_sys_info`?
- [ ] `config/simpleadmin.conf` is readable without login and holds
      `SIMPLEADMIN_GUI_TOGGLE_KEY` (predates the new interface).
- The Tailscale auth key travels in the GET query string of
  `cgi-bin/tailscale`: risk accepted (2026-10-07).
