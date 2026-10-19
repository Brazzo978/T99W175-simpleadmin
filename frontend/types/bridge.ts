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
  /** Wideband CQI 0..15 (codeword 0) of the last PUCCH CSI report */
  cqi?: number;
  /** Rank indicator 1..4: MIMO layers the UE asks for */
  ri?: number;
  /** PUSCH TX power (dBm) of the last PUSCH transmission, kept 5 s: idle
   *  keep-alive grants count, so high values at idle mean a weak signal */
  tx_power_dbm?: number;
  /** Raw timing advance command from the last RACH Msg2, its distance (m)
   *  and its age (s) */
  ta?: number;
  ta_m?: number;
  ta_age_s?: number;
  /** PCell only, from EVENT_LTE_ML1_EPHR_REPORT (kept 15 s): power headroom
   *  (dB, low or negative = at the power limit) and the maximum TX power
   *  currently allowed (dBm) */
  phr_db?: number;
  mtpl_dbm?: number;
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
  /** Age of an RRC-reported sinr (s) */
  sinr_age_s?: number;
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
  /** Average DL MCS of the PDSCH grants in the last log */
  dl_mcs?: number;
  /** Average resource blocks per DL grant */
  dl_rb?: number;
  /** Average MIMO layers per DL grant, 1..4 */
  dl_layers?: number;
  /** Wideband CQI 0..15 of the last type-I CSI report */
  cqi?: number;
  /** Rank indicator 1..4 */
  ri?: number;
  /** FTL SNR (dB), best chain and per chain (not logged by every firmware) */
  snr?: number;
  snr_rx?: ChainValues;
  /** PUSCH TX power (dBm) and DL path loss (dB), when logged */
  tx_power_dbm?: number;
  pathloss_db?: number;
  /** Raw timing advance from RACH Msg2, its distance (m) for the
   *  subcarrier spacing used (kHz; estimated from the band when 0xB825 was
   *  not logged) and its age (s) */
  ta?: number;
  ta_m?: number;
  ta_scs_khz?: number;
  ta_scs_estimated?: boolean;
  ta_age_s?: number;
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

/** LTE neighbour cell from 0xB180, measured in the last 10 s. */
export interface LteNeighbor {
  earfcn: number;
  pci: number;
  band: number;
  rsrp: number;
  rsrq: number;
  rssi: number;
  age_s: number;
}

/** One subscribed DIAG log code: received count since the bridge started
 *  and seconds since the last one (-1: never). */
export interface DiagLogStat {
  code: string;
  n: number;
  age_s: number;
}

/** LTE RRC state from DIAG events, and failure/mobility counters since the
 *  bridge started. lte_state is absent until the first state change. */
export interface RrcInfo {
  lte_state?: string;
  lte_state_age_s?: number;
  counters?: Record<string, number>;
}

/** One DIAG event: fields with AirScreen's names, or {raw: hex}. */
export interface DiagEvent {
  age_s: number;
  id: number;
  name: string;
  f?: Record<string, string | number>;
}

/** What a DIAG event is about, from its name (lib/bridge/events.ts). */
export type RadioEventCategory =
  | "failure"
  | "mobility"
  | "rrc"
  | "rach"
  | "ca"
  | "paging"
  | "other";

/** Radio access technology a DIAG event belongs to. */
export type RadioRat = "LTE" | "5G";

/** One diag_bridge radio snapshot (also the shape QMI radio is converted to). */
export interface DiagSnapshot {
  lte: DiagLteCell[];
  nr: DiagNrCell[];
  summary?: DiagSummary;
  lte_neighbors?: LteNeighbor[];
  diag_logs?: DiagLogStat[];
  rrc?: RrcInfo;
  /** Last 20 events, newest first */
  events?: DiagEvent[];
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
/** One check of the last round; pending: not run yet (or not in that round) */
export type CheckResult = "ok" | "failed" | "pending";

/** system_bridge's HTTP probe of the last full check round. */
export interface HttpProbe {
  url: string;
  /** ok: 204 (or an empty 200); portal: any other answer; failed: none */
  status: "ok" | "portal" | "failed" | "pending";
  /** HTTP status code and time to the answer (ms), when there was one */
  code?: number;
  time?: number;
  /** Why it failed: dns, connect, timeout, malformed, url */
  reason?: string;
  /** Redirect target of a portal */
  location?: string;
}

/**
 * system_bridge's one-time message to a new client, sent before its first
 * snapshot: what it recorded while nobody was connected. Oldest first.
 */
export interface SystemHistory {
  /** conn.seq of the last check round */
  seq: number;
  /** 24 h latency history: one slot per history step, which is the
   *  background check interval (SIMPLEADMIN_BG_CHECK_INTERVAL) */
  latency: {
    /** History step (s) */
    interval_s: number;
    /** Seconds between check rounds while a client is connected (absent
     *  from older bridges, whose step was the round) */
    round_s?: number;
    /** conn.hist_seq of the newest slot */
    seq?: number;
    /** Age of the newest slot, -1 when there is none */
    age_s: number;
    /** Average RTT (ms) of the rounds of each step, null when none had an
     *  answer */
    rtt: (number | null)[];
  };
  signal: {
    interval_s: number;
    /** [age_s, lte_rsrp x4, lte_rsrq, lte_sinr, nr_rsrp x4, nr_rsrq, nr_sinr]
     *  from QMI (per-chain RSRP; RSRQ and SINR of the cell) */
    rows: (number | null)[][];
  };
}

export interface SystemSnapshot {
  sys: {
    uptime_s: number;
    load: number[];
    cpu_pct: number;
    mem_total_kb: number;
    mem_used_kb: number;
    mem_pct: number;
    eth?: { speed: string; duplex: string };
    hostname?: string;
    /** Kernel release (uname -r) */
    kernel?: string;
    /** /data (UBIFS usrfs, where SimpleAdmin keeps its binaries), KiB */
    data_fs?: { total_kb: number; used_kb: number; avail_kb: number } | null;
  };
  net: {
    wan_ip?: string;
    /** Seconds since the data session came up (age of the WWAN address),
     *  null without a data session */
    conn_uptime_s?: number | null;
    dns?: string[];
    apn?: string;
  };
  /** Persistent data counter (bytes since reset_at, kept across reboots) */
  data?: {
    /** Kernel interface the bytes are read from */
    counter: string;
    /** false when the interface could not be read at the last sample */
    ok: boolean;
    rx: number;
    tx: number;
    /** Unix seconds (modem clock): last sample, last reset, last save */
    sampled_at: number;
    reset_at: number;
    saved_at: number;
    /** Counter restarts (reboot, interface re-created) since reset_at */
    resets: number;
  };
  conn: {
    /** pending: no round has finished yet */
    status: CheckStatus | "pending";
    pending: boolean;
    /** Check rounds finished; a new value means a new round (one live
     *  latency sample) */
    seq?: number;
    /** Slots closed in the 24 h latency history; a new value means a new
     *  slot, hist_rtt */
    hist_seq?: number;
    /** History step (s); a change means the bridge restarted the history */
    hist_interval_s?: number;
    /** Newest history slot (ms), null when no round of its step had an
     *  answer or the history is empty */
    hist_rtt?: number | null;
    ping?: {
      total: number;
      passed: number;
      avg_ms: number | null;
      /** time (ms) only when the target answered */
      results: { host: string; status: CheckResult; time?: number }[];
    };
    dns?: {
      total: number;
      passed: number;
      results: { server: string; domain: string; status: CheckResult }[];
    };
    /** Captive portal probe; null when disabled in simpleadmin.conf */
    http?: HttpProbe | null;
    /** The probe met a captive, billing or activation page (status is
     *  then "warning") */
    portal?: boolean;
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
