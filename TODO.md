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

### Next
- [ ] Page strings are English only: move them to `locales/` (en, it).
- [ ] Verify on the modem the actions not exercised yet (they send the same
      commands as the classic pages did): band/cell lock, APN change, SIM
      switch, SMS send/delete, IMEI write, watchdog save, eSIM download.

### Features chosen from QManager (first round)
- [ ] Network events (band change, handover, CA change, data link
      up/down) detected in the bridges and pushed over WS; feeds the
      dashboard "Recent Activities" (`hooks/use-recent-activities.ts`).
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

### Gaps in the dashboard
- [ ] system_bridge: hostname, kernel version, storage of `/data`
      (`hooks/use-modem-subsys.ts`), connection uptime, LTE category.
- [ ] Change password from the user menu (today it is in Credentials).
- [ ] `lib/bridge/radio.ts`: copy the QMI NR SINR only onto the same NR
      PCI (today a single DIAG NR cell takes it unconditionally, wrong for a
      few seconds around an NR handover); recompute `summary` after the QMI
      merge if anything starts reading it.
- [ ] Rootfs space: www is ~5.4 MB with the gzip copies (7.4 MB free before);
      check whether busybox httpd can serve `.gz` without the original.
- [ ] Bump `next` past 16.0.7 (advisory concerns server features, not the
      static export).

## Other
- [ ] Verify a real SMS send through `atcli_smd8 -p` (`cgi-bin/send_sms`).
- [ ] Verify QMI service rediscovery after an actual modem restart.
- [ ] Remove the unused `cgi-bin/get_sys_info`?
- [ ] `config/simpleadmin.conf` is readable without login and holds
      `SIMPLEADMIN_GUI_TOGGLE_KEY` (predates the new interface).
- The Tailscale auth key travels in the GET query string of
  `cgi-bin/tailscale`: risk accepted (2026-10-07).
