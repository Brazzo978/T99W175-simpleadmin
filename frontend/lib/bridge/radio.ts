// =============================================================================
// Radio source selection — DIAG first, QMI as completion and fallback
// =============================================================================
// diag_bridge is the radio source while it is fresh. system_bridge's QMI
// radio fills what DIAG lacks (NR SINR, PCell identity and bandwidth until
// RRC reports them, SCells configured before diag_bridge started) and takes
// over entirely when diag_bridge is down.
// =============================================================================

import type {
  ChainValues,
  DiagLteCell,
  DiagNrCell,
  DiagSnapshot,
  DiagSummary,
  SystemSnapshot,
} from "@/types/bridge";

export type RadioSource = "diag" | "qmi" | "none";

/** Radio falls back to QMI past this age of the last diag_bridge message. */
export const DIAG_STALE_MS = 6000;
/** system_bridge data older than this is ignored. */
export const SYSTEM_STALE_MS = 10_000;
/**
 * QMI radio older than this is not shown as live. system_bridge polls it
 * every 2 s and reports the age in radio.age_s (-1 before the first poll),
 * independently of the envelope, which keeps coming with sys/conn data.
 */
const QMI_RADIO_MAX_AGE_S = 10;

const NO_CHAINS: ChainValues = [null, null, null, null];

interface RadioInputs {
  diag: DiagSnapshot | null;
  diagAt: number;
  system: SystemSnapshot | null;
  systemAt: number;
}

export function isSystemFresh(inputs: RadioInputs, now: number): boolean {
  return Boolean(inputs.system) && now - inputs.systemAt < SYSTEM_STALE_MS;
}

export function pickRadio(
  inputs: RadioInputs,
  now: number,
): { snapshot: DiagSnapshot | null; source: RadioSource } {
  const system = isSystemFresh(inputs, now) ? inputs.system : null;
  const diag = inputs.diag;
  const diagFresh =
    diag !== null &&
    now - inputs.diagAt < DIAG_STALE_MS &&
    (diag.lte?.length ?? 0) + (diag.nr?.length ?? 0) > 0;

  const radio = system?.radio;
  const radioFresh =
    radio !== undefined && radio.age_s >= 0 && radio.age_s < QMI_RADIO_MAX_AGE_S;

  if (diagFresh) {
    return {
      snapshot: withQmiExtras(diag, radioFresh ? system : null),
      source: "diag",
    };
  }
  if (system && radio && radioFresh && (radio.lte || radio.nr)) {
    return { snapshot: qmiAsDiag(system), source: "qmi" };
  }
  return { snapshot: null, source: "none" };
}

function blankScell(sc: {
  earfcn: number;
  pci: number;
  band: number;
  scell_idx: number;
  bandwidth_mhz?: number;
}): DiagLteCell {
  return {
    earfcn: sc.earfcn,
    pci: sc.pci,
    band: sc.band,
    scell_idx: sc.scell_idx,
    is_scell: 1,
    rsrp: null,
    rsrq: null,
    rssi: null,
    sinr: null,
    measured: false,
    rx_diversity: 0,
    rsrp_rx: NO_CHAINS,
    sinr_rx: NO_CHAINS,
    bandwidth_mhz: sc.bandwidth_mhz,
  };
}

/** diag_bridge snapshot completed with what DIAG does not carry. */
function withQmiExtras(
  diag: DiagSnapshot,
  system: SystemSnapshot | null,
): DiagSnapshot {
  const lte = (diag.lte ?? []).map((cell) => ({ ...cell }));
  const nr = (diag.nr ?? []).map((cell) => ({ ...cell }));
  const snap: DiagSnapshot = {
    lte,
    nr,
    summary: diag.summary,
    lte_neighbors: diag.lte_neighbors,
    diag_logs: diag.diag_logs,
    rrc: diag.rrc,
    events: diag.events,
  };
  const radio = system?.radio;
  if (!radio) return snap;

  // Only onto the same cell: around an NR handover QMI may still report
  // the previous one for a few seconds.
  const nr0 = nr[0];
  if (
    nr0 &&
    radio.nr &&
    typeof radio.nr.sinr === "number" &&
    radio.nr.pci === nr0.pci
  ) {
    nr0.sinr = radio.nr.sinr;
  }

  // QMI and DIAG come from separate sockets and can straddle a handover:
  // complete the DIAG PCell only with QMI data about the same cell.
  const pcell = lte.find((cell) => !cell.is_scell);
  const samePcell =
    pcell !== undefined &&
    radio.lte !== undefined &&
    radio.lte.earfcn === pcell.earfcn &&
    radio.lte.pci === pcell.pci;
  if (pcell && radio.lte && samePcell) {
    if (pcell.cell_id == null && radio.lte.cell_id) {
      pcell.cell_id = radio.lte.cell_id;
      pcell.tac = radio.lte.tac;
      pcell.mcc = system?.modem.mcc;
      pcell.mnc = system?.modem.mnc;
    }
    if (pcell.bandwidth_estimated && radio.lte.bandwidth_mhz) {
      pcell.bandwidth_mhz = radio.lte.bandwidth_mhz;
      delete pcell.bandwidth_estimated;
    }
  }

  // Active SCells diag_bridge has not learnt from RRC yet (it only sees
  // them in reconfigurations, so not right after it starts). Only those of
  // the same PCell: after a handover QMI may still list the old cell's.
  (samePcell ? radio.lte?.scells ?? [] : []).forEach((sc) => {
    if (lte.some((cell) => cell.earfcn === sc.earfcn && cell.pci === sc.pci)) {
      return;
    }
    lte.push(blankScell(sc));
  });
  // Cell counts and bandwidth again, with the SCells and bandwidths QMI
  // added; the rates stay DIAG's. No summary from the bridge, none here.
  if (diag.summary) snap.summary = summarize(lte, nr, diag.summary);
  return snap;
}

/** Totals over the cells; DL/UL rates from `rates` (0 without). */
function summarize(
  lte: DiagLteCell[],
  nr: DiagNrCell[],
  rates?: DiagSummary,
): DiagSummary {
  return {
    cells: lte.length + nr.length,
    lte: lte.length,
    nr: nr.length,
    total_bandwidth_mhz: [...lte, ...nr].reduce(
      (sum, cell) => sum + (cell.bandwidth_mhz ?? 0),
      0,
    ),
    total_dl_mbps: rates?.total_dl_mbps ?? 0,
    total_ul_mbps: rates?.total_ul_mbps ?? 0,
  };
}

function chainMask(chains: ChainValues | undefined): number {
  return (chains ?? []).reduce<number>(
    (mask, value, index) => (value != null ? mask | (1 << index) : mask),
    0,
  );
}

/** system_bridge QMI radio in the diag_bridge snapshot shape. */
function qmiAsDiag(system: SystemSnapshot): DiagSnapshot {
  const radio = system.radio ?? { age_s: 0, endc: false };
  const lte: DiagLteCell[] = [];
  const nr: DiagNrCell[] = [];
  if (radio.lte) {
    const l = radio.lte;
    lte.push({
      earfcn: l.earfcn,
      pci: l.pci,
      band: l.band,
      scell_idx: 0,
      is_scell: 0,
      rsrp: l.rsrp,
      rsrq: l.rsrq,
      rssi: l.rssi,
      sinr: l.sinr,
      rx_diversity: chainMask(l.rsrp_rx),
      rsrp_rx: l.rsrp_rx ?? NO_CHAINS,
      sinr_rx: NO_CHAINS,
      bandwidth_mhz: l.bandwidth_mhz,
      cell_id: l.cell_id,
      tac: l.tac,
      mcc: system.modem.mcc,
      mnc: system.modem.mnc,
    });
    (l.scells ?? []).forEach((sc) => lte.push(blankScell(sc)));
  }
  if (radio.nr) {
    const n = radio.nr;
    nr.push({
      arfcn: n.arfcn,
      pci: n.pci,
      band: n.band,
      rsrp: n.rsrp,
      rsrq: n.rsrq,
      sinr: n.sinr,
      rx_diversity: chainMask(n.rsrp_rx),
      rsrp_rx: n.rsrp_rx ?? NO_CHAINS,
    });
  }
  return { lte, nr, summary: summarize(lte, nr) };
}
