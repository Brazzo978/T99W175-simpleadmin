# diagDaemon WebSocket Radio Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AT^DEBUG?-based signal polling with a WebSocket connection to the diagDaemon binary, feeding all radio signal data (main bars + Advanced Signal Details modal) from `ws://<host>:9001`.

**Architecture:** The Alpine component in `index-process.js` gains a persistent WS connection (`connectDiagWs()`) that auto-reconnects. On each message, `_applyDiagData()` translates the diagDaemon JSON into the existing `detailedSignals[]` schema (extended with new fields) and updates main signal state. AT polling continues for all non-signal data; `^DEBUG?` is removed from the command string along with all code that parsed its output.

**Tech Stack:** Vanilla JS, Alpine.js, Bootstrap 5, diagDaemon WebSocket (port 9001, same JSON format as `radio-monitor.js`)

**Spec:** `docs/superpowers/specs/2026-04-17-diag-daemon-radio-stats-design.md`

---

## File Map

| File | Change |
|------|--------|
| `www/js/index-process.js` | Add WS methods, adapter, remove dead AT-parsing code |
| `www/index.html` | Add badge row + SINR chains + SSB to Advanced Signal Modal |

---

## Task 1: Create branch and add WS plumbing

**Files:**
- Modify: `www/js/index-process.js` — add state + `connectDiagWs()` + wire into `init()`

- [ ] **Step 1: Create `diag-daemon` branch from `main`**

```bash
git checkout main
git checkout -b diag-daemon
```

Expected: now on branch `diag-daemon`.

- [ ] **Step 2: Add `diagWsConnected` to component state**

In `index-process.js`, find the state object (starts around line 44 with `refreshRate:`, `intervalId:`, etc.). Add after `intervalId: null,`:

```js
    diagWsConnected: false,
    _diagWs: null,
```

- [ ] **Step 3: Add `connectDiagWs()` method**

Add this method just before the `init()` method (around line 3569):

```js
  connectDiagWs() {
    const host = window.location.hostname || 'localhost';
    let ws;
    try {
      ws = new WebSocket('ws://' + host + ':9001');
    } catch (_) {
      setTimeout(() => this.connectDiagWs(), 3000);
      return;
    }
    this._diagWs = ws;
    ws.onopen = () => { this.diagWsConnected = true; };
    ws.onclose = () => {
      this.diagWsConnected = false;
      setTimeout(() => this.connectDiagWs(), 3000);
    };
    ws.onerror = () => { ws.close(); };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this._applyDiagData(data);
      } catch (_) {}
    };
  },
```

- [ ] **Step 4: Call `connectDiagWs()` in `init()`**

In `init()` (around line 3569), right after `this.fetchAllInfo();`, add:

```js
    this.connectDiagWs();
```

- [ ] **Step 5: Verify WS plumbing compiles**

Open browser console on `index.html`. Confirm no JS errors. Check:

```js
// in browser console, after Alpine initialises:
document.querySelector('[x-data]').__x.$data.diagWsConnected
// → false (no daemon running in dev) or true (if daemon is running on device)
```

- [ ] **Step 6: Commit**

```bash
git add www/js/index-process.js
git commit -m "feat: add diagDaemon WebSocket connection plumbing"
```

---

## Task 2: Add `_applyDiagData()` adapter

**Files:**
- Modify: `www/js/index-process.js` — add adapter method

- [ ] **Step 1: Add `_applyDiagData()` method**

Add this method directly after `connectDiagWs()`:

```js
  _applyDiagData(data) {
    const lte = Array.isArray(data.lte) ? data.lte : [];
    const nr  = Array.isArray(data.nr)  ? data.nr  : [];

    const popcount = (n) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };
    const rnd = (v) => (typeof v === 'number' && !isNaN(v)) ? Math.round(v * 10) / 10 : null;

    const buildMetric = (key, label, value, unit, tech, isCA = false) => {
      const v = rnd(value);
      if (v === null) return { key, label, display: 'N/A', percentage: 0, color: '#6c757d', value: null, isCA };
      let percentage = 0, color = '#6c757d';
      if (key === 'rsrp') { const r = this.calculateRSRPBar(v, tech); percentage = r.percentage; color = r.color; }
      else if (key === 'rsrq') { const r = this.calculateRSRQBar(v, tech); percentage = r.percentage; color = r.color; }
      else if (key === 'rssi') { const r = this.calculateRSSIBar(v, tech); percentage = r.percentage; color = r.color; }
      else if (key === 'sinr') { const r = this.calculateSINRBar(v, tech); percentage = r.percentage; color = r.color; }
      return { key, label, display: `${v} ${unit}`, percentage, color, value: v, isCA };
    };

    const buildAntenna = (rxVal, antIdx, tech) => {
      const v = rnd(rxVal);
      if (v === null) return null;
      const r = this.calculateRSRPBar(v, tech);
      return { physicalAntenna: antIdx, logicalIndex: antIdx, value: v, percentage: r.percentage, color: r.color, display: `${v} dBm` };
    };

    const signals = [];

    lte.forEach((c, i) => {
      const tech = 'LTE';
      const isCA = i > 0;
      const baseTitle = i === 0 ? 'Primary 4G' : `CA 4G #${i}`;
      const title = c.band ? `${baseTitle} (Band ${c.band})` : baseTitle;

      const antennas = (c.rsrp_rx || []).map((v, j) => buildAntenna(v, j, tech)).filter(Boolean);

      const sinrChains = (c.sinr_rx || []).map((v, j) => {
        const rounded = rnd(v);
        if (rounded === null) return null;
        const r = this.calculateSINRBar(rounded, tech);
        return { physicalAntenna: j, value: rounded, percentage: r.percentage, color: r.color, display: `${rounded} dB` };
      }).filter(Boolean);

      signals.push({
        id: `lte-diag-${i}`,
        title,
        technology: tech,
        role: isCA ? 'secondary' : 'primary',
        caIndex: isCA ? i : null,
        band: c.band ? String(c.band) : null,
        bandDisplay: c.band ? `Band ${c.band}` : 'N/A',
        bandwidthDisplay: c.bandwidth_mhz ? `${c.bandwidth_mhz} MHz (${c.bandwidth_prb} PRB)` : 'N/A',
        channelDisplay: String(c.earfcn),
        pciDisplay: String(c.pci),
        rxDiversityDisplay: popcount(c.rx_diversity || 0) + 'R',
        metrics: [
          buildMetric('rsrp', 'RSRP', c.rsrp, 'dBm', tech),
          buildMetric('rsrq', 'RSRQ', c.rsrq, 'dB',  tech),
          buildMetric('rssi', 'RSSI', c.rssi, 'dBm', tech),
          buildMetric('sinr', 'SINR', c.sinr, 'dB',  tech, isCA),
        ],
        antennas,
        sinrChains,
        dlMbps:      typeof c.dl_mbps   === 'number' ? c.dl_mbps   : null,
        modulation:  c.modulation  || null,
        mcs:         typeof c.mcs === 'number' ? c.mcs : null,
        txAntennas:  c.tx_antennas || null,
        ssb:         null,
        numBeams:    null,
        neighborCells: null,
      });
    });

    nr.forEach((c, i) => {
      const tech = 'NR';
      const baseTitle = 'Primary 5G';
      const title = c.band ? `${baseTitle} (Band n${c.band})` : baseTitle;

      const antennas = (c.rsrp_rx || []).map((v, j) => buildAntenna(v, j, tech)).filter(Boolean);

      signals.push({
        id: `nr-diag-${i}`,
        title,
        technology: tech,
        role: 'primary',
        caIndex: null,
        band: c.band ? `n${c.band}` : null,
        bandDisplay: c.band ? `Band n${c.band}` : 'N/A',
        bandwidthDisplay: c.bandwidth_mhz ? `${c.bandwidth_mhz} MHz` : 'N/A',
        channelDisplay: String(c.arfcn),
        pciDisplay: String(c.pci),
        rxDiversityDisplay: popcount(c.rx_diversity || 0) + 'R',
        metrics: [
          buildMetric('rsrp', 'RSRP', c.rsrp, 'dBm', tech),
          buildMetric('rsrq', 'RSRQ', c.rsrq, 'dB',  tech),
        ],
        antennas,
        sinrChains:  [],
        dlMbps:      null,
        modulation:  c.modulation  || null,
        mcs:         null,
        txAntennas:  null,
        ssb:         typeof c.ssb === 'number' ? c.ssb : null,
        numBeams:    c.num_beams     || null,
        neighborCells: c.neighbor_cells || null,
      });
    });

    this.detailedSignals = signals;
    this.networkAnalysis = this.buildNetworkAnalysis(this.detailedSignals);

    // Main signal state from primary cells
    if (lte.length > 0) {
      const p = lte[0];
      const rsrp = rnd(p.rsrp), rsrq = rnd(p.rsrq), rssi = rnd(p.rssi), sinr = rnd(p.sinr);
      this.rsrpLTE = rsrp !== null ? String(rsrp) : '-';
      this.rsrqLTE = rsrq !== null ? String(rsrq) : '-';
      this.rssiLTE = rssi !== null ? String(rssi) : '-';
      this.sinrLTE = sinr !== null ? String(sinr) : '-';
      this.rsrpLTEPercentage = this.calculateRSRPPercentage(rsrp ?? NaN);
      this.rsrqLTEPercentage = this.calculateRSRQPercentage(rsrq ?? NaN);
      this.rssiLTEPercentage = this.calculateRSSIPercentage(rssi ?? NaN);
      this.sinrLTEPercentage = this.calculateSINRPercentage(sinr ?? NaN);
    } else {
      this.rsrpLTE = '-'; this.rsrqLTE = '-'; this.rssiLTE = '-'; this.sinrLTE = '-';
      this.rsrpLTEPercentage = 0; this.rsrqLTEPercentage = 0;
      this.rssiLTEPercentage = 0; this.sinrLTEPercentage = 0;
    }

    if (nr.length > 0) {
      const p = nr[0];
      const rsrp = rnd(p.rsrp), rsrq = rnd(p.rsrq);
      this.rsrpNR = rsrp !== null ? String(rsrp) : '-';
      this.rsrqNR = rsrq !== null ? String(rsrq) : '-';
      this.rssiNR = '-';
      this.sinrNR = '-';
      this.rsrpNRPercentage = this.calculateRSRPPercentage(rsrp ?? NaN);
      this.rsrqNRPercentage = this.calculateRSRQPercentage(rsrq ?? NaN);
      this.rssiNRPercentage = 0;
      this.sinrNRPercentage = 0;
    } else {
      this.rsrpNR = '-'; this.rsrqNR = '-'; this.rssiNR = '-'; this.sinrNR = '-';
      this.rsrpNRPercentage = 0; this.rsrqNRPercentage = 0;
      this.rssiNRPercentage = 0; this.sinrNRPercentage = 0;
    }

    // Overall signal quality
    const lteSig = lte.length > 0
      ? this.calculateSignalPercentage(this.sinrLTEPercentage, this.rsrpLTEPercentage, this.rsrqLTEPercentage)
      : null;
    const nrSig = nr.length > 0
      ? this.calculateSignalPercentage(this.sinrNRPercentage, this.rsrpNRPercentage, this.rsrqNRPercentage)
      : null;
    const all = [lteSig, nrSig].filter(s => s !== null);
    if (all.length > 0) {
      this.signalPercentage = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
      this.signalAssessment = this.signalQuality(this.signalPercentage);
    } else {
      this.signalPercentage = 0;
      this.signalAssessment = 'No Signal';
    }

    // Bands
    const lteBands = lte.map(c => c.band ? String(c.band) : null).filter(Boolean);
    const nrBands  = nr.map(c  => c.band ? `n${c.band}`  : null).filter(Boolean);
    const allBands = [...lteBands, ...nrBands];
    this.bands = allBands.length > 0 ? allBands.join(', ') : 'No Bands';

    // Bandwidth
    const lteBws = lte.filter(c => c.bandwidth_mhz).map(c => `${c.bandwidth_mhz} MHz`);
    const nrBws  = nr.filter(c  => c.bandwidth_mhz).map(c => `${c.bandwidth_mhz} MHz`);
    const allBws = [...lteBws, ...nrBws];
    this.bandwidth = allBws.length > 0 ? allBws.join(', ') : 'Unknown Bandwidth';

    // EARFCNs
    this.earfcns = [...lte.map(c => String(c.earfcn)), ...nr.map(c => String(c.arfcn))].join(', ') || 'Unknown E/ARFCN';

    // PCIs
    const allPcis = [...lte.map(c => String(c.pci)), ...nr.map(c => String(c.pci))];
    this.pccPCI = allPcis[0] || '0';
    this.sccPCI = allPcis.length > 1 ? allPcis.slice(1).join(', ') : '-';

    this.updateSignalHistory();
  },
```

- [ ] **Step 2: Verify the adapter is syntactically valid**

Open browser console on `index.html`. Confirm no JS parse errors at page load.

- [ ] **Step 3: Commit**

```bash
git add www/js/index-process.js
git commit -m "feat: add _applyDiagData() adapter for diagDaemon WS"
```

---

## Task 3: Remove AT^DEBUG? and dead parsing code

**Files:**
- Modify: `www/js/index-process.js` — three targeted deletions

- [ ] **Step 1: Remove `^DEBUG?` from the AT command string**

Find the line (around line 379):
```js
        'AT^TEMP?;^SWITCH_SLOT?;+CGPIAF=1,1,1,1;^DEBUG?;+CPIN?;+CGCONTRDP=1;$QCSIMSTAT?;+COPS?;+CIMI;+ICCID;+CNUM;+CSCS=\"GSM\";+CGMI;+CGMM;^VERSION?;+CGSN';
```

Replace with:
```js
        'AT^TEMP?;^SWITCH_SLOT?;+CGPIAF=1,1,1,1;+CPIN?;+CGCONTRDP=1;$QCSIMSTAT?;+COPS?;+CIMI;+ICCID;+CNUM;+CSCS=\"GSM\";+CGMI;+CGMM;^VERSION?;+CGSN';
```

- [ ] **Step 2: Remove `buildDetailedSignals()` closure and its call**

Inside `fetchAllInfo()`, find and delete:
1. The entire `const buildDetailedSignals = () => { ... };` block — starts with `const buildDetailedSignals = () => {` and ends several hundred lines later with the matching `};` (around line 907).
2. Immediately after, find and delete these three lines:
```js
          this.detailedSignals = buildDetailedSignals();
          this.networkAnalysis = this.buildNetworkAnalysis(this.detailedSignals);
          this.updateSignalHistory();
```

- [ ] **Step 3: Remove AT-derived bands/bandwidth/earfcns/PCI extraction**

Find the comment `// --- Bands ---` (around line 1042) and delete from there through the end of the PCI block. The exact range is the block starting with:
```js
          // --- Bands ---
          // Get all the values with LTE BAND n ...
          const bands = lines.filter((line) =>
```
...all the way through and including:
```js
          } else {
            this.pccPCI = "0";
            this.sccPCI = "-";
          }
```
(which ends around line 1152).

Stop before `// --- IPv4 and IPv6 ---` — that block stays.

- [ ] **Step 4: Remove AT-derived signal metric blocks**

Find the comment `// Signal Informations` (around line 1169). Delete from there through and including the closing `}` of the entire if/else-if/else chain, which ends with:
```js
          } else {
            this.signalAssessment = "No Signal";
          }
```
(around line 1638).

Stop before `// Parse SIM info: IMSI, ICCID, Phone Number, Device Info` — that block stays.

- [ ] **Step 5: Verify page loads without errors**

Open browser console on `index.html`. Confirm:
- No JS syntax errors
- No `buildDetailedSignals is not defined` errors
- AT polling still fires (check Network tab for CGI requests)
- `detailedSignals` starts empty and gets populated once the diagDaemon WS connects (or stays `[]` in dev environment)

- [ ] **Step 6: Commit**

```bash
git add www/js/index-process.js
git commit -m "feat: remove AT^DEBUG? and all dead AT-parsing signal code"
```

---

## Task 4: Update Advanced Signal Modal in index.html

**Files:**
- Modify: `www/index.html` — modal additions for new diagDaemon fields

- [ ] **Step 1: Add badge row for new fields (modulation, MCS, DL, antennas, beams, neighbors)**

In the modal's per-entry template, find the bandwidth/RX diversity row block:
```html
                    <div class="row small text-muted mt-2">
                      <div class="col-md-6">
                        <p class="mb-1" x-text="'Bandwidth: ' + entry.bandwidthDisplay"></p>
                      </div>
                      <div class="col-md-6 text-md-end" x-show="entry.rxDiversityDisplay">
                        <p class="mb-1" x-text="'RX Diversity: ' + entry.rxDiversityDisplay"></p>
                      </div>
                    </div>
```

Add this block immediately after it (before `<div class="mt-3">`):

```html
                    <!-- diagDaemon extra fields -->
                    <div class="d-flex flex-wrap gap-2 mt-2">
                      <template x-if="entry.modulation">
                        <span class="badge bg-warning bg-opacity-10 text-warning-emphasis border border-warning-subtle"
                              style="font-size:0.72rem"
                              x-text="entry.modulation + (entry.mcs !== null ? '  MCS ' + entry.mcs : '')"></span>
                      </template>
                      <template x-if="entry.txAntennas">
                        <span class="badge bg-secondary bg-opacity-10 text-secondary-emphasis border border-secondary-subtle"
                              style="font-size:0.72rem"
                              x-text="entry.txAntennas + 'T'"></span>
                      </template>
                      <template x-if="entry.dlMbps">
                        <span class="badge bg-success bg-opacity-10 text-success-emphasis border border-success-subtle"
                              style="font-size:0.72rem"
                              x-text="'DL ' + entry.dlMbps.toFixed(1) + ' Mbps'"></span>
                      </template>
                      <template x-if="entry.ssb !== null">
                        <span class="badge bg-info bg-opacity-10 text-info-emphasis border border-info-subtle"
                              style="font-size:0.72rem"
                              x-text="'SSB ' + entry.ssb"></span>
                      </template>
                      <template x-if="entry.numBeams">
                        <span class="badge bg-warning bg-opacity-10 text-warning-emphasis border border-warning-subtle"
                              style="font-size:0.72rem"
                              x-text="entry.numBeams + (entry.numBeams > 1 ? ' beams' : ' beam')"></span>
                      </template>
                      <template x-if="entry.neighborCells">
                        <span class="badge bg-dark bg-opacity-10 text-dark-emphasis border border-dark-subtle"
                              style="font-size:0.72rem"
                              x-text="'+' + entry.neighborCells + ' neighbors'"></span>
                      </template>
                    </div>
```

- [ ] **Step 2: Add per-chain SINR rows after the existing RSRP antenna block**

Find the closing `</template>` of the per-antenna RSRP block:
```html
                          <!-- Show antennas right after RSRP metric -->
                          <template x-if="metric.key === 'rsrp' && entry.antennas && entry.antennas.length > 0">
                            <template x-for="(antenna, antennaIndex) in entry.antennas" ...>
                              ...
                            </template>
                          </template>
```

Add this block immediately after that closing `</template>`:

```html
                          <!-- Per-chain SINR after SINR metric (LTE only) -->
                          <template x-if="metric.key === 'sinr' && entry.sinrChains && entry.sinrChains.length > 0">
                            <template x-for="(chain, chainIdx) in entry.sinrChains" :key="'sinr-chain-'+chainIdx">
                              <div class="mb-2 d-flex align-items-center gap-2">
                                <span class="fw-semibold" style="min-width: 80px; text-align: left;"
                                      x-html="'SINR<sub>(ANT' + chain.physicalAntenna + ')</sub>'"></span>
                                <template x-if="chain.percentage > 0">
                                  <div class="progress flex-grow-1" style="height: 24px"
                                       role="progressbar" aria-valuemin="0" aria-valuemax="100"
                                       :aria-valuenow="chain.percentage">
                                    <div class="progress-bar"
                                         :style="'width: ' + chain.percentage + '%; background: ' + (chain.color || '#6c757d') + ';'">
                                      <span x-text="chain.display + ' / ' + chain.percentage + '%'"></span>
                                    </div>
                                  </div>
                                </template>
                                <template x-if="chain.percentage === 0">
                                  <span class="fst-italic text-muted flex-grow-1">Value not available</span>
                                </template>
                              </div>
                            </template>
                          </template>
```

- [ ] **Step 3: Verify modal renders new fields**

Open `index.html` in browser. Open the Advanced Signal Details modal. Confirm:
- New badge row appears below Bandwidth/RX Diversity (may be empty if no WS data yet)
- No JS errors in console
- RSRP per-chain rows still render as before

On device with diagDaemon running, also verify:
- Modulation/MCS badge shows for LTE cells
- SSB/beams/neighbors badges show for NR cells
- SINR per-chain rows appear under the SINR progress bar

- [ ] **Step 4: Commit**

```bash
git add www/index.html
git commit -m "feat: add diagDaemon extra fields to Advanced Signal Modal"
```

---

## Task 5: End-to-end verification and final commit

- [ ] **Step 1: On-device smoke test (connect to device)**

With diagDaemon running, open the main page:
- Main signal bars update from WS (not delayed by AT poll cycle)
- `bands` and `bandwidth` fields on main page show correct values
- EARFCNs / PCIs update correctly

Open Advanced Signal Details modal:
- All LTE cells appear (primary + CA cells if present)
- NR cell appears if 5G connected
- RSRP per-chain rows render with correct ANT0–ANT3 labels
- SINR per-chain rows render for LTE
- New badges show: modulation, MCS, DL Mbps, TX antennas (LTE); SSB, beams, neighbors (NR)
- Signal history chart still trends correctly

AT polling still delivers (check Network tab):
- Temperature still updates
- SIM status still shows
- Operator/APN still shows
- Network mode badges still update

- [ ] **Step 2: Confirm TAC/Cell ID show `--` gracefully**

Verify that TAC and Cell ID fields in index.html (if they exist) show "--" or "N/A" rather than crashing. If any field that references `tacLTE`, `tacNR`, `cellID`, `eNBIDLTE`, or `decimalCellId` throws an error, those references will need to be guarded with `|| '--'` in the template.

- [ ] **Step 3: Final branch commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix: guard any remaining AT-derived fields that lost their source"
```
