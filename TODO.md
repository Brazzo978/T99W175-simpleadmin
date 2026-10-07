# TODO

## New web interface (branch `feature/qmanager-ui`)

Port of the QManager frontend onto the bridges and the SimpleAdmin CGIs
(README, "New web interface"). Upstream reference: QManager-RM520N `7a7007c`;
pages removed from `frontend/` are re-imported from there when ported.

### Done
- Shell: sidebar, session gate, login, user menu (theme, language,
  reconnect, reboot, logout), en + it.
- Dashboard from diag_bridge / system_bridge (`lib/bridge/`), About page,
  reboot countdown.

### Next: pages that exist as classic pages
- [ ] Signal details (`advanced.html` CA view) → `/cellular` page with all
      carriers, DL/UL rows, per-chain values.
- [ ] Radio settings (`radio-settings.html`): band lock (`AT^BAND_PREF_EXT`),
      cell lock (`AT^LTE_LOCK`), network mode (`AT^SLMODE`), SIM slot, APN.
- [ ] SMS center (`sms.html`), eSIM (`esim.html`).
- [ ] System settings (`settings.html`): connection watchdog, TTL, bridge mode,
      scheduled reboot; credentials (`credentials.html`); device tools and AT
      terminal (`deviceinfo.html`, `advanced.html`).
- [ ] Connection monitoring (`monitor.html`), Tailscale.
- [ ] Then drop `classic.html` and the classic pages they replace.

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
- [ ] Change password from the user menu (today it opens `credentials.html`).
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
