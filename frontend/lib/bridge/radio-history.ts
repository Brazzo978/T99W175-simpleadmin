// =============================================================================
// Radio history — one sample per second of the live radio, for trends and
// distributions on the Signal Details page and the per-chain statistics and
// recordings of the antenna pages
// =============================================================================
// The bridge store takes a sample at most once a second while the sockets
// are open (a page subscribed, tab visible) and keeps the last ten minutes.
// Only the PCell and the first NR cell are sampled: they carry the link the
// distributions describe. DIAG-only values are null when the radio comes
// from QMI, and null whenever the bridge omits the key (no fresh value).
// =============================================================================

import type {
  ChainValues,
  DiagLteCell,
  DiagNrCell,
  DiagSnapshot,
} from "@/types/bridge";
import type { RadioSource } from "./radio";

/** Sampling period and depth: ten minutes at 1 s. */
export const RADIO_HISTORY_INTERVAL_MS = 1000;
export const RADIO_HISTORY_MAX = 600;

export interface CellSample {
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  cqi: number | null;
  ri: number | null;
  /** DL MCS: LTE `mcs`, NR `dl_mcs` (an average) */
  mcs: number | null;
  /** NR UL MCS (average) */
  ul_mcs: number | null;
  /** NR DL layers (average) */
  layers: number | null;
  tx_power: number | null;
  bler: number | null;
  dl_mbps: number | null;
  ul_mbps: number | null;
  /** Per receive chain (Main, Diversity, MIMO 3, MIMO 4); null when no
   *  chain reports, to keep ten minutes of samples small */
  rsrp_rx: ChainValues | null;
  /** LTE per-chain SINR (DIAG only), NR per-chain SNR (when logged) */
  sinr_rx: ChainValues | null;
}

export interface RadioSample {
  /** Date.now() of the sample */
  ts: number;
  source: RadioSource;
  /** Aggregate throughput over every carrier (Mbps), DIAG only */
  dl_mbps: number | null;
  ul_mbps: number | null;
  lte: CellSample | null;
  nr: CellSample | null;
}

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function chains(values: ChainValues | undefined): ChainValues | null {
  if (!values) return null;
  const out = [0, 1, 2, 3].map((i) => num(values[i]));
  return out.some((v) => v !== null) ? out : null;
}

function lteSample(c: DiagLteCell, diag: boolean): CellSample {
  return {
    rsrp: num(c.rsrp),
    rsrq: num(c.rsrq),
    sinr: num(c.sinr),
    cqi: diag ? num(c.cqi) : null,
    ri: diag ? num(c.ri) : null,
    mcs: diag ? num(c.mcs) : null,
    ul_mcs: null,
    layers: null,
    tx_power: diag ? num(c.tx_power_dbm) : null,
    bler: diag ? num(c.dl_bler) : null,
    // The bridge omits an idle carrier's rate: zero, not unknown.
    dl_mbps: diag ? (num(c.dl_mbps) ?? 0) : null,
    ul_mbps: diag ? (num(c.ul_mbps) ?? 0) : null,
    rsrp_rx: chains(c.rsrp_rx),
    sinr_rx: chains(c.sinr_rx),
  };
}

function nrSample(c: DiagNrCell, diag: boolean): CellSample {
  return {
    rsrp: num(c.rsrp),
    rsrq: num(c.rsrq),
    sinr: num(c.sinr),
    cqi: diag ? num(c.cqi) : null,
    ri: diag ? num(c.ri) : null,
    mcs: diag ? num(c.dl_mcs) : null,
    ul_mcs: diag ? num(c.ul_mcs) : null,
    layers: diag ? num(c.dl_layers) : null,
    tx_power: diag ? num(c.tx_power_dbm) : null,
    bler: diag ? num(c.dl_bler) : null,
    dl_mbps: diag ? (num(c.dl_mbps) ?? 0) : null,
    ul_mbps: diag ? (num(c.ul_mbps) ?? 0) : null,
    rsrp_rx: chains(c.rsrp_rx),
    sinr_rx: chains(c.snr_rx),
  };
}

/** Aggregate DL/UL: the bridge summary, else the sum over the carriers. */
export function aggregateRates(snapshot: DiagSnapshot): {
  dl: number;
  ul: number;
} {
  if (snapshot.summary) {
    return {
      dl: snapshot.summary.total_dl_mbps,
      ul: snapshot.summary.total_ul_mbps,
    };
  }
  const cells = [...snapshot.lte, ...snapshot.nr];
  return {
    dl: cells.reduce((s, c) => s + (c.dl_mbps ?? 0), 0),
    ul: cells.reduce((s, c) => s + (c.ul_mbps ?? 0), 0),
  };
}

export function takeRadioSample(
  snapshot: DiagSnapshot,
  source: RadioSource,
  now: number,
): RadioSample {
  const diag = source === "diag";
  const pcell = snapshot.lte.find((c) => !c.is_scell);
  const nr = snapshot.nr[0];
  const rates = diag ? aggregateRates(snapshot) : null;
  return {
    ts: now,
    source,
    dl_mbps: rates ? rates.dl : null,
    ul_mbps: rates ? rates.ul : null,
    lte: pcell ? lteSample(pcell, diag) : null,
    nr: nr ? nrSample(nr, diag) : null,
  };
}
