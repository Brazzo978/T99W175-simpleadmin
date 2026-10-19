# TODO

Item-by-item pass started on 2026-10-19: one commit per item on `Beta`,
pushed at the end. The Next.js front-end is a port of QManager-RM520N
(`7a7007c`) onto the bridges and the SimpleAdmin CGIs; the classic pages
stay in `deploy/www-alpine` and are not extended (decided 2026-10-17).

## Deploy and verify the merged work
Merged on `Beta`, not installed yet: the `next` bump needs a fresh
`npm ci` of the shared `frontend/node_modules`, done once the agents still
building with it have finished.
- [ ] `npm ci` (next 16.4.2), `frontend/build.sh`, full `./install.sh`
- [ ] `BUILD` stamp without `-dirty`
- [ ] Change password from the user menu: wrong current password refused,
      right one accepted, as admin and as a read-only user
- [ ] Decide: change password open to every role (each user changes their
      own after typing the current one), as implemented
- [ ] GUI toggle key moved to `/data/simpleadmin/gui_toggle.key`:
      `config/simpleadmin.conf` no longer holds it, lock/unlock still work
- [ ] Next.js navigation and prefetches (`__next.*.txt`, the `HEAD` that
      16.4 sends) answer 200 with the gzip-only web root
- [ ] Antenna Statistics: `rx_diversity` against the chains that report,
      NR per-chain SNR (`snr_rx`, not seen so far)
- [ ] Antenna Alignment: a recording, also under QMI fallback (2 s polls)
- [ ] Frequency Calculator: bands and channels against the serving carriers
- [ ] Recent Activities: hold times and the dashboard filter stay readable
      over RRC idle/connected cycles and SCell churn

## system_bridge: dashboard data, histories, captive portal
- [x] Hostname, kernel, `/data` usage, data session age (dashboard, About)
- [x] 24 h latency and 30 min signal kept without clients, sent on connect
      (24 h chart in Connection Monitoring)
- [x] Captive-portal probe (`SIMPLEADMIN_HTTP_PROBE`, "Carrier Limited")
- [x] Merged on `Beta`
- [ ] Decide: background pings every 10 s while no page is open cost about
      3 MB of mobile data a day (90 MB a month on the backup SIM); every
      60 s would be about 0.5 MB, but the 24 h history then has 1-minute
      resolution (bridge and store rework)
- [ ] Verify on the modem: data session age after a data reconnect, the
      history on connect, the probe with `http://google.com/` (portal) and
      back to the default
- [ ] LTE UE category: not in QMI NAS/DMS nor `AT^DEBUG?`; only in the RRC
      UE capability information at attach (0xB0C0, diag_bridge)

## Persistent data counter that includes IPA-offloaded traffic
system_bridge counts `rmnet_ipa0`, which equals the `rmnet_dataN` counters
plus the 8-byte QMAP header per packet: LAN flows the IPA forwards in
hardware (eth0 offload is on) are likely missing.
- [x] Counter kept across reboots, saved every 10 min and on stop, reset
      through `cgi-bin/reset_data_usage`
- [ ] Confirm the gap with a known download from a LAN client (compare with
      the Signal Details throughput)
- [ ] IPA-inclusive source: QMI WDS packet statistics on clients bound like
      QCMAP's (Bind Mux Data Port with the IPA endpoint and the call's mux
      id, one client per IP family), or diag_bridge counting transport
      blocks continuously (it would keep the DIAG subscription without
      clients; MAC bytes, retransmissions included)

## 4-tier watchdog
COPS → CFUN=4/1 → SIM switch → reboot, with rate limits, replacing
`connection_watchdog` (decided 2026-10-19). Never CFUN=0 on this modem.
- [x] Implementation: tiers, rate limits kept across reboots, JSON activity
      log, Connection Monitoring cards (tiers, limits, status, activity)
- [x] Merged on `Beta`
- [ ] Deploy, then trigger tiers 1, 2 and 4 on the modem (README,
      "Connection watchdog": unreachable ping target, one tier at a time)
      and check the Recovery Activity card
- [ ] Tier 3 (SIM switch), with a second SIM and with an empty slot: needs
      your OK, SIM switch was not among the authorized live tests

## Per-SIM profiles (APN + TTL)
Applied automatically when the ICCID changes (decided 2026-10-19).
- [x] Implementation: profiles in /data/simpleadmin/sim-profiles,
      `sim-profiles.timer` (30 s) and the watchdog's SIM switch apply them,
      SIM Profiles page with create/edit/delete/apply
- [x] Merged on `Beta`
- [ ] Deploy, then verify create from current settings, apply unchanged,
      TTL apply, APN/PDP apply (CFUN=4/1) and restore
- [ ] Automatic apply on a SIM change: needs your OK (SIM switch)
- [ ] Check that the operator profile (MBN) does not rewrite profile 1
      after an apply

## diag_bridge fixes (bridge repository)
- [ ] A former PCell stays in `lte[]` next to the serving one (B20/PCI 26
      still "measured" after the PCell moved to B1/PCI 406): Recent
      Activities counts 6 LTE carriers instead of 4 and reports a false band
      change (in progress)
- [ ] NR timing advance: 0xB825 arrives but `ta_scs_estimated` stays true,
      the decoder does not extract the SCS (in progress)
- [ ] Merge, rebuild, install, verify after a reselection

## Core: stale SLAAC state on dc-rtr-01
`lte-backup` keeps default routes via modem link-locals that ra-guard
withdraws (router lifetime 0 every 5 minutes, confirmed with a dump), and
`vl300_lte1` keeps the SLAAC addresses of old prefixes since lte-watch was
removed. Worked on together with the proxmox-infra session.
- [x] ra-guard stopped on the modem (15:15) to test whether its
      router-lifetime-0 RAs re-create those routes on RouterOS
- [ ] proxmox-infra removes the stale addresses and routes and watches 15 min
- [ ] Restart ra-guard; if the routes came back only with its RAs, stop
      sending RAs from stale link-locals (the core is the only LAN host)

## Page strings to locales
- [ ] Move the English page strings to `locales/` (en, it), after every
      page change above is merged

## Signal Details cleanup (last, after watching it under traffic)
Every log is subscribed and every field shown, empty or not; the "DIAG log
coverage" card counts each log code.
- [ ] Trim the diag_bridge subscription to the logs that arrive. Never seen
      so far: 0xB823, 0xB8D8 (NR SNR), 0xB884 (NR UL power, path loss),
      0xB180 (LTE neighbours), 0xB9CD. 0xB8A1 arrives at thousands a minute
      and is debug-only: first to drop
- [ ] Hide the fields that never come instead of showing a dash
- [ ] Decide whether the coverage card stays or moves to a diagnostics page

## Modem actions not exercised yet
They send the same commands as the classic pages did.
- [ ] SIM switch
- [ ] SMS send and delete (also through `atcli_smd8 -p`, `cgi-bin/send_sms`)
- [ ] IMEI write
- [ ] Watchdog save
- [ ] eSIM download
- [ ] Unlocking a cell leaves `AT^SLMODE` at 1,0 (automatic), not at the
      previous value (1,7 here): restore it, or confirm it is equivalent

## Other
- [ ] QMI service rediscovery while Linux keeps running (a modem subsystem
      restart): `AT+CFUN=1,1` and `reboot` restart the whole system, after
      which system_bridge finds every service again (checked 2026-10-19);
      the in-process path (`qmi_lookup` when a service is marked lost)
      cannot be triggered from AT
- [ ] `config/simpleadmin.conf` is still served without login (no secret
      left in it). Hiding it would take a `D:*` line in `config/httpd.conf`,
      untested on busybox 1.29.3 httpd (started without `-c`)
- [x] Tailscale auth key in the GET query string of `cgi-bin/tailscale`:
      risk accepted (2026-10-07)

## Done on 2026-10-19 ✅
- [x] Text assets installed gzip-only (web root 5.5 → 2 MB, rootfs 4.9 →
      7 MB free); `.html` pages also uncompressed for Next.js prefetches
- [x] Band lock and reset, LTE and NR cell lock and unlock, APN change
      exercised on the modem and restored
- [x] APN change and airplane mode use CFUN=4, not CFUN=0 (which lost the
      SIM until a reboot)
- [x] system_bridge back with every QMI service after a full restart
- [x] `bridge0` link-local stable across reboots (`fe80::255:7bff:feb5:7df7`)
- [x] Dashboard Recent Activities from DIAG events, radio changes and the
      connectivity checks, with the event model shared with Signal Details
- [x] QMI NR SINR copied only onto the same NR PCI, summary recomputed
      after the QMI merge
- [x] Antenna Statistics, Antenna Alignment, Frequency Calculator
- [x] next 16.4.2, clean `BUILD` stamp, change password from the user menu,
      `get_sys_info` removed, GUI toggle key out of the web root

## Done before ✅
- [x] Shell: sidebar, session gate, login, user menu, en + it
- [x] Dashboard from diag_bridge / system_bridge, About page, reboot countdown
- [x] Every former page rebuilt (Signal Details, Cellular Settings, Band and
      Cell Locking, SMS Center, eSIM, Local Network, Connection Monitoring,
      Tailscale, AT Terminal, Credentials, System)
- [x] Signal Details on the AirScreen-based diag_bridge (2026-10-17/18):
      throughput, carrier table, radio events log, trends, histograms,
      neighbours, per-carrier cards, DIAG log coverage; dashboard CQI, rank,
      TX power, cell distance
