// =============================================================================
// bridge.ts — messages pushed by the two modem-side WebSocket bridges
// =============================================================================
// diag_bridge (port 9001) streams radio snapshots decoded from the Qualcomm
// DIAG interface; system_bridge (port 9002) streams QMI identity/radio data,
// /proc statistics and connectivity checks. Both only send while a client is
// connected. Every field the bridge cannot fill is null or absent.
// =============================================================================

/** Four receive chains, null where the chain is not measured. */
export type ChainValues = (number | null)[];

export interface DiagLteCell {
  earfcn: number;
  pci: number;
  band: number;
  scell_idx: number;
  /** 1 for a secondary cell, 0 for the PCell */
  is_scell: number;
  rsrp: number | null;
  rsrq: number | null;
  rssi: number | null;
  sinr: number | null;
  /** false while an SCell is configured but has no measurement yet */
  measured?: boolean;
  /** Bit mask of the receive chains in use */
  rx_diversity: number;
  rsrp_rx: ChainValues;
  sinr_rx: ChainValues;
  bandwidth_mhz?: number;
  bandwidth_prb?: number;
  /** Bandwidth is the band default, not learnt from the network */
  bandwidth_estimated?: boolean;
  tx_antennas?: number;
  modulation?: string;
  mcs?: number;
  dl_mbps?: number;
  dl_bler?: number;
  ul_mbps?: number;
  ul_rb?: number;
  ul_modulation?: string;
  cell_id?: number | null;
  tac?: number | null;
  mcc?: number;
  mnc?: string;
}

export interface DiagNrCell {
  arfcn: number;
  pci: number;
  band?: number;
  rsrp: number | null;
  rsrq: number | null;
  /** From QMI or the last RRC measurement report; DIAG has no steady NR SINR */
  sinr?: number | null;
  ssb?: number;
  rx_diversity: number;
  rsrp_rx: ChainValues;
  bandwidth_mhz?: number;
  ul_bandwidth_mhz?: number;
  bandwidth_estimated?: boolean;
  num_beams?: number;
  neighbor_cells?: number;
  modulation?: string;
  dl_mbps?: number;
  dl_bler?: number;
  ul_mbps?: number;
  ul_mcs?: number;
  ul_prb?: number;
  phr_db?: number;
  pcmax_dbm?: number;
  cell_id?: number | null;
  tac?: number | null;
  mcc?: number;
  mnc?: string;
}

export interface DiagSummary {
  cells: number;
  lte: number;
  nr: number;
  total_bandwidth_mhz: number;
  total_dl_mbps: number;
  total_ul_mbps: number;
}

/** One diag_bridge radio snapshot (also the shape QMI radio is converted to). */
export interface DiagSnapshot {
  lte: DiagLteCell[];
  nr: DiagNrCell[];
  summary?: DiagSummary;
}

export interface QmiScell {
  scell_idx: number;
  earfcn: number;
  pci: number;
  band: number;
  bandwidth_mhz?: number;
}

export interface QmiRadio {
  age_s: number;
  endc: boolean;
  lte?: {
    earfcn: number;
    pci: number;
    band: number;
    bandwidth_mhz?: number;
    rsrp: number | null;
    rsrq: number | null;
    rssi: number | null;
    sinr: number | null;
    tx_power_dbm?: number | null;
    cell_id?: number | null;
    tac?: number | null;
    rsrp_rx?: ChainValues;
    scells?: QmiScell[];
  };
  nr?: {
    arfcn: number;
    pci: number;
    band: number;
    rsrp: number | null;
    rsrq: number | null;
    sinr: number | null;
    rsrp_rx?: ChainValues;
  };
}

export type CheckStatus = "ok" | "warning" | "error";

export interface SystemSnapshot {
  sys: {
    uptime_s: number;
    load: number[];
    cpu_pct: number;
    mem_total_kb: number;
    mem_used_kb: number;
    mem_pct: number;
    eth?: { speed: string; duplex: string };
  };
  net: {
    wan_ip?: string;
    dns?: string[];
    apn?: string;
  };
  conn: {
    status: CheckStatus;
    pending: boolean;
    ping?: {
      total: number;
      passed: number;
      avg_ms: number | null;
      results: { host: string; status: CheckStatus; time: number | null }[];
    };
    dns?: {
      total: number;
      passed: number;
      results: { server: string; domain: string; status: CheckStatus }[];
    };
  };
  modem: {
    manufacturer?: string;
    model?: string;
    firmware?: string;
    imei?: string;
    imsi?: string;
    iccid?: string;
    sim?: { state: string; slot: number };
    registered?: boolean;
    operator?: string;
    mcc?: number;
    mnc?: string;
    temperature?: {
      modem?: number | null;
      pa?: number | null;
      xo?: number | null;
      sys1?: number | null;
      sys2?: number | null;
    };
  };
  radio?: QmiRadio;
}
