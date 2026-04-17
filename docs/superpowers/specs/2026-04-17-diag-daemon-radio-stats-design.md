# Design: diagDaemon WebSocket Radio Stats

**Date:** 2026-04-17
**Branch:** `diag-daemon` (from `main`)

## Overview

Replace AT^DEBUG?-based signal polling with a persistent WebSocket connection to the diagDaemon binary (`T99W175-diag-json-bridge/diag_bridge`). All radio signal data — both the main index-page signal bars and the Advanced Signal Details modal — come exclusively from the diagDaemon WS. The existing AT polling loop continues unchanged for all non-signal data.

---

## Architecture & Data Flow

Two independent data paths in the Alpine component (`index-process.js`):

### 1. AT Polling (unchanged cadence)
Fires every `refreshRate` seconds. Fetches: temperature, SIM status, APN, operator, network mode. `^DEBUG?` is **removed** from the command string. Does **not** set any signal metrics.

### 2. diagDaemon WebSocket (continuous push, port 9001)
Connects at `init()`. Reconnects automatically on drop (3 s delay, same pattern as `radio-monitor.js`). On each message, calls `_applyDiagData(data)`.

### Adapter: `_applyDiagData(data)`

Reads `data.lte[]` and `data.nr[]` (diagDaemon JSON format) and:

- Sets main signal state: `rsrpLTE/rsrqLTE/rssiLTE/sinrLTE` from `lte[0]`; `rsrpNR/rsrqNR` from `nr[0]` (NR has no SINR/RSSI in diagDaemon output → `"-"`)
- Recalculates all signal percentages and `signalPercentage/signalAssessment`
- Sets `bands` (e.g. `"3, 1, n78"`) and `bandwidth` (e.g. `"20 MHz, 100 MHz"`) from all cells
- Builds `detailedSignals[]` (see schema below)
- Calls `updateSignalHistory()` — chart continues working, now updating per WS push instead of per poll

---

## diagDaemon JSON Format (reference)

```
LTE cell: { earfcn, pci, band, scell_idx, is_scell, rsrp, rsrq, rssi, sinr,
            rx_diversity, rsrp_rx[4], sinr_rx[4],
            bandwidth_mhz?, bandwidth_prb?, tx_antennas?,
            dl_mbps?, modulation?, mcs? }

NR cell:  { arfcn, pci, rsrp, rsrq, ssb, rx_diversity, rsrp_rx[4],
            bandwidth_mhz?, band?, num_beams?, neighbor_cells?, modulation? }

Summary:  { cells, lte, nr, total_bandwidth_mhz, total_dl_mbps }
```

---

## detailedSignals[] Schema Extensions

Existing fields (`id, title, technology, role, band, bandDisplay, bandwidthDisplay, channelDisplay, pciDisplay, rxDiversityDisplay, metrics[], antennas[]`) are preserved.

**New fields added per entry:**

| Field | LTE source | NR source |
|-------|-----------|-----------|
| `sinrChains[]` | `sinr_rx[0..3]` | — |
| `dlMbps` | `dl_mbps` | — |
| `modulation` | `modulation` | `modulation` |
| `mcs` | `mcs` | — |
| `txAntennas` | `tx_antennas` | — |
| `ssb` | — | `ssb` |
| `numBeams` | — | `num_beams` |
| `neighborCells` | — | `neighbor_cells` |

**Antenna chains:** diagDaemon `rsrp_rx[]` is already physical-index order (ANT0–ANT3). No logical→physical remapping needed. Existing `RSRP(ANT0)` etc. labels work as-is.

---

## What's Lost

- **TAC** (LTE/NR) and **Cell ID / eNB ID**: diagDaemon does not emit these. They will show `"--"`. AT polling still runs but without `^DEBUG?` these fields are never set.
- `decimalCellId` used in network analysis becomes `null`.

---

## File Changes

### `www/js/index-process.js`

1. **Remove** `^DEBUG?` from AT command string (~line 379)
2. **Remove** `buildDetailedSignals()` function body and its call (~line 909)
3. **Remove** `hasLTEStats`/`hasNRStats` signal-parsing blocks that set `rsrpLTE` etc. from AT text (~lines 1171–1474)
4. **Remove** `bands`/`bandwidth`/`earfcns` extraction from AT text (~lines 1042–1100)
5. **Add** `diagWsConnected: false` to component state
6. **Add** `connectDiagWs()` — WS connect/reconnect, port 9001
7. **Add** `_applyDiagData(data)` — adapter (see above)
8. **Call** `connectDiagWs()` in `init()`

### `www/index.html` (Advanced Signal Modal only)

1. Add badge row per cell entry: modulation/MCS + TX antennas + DL Mbps (LTE); modulation + beams + neighbors (NR)
2. Add per-chain SINR rows (`sinrChains[]`) after the RSRP per-chain rows (LTE)
3. Add SSB info to NR cell header

---

## Out of Scope

- `radio-monitor.html` / `radio-monitor.js` — unchanged (already working)
- Any changes to the diagDaemon binary or service configuration
- Shared WS module extraction (deferred to future if a third consumer appears)
