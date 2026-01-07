# Network Analysis Advisor 

This document describes the logic implemented for the network analysis advisor shown in **Advanced Signal Details**.

## Goal

The advisor inspects per-band LTE (up to 5CA) and NR (up to 1CA) metrics and returns:

- **Primary diagnosis** (title + short message)
- **Why** (triggering metrics)
- **What to try** (actionable suggestions)
- **Secondary notes** (optional)

If there are no clear signals or the conditions are too weak, it avoids noisy warnings.

## Inputs per carrier/band

For each observed carrier (LTE PCC + LTE SCCs; NR if present):

- `rat`: LTE | NR
- `band`: band number (e.g., 28, 20, 8, 3, 1, 7, 38, 78)
- `rsrp_dBm`
- `rsrq_dB`
- `sinr_dB`
- `rssi_dBm` (optional)
- `is_aggregated` (optional, if known)
- `timestamp` (optional)

## Band tiering

`tier(band)` is derived from the downlink center frequency:

- **LOW**: < 1000 MHz
- **MID**: 1000–2299 MHz
- **HIGH**: ≥ 2300 MHz

The implementation uses a band-to-frequency table (DL ranges) and computes the band center in MHz. Example mappings currently included:

- **LTE**: 1 (2110–2170), 3 (1805–1880), 7 (2620–2690), 8 (925–960), 20 (791–821), 28 (758–803), 32 (1452–1496), 38 (2570–2620)
- **NR**: n28 (758–803), n38 (2570–2620), n78 (3300–3800)

**Note:** MID is treated like LOW for distance/attenuation checks.

## Per-carrier score

Metric percentages (from `lte_signal_score_formulas_rm502q.txt`) are used:

- `sinr_pct`, `rsrp_pct`, `rsrq_pct`, `rssi_pct` (optional)

**CarrierScore (0..100):**

```
CarrierScore = 0.45*sinr_pct + 0.35*rsrp_pct + 0.20*rsrq_pct
```

## Robust aggregation

To avoid a single outlier dominating the result:

- **Median** per LTE/NR:
  - `LTE_rsrp_med`, `LTE_rsrq_med`, `LTE_sinr_med`, `LTE_score_med`
  - `NR_rsrp_med`, `NR_rsrq_med`, `NR_sinr_med`, `NR_score_med`
- **Tier split (LTE only):**
  - `LTE_low_rsrp_med`: median RSRP for LTE carriers in LOW or MID
  - `LTE_high_rsrp_med`: median RSRP for LTE carriers in HIGH
- **Helpers:**
  - `LTE_best_rsrp`: max LTE RSRP (least negative)
  - `LTE_worst_sinr`: min LTE SINR
  - `LTE_ca_count`: number of LTE carriers observed
  - `NR_count`: number of NR carriers (0 or 1)

## Distance/attenuation indicator

If LTE_high is present:

```
delta_low_high = LTE_low_rsrp_med - LTE_high_rsrp_med
```

If LTE_high is absent, `LTE_high_rsrp_med` is treated as very low (e.g., -140) and `LTE_high_count == 0` is tracked explicitly.

**Thresholds:**

- `delta_low_high >= 12 dB` → **noticeable**
- `delta_low_high >= 18 dB` → **strong**

## Practical thresholds

**RSRP**
- good ≥ -90
- ok   -90..-100
- weak -100..-110
- poor < -110

**SINR**
- good ≥ 10
- ok   5..10
- weak 0..5
- poor < 0

**RSRQ**
- good ≥ -10
- ok   -10..-12
- weak -12..-15
- poor < -15

## Output

Object with:

- `primary_title`
- `primary_message`
- `why` (2–4 bullets)
- `suggestions` (1–3 bullets)
- `secondary_notes` (optional)

If no rule meets sufficient confidence, output is **“No issues detected”**.

## Evaluation order (priority)

The advisor evaluates rules in this order and selects the first strong match as primary. Weaker matches become **secondary notes**.

### Rule 0 — No issues detected

**Trigger:**

- `LTE_score_med >= 80` (or `NR_score_med >= 80` when NR is present)
- No congestion rule triggers

**Output:**
- “No issues detected”

### Rule A — Likely far from site / strong attenuation (low strong, high weak/absent)

**Trigger:**

- `LTE_low_rsrp_med >= -95`
- `LTE_high_count == 0` **or** `LTE_high_rsrp_med <= -108`
- `delta_low_high >= 12` (**strong** if ≥ 18)

**Output:**
- “Likely far from the antenna / strong attenuation”

**Why includes:**
- `LTE_low_rsrp_med`, `LTE_high_rsrp_med`, `delta_low_high`, `LTE_high_count`

**Suggestions:**
- move the router toward a window / higher position
- small rotations/repositioning (especially with directional antennas)

### Rule B — Likely congestion/interference (strong signal but low quality)

**LTE congested:**
- `LTE_rsrp_med >= -95`
- **and** (`LTE_sinr_med <= 3` **or** `LTE_rsrq_med <= -12`)

**NR congested:**
- `NR_rsrp_med >= -95`
- **and** (`NR_sinr_med <= 3` **or** `NR_rsrq_med <= -12`)

**Output:**
- “Likely 4G cell congestion/interference” (LTE only)
- “Likely 5G cell congestion/interference” (NR only)
- “Likely 4G/5G congestion/interference” (both)

**Suggestions:**
- try a different band/cell (if the UI supports locking)
- test at different times of day
- small re-aim adjustments with directional antennas

### Rule C — 4G very good (multi-CA) but 5G poor/absent

**Trigger:**

- `LTE_ca_count >= 3`
- `LTE_score_med >= 75`
- `NR_count == 0` **or** `NR_rsrp_med <= -110` **or** `NR_score_med <= 40`

**Output:**
- “5G reception seems suboptimal vs 4G”

**Suggestions:**
- reposition/rotate toward the likely 5G direction (n78 is more sensitive)
- verify 5G availability and test near a window/outdoors

### Rule D — Uniformly low coverage

**Trigger:**

- `LTE_rsrp_med <= -105`
- `NR_count == 0` **or** `NR_rsrp_med <= -105`
- `delta_low_high < 12` (or `LTE_high_count == 0` and low-band is also weak)

**Output:**
- “Overall coverage is weak”

**Suggestions:**
- improve placement (window/high spot), external antenna, avoid thick walls

### Rule E — Carrier aggregation limited by weak signal

**Trigger:**

- `LTE_ca_count <= 2`
- `LTE_best_rsrp <= -100` (or `LTE_rsrp_med <= -100`)

**Output:**
- “Signal likely too weak for higher CA”

**Suggestions:**
- improve RSRP first (placement/antenna) to enable more stable CA

## Confidence (optional)

Simple confidence score 0..100:

- base: 50
- +10 if `LTE_ca_count >= 3`
- +10 if `LTE_high_count > 0`
- +10 for a “strong” condition (delta ≥ 18, SINR < 0, RSRQ < -15, etc.)

Usage:
- < 60 → no primary, optionally secondary notes
- optional UI badge
