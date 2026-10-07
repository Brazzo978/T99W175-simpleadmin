// =============================================================================
// cellular-settings.ts — QManager Cellular Basic Settings Types
// =============================================================================
// TypeScript interfaces for the Cellular Basic Settings feature.
//
// Backend contract:
//   GET/POST /cgi-bin/quecmanager/cellular/settings.sh
// =============================================================================

// --- Settings ----------------------------------------------------------------

/** Current cellular settings read from the modem */
export interface CellularSettings {
  /** Active SIM slot (1 or 2) */
  sim_slot: number;
  /** CFUN mode: 0=minimum, 1=full, 4=RF disabled */
  cfun: number;
  /** Network mode preference: "AUTO", "LTE", "NR5G", "LTE:NR5G", etc. */
  mode_pref: string;
  /** NR5G disable mode: 0=both enabled, 1=SA disabled (NSA only), 2=NSA disabled (SA only) */
  nr5g_mode: number;
  /** Roaming preference: 1=home only, 3=affiliate, 255=any network */
  roam_pref: number;
}

// --- AMBR Data ---------------------------------------------------------------

/** LTE AMBR entry (one per APN) */
export interface LteAmbrEntry {
  /** APN name */
  apn: string;
  /** Downlink AMBR in Kbps */
  dl_kbps: number;
  /** Uplink AMBR in Kbps */
  ul_kbps: number;
}

/** NR5G AMBR entry (one per DNN) */
export interface Nr5gAmbrEntry {
  /** DNN (Data Network Name) */
  dnn: string;
  /** Downlink AMBR in Kbps (already converted from unit*session) */
  dl_kbps: number;
  /** Uplink AMBR in Kbps (already converted from unit*session) */
  ul_kbps: number;
}

/** Combined AMBR data */
export interface AmbrData {
  lte: LteAmbrEntry[];
  nr5g: Nr5gAmbrEntry[];
}

// --- API Responses -----------------------------------------------------------

/** Response from GET /cgi-bin/quecmanager/cellular/settings.sh */
export interface CellularSettingsResponse {
  success: boolean;
  settings: CellularSettings;
  ambr: AmbrData;
  error?: string;
}

/** Response from POST /cgi-bin/quecmanager/cellular/settings.sh */
export interface CellularSettingsApplyResponse {
  success: boolean;
  error?: string;
  /** Fields that failed to apply (only on partial failure) */
  failed_fields?: string[];
  /** Fields that were successfully applied */
  applied_fields?: string[];
}

// --- Display Helpers ---------------------------------------------------------

/**
 * Format Kbps to human-readable string.
 * Examples: 500 -> "500 Kbps", 150000 -> "150 Mbps", 2008640 -> "2.01 Gbps"
 */
export function formatBitrate(kbps: number): string {
  if (kbps >= 1000000) {
    return `${(kbps / 1000000).toFixed(2)} Gbps`;
  }
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(0)} Mbps`;
  }
  return `${kbps} Kbps`;
}
