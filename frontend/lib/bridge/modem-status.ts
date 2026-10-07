// =============================================================================
// ModemStatus from the bridges
// =============================================================================
// The dashboard components were written against QManager's poller JSON
// (types/modem-status.ts). This builds the same structure from the latest
// diag_bridge / system_bridge messages, so the components stay unchanged.
// Fields no bridge provides are left empty, null or at their neutral value.
// =============================================================================

import type { DiagLteCell, DiagNrCell, SystemSnapshot } from "@/types/bridge";
import type {
  CarrierComponent,
  ConnectionState,
  ConnectivityState,
  ModemStatus,
  NetworkType,
  ServiceStatus,
} from "@/types/modem-status";
import type { BridgeState } from "./store";
import { isSystemFresh, pickRadio, type RadioSource } from "./radio";

const NO_CHAINS = [null, null, null, null];

function popcount(mask: number): number {
  let count = 0;
  for (let value = mask >>> 0; value; value >>>= 1) count += value & 1;
  return count;
}

/** One decimal, null for anything that is not a finite number. */
function round1(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null;
}

function text(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** "BetterRoaming BetterRoaming": some networks repeat the name. */
function operatorName(value: string | undefined): string {
  const words = text(value).split(/\s+/);
  return words.filter((w, i) => i === 0 || w !== words[i - 1]).join(" ");
}

function lteComponent(cell: DiagLteCell): CarrierComponent {
  return {
    type: cell.is_scell ? "SCC" : "PCC",
    technology: "LTE",
    band: `B${cell.band}`,
    earfcn: cell.earfcn ?? null,
    bandwidth_mhz: cell.bandwidth_mhz ?? 0,
    pci: cell.pci ?? null,
    rsrp: round1(cell.rsrp),
    rsrq: round1(cell.rsrq),
    rssi: round1(cell.rssi),
    sinr: round1(cell.sinr),
  };
}

function nrComponent(cell: DiagNrCell, type: "PCC" | "SCC"): CarrierComponent {
  return {
    type,
    technology: "NR",
    band: cell.band ? `N${cell.band}` : "",
    earfcn: cell.arfcn ?? null,
    bandwidth_mhz: cell.bandwidth_mhz ?? 0,
    pci: cell.pci ?? null,
    rsrp: round1(cell.rsrp),
    rsrq: round1(cell.rsrq),
    rssi: null,
    sinr: round1(cell.sinr),
  };
}

function connectivityState(system: SystemSnapshot | null): ConnectivityState {
  switch (system?.conn.status) {
    case "ok":
      return "connected";
    case "warning":
      return "degraded";
    case "error":
      return "disconnected";
    default:
      return "unknown";
  }
}

function stats(samples: (number | null)[]) {
  const ok = samples.filter((v): v is number => typeof v === "number");
  if (ok.length === 0) {
    return { avg: null, min: null, max: null, jitter: null };
  }
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  let jitter: number | null = null;
  if (ok.length > 1) {
    let sum = 0;
    for (let i = 1; i < ok.length; i++) sum += Math.abs(ok[i] - ok[i - 1]);
    jitter = sum / (ok.length - 1);
  }
  return {
    avg: round1(avg),
    min: Math.min(...ok),
    max: Math.max(...ok),
    jitter: round1(jitter),
  };
}

export interface BridgeModemStatus {
  status: ModemStatus | null;
  radioSource: RadioSource;
}

export function buildModemStatus(
  state: BridgeState,
  now: number,
): BridgeModemStatus {
  const system = isSystemFresh(state, now) ? state.system : null;
  const { snapshot, source } = pickRadio(state, now);
  if (!system && !snapshot) {
    return { status: null, radioSource: source };
  }

  const lteCells = (snapshot?.lte ?? [])
    .slice()
    .sort(
      (a, b) =>
        a.is_scell - b.is_scell || (a.scell_idx ?? 0) - (b.scell_idx ?? 0),
    );
  const nrCells = snapshot?.nr ?? [];
  const pcell = lteCells.find((cell) => !cell.is_scell) ?? null;
  const scells = lteCells.filter((cell) => cell.is_scell);
  const nr0 = nrCells[0] ?? null;

  let networkType: NetworkType = "";
  if (pcell && nr0) networkType = "5G-NSA";
  else if (nr0) networkType = "5G-SA";
  else if (pcell) networkType = "LTE";

  // In NSA the NR leg is a secondary cell group; in SA the first NR cell is
  // the primary carrier.
  const components: CarrierComponent[] = [
    ...lteCells.map(lteComponent),
    ...nrCells.map((cell, i) =>
      nrComponent(cell, pcell || i > 0 ? "SCC" : "PCC"),
    ),
  ];
  const totalBandwidth = components.reduce(
    (sum, cc) => sum + (cc.bandwidth_mhz || 0),
    0,
  );
  const bandwidthDetails = components
    .filter((cc) => cc.bandwidth_mhz > 0)
    .map((cc) => `${cc.band}: ${cc.bandwidth_mhz} MHz`)
    .join(" + ");

  const modem = system?.modem;
  const registered = modem?.registered ?? Boolean(snapshot);
  const conn = connectivityState(system);
  let serviceStatus: ServiceStatus = "unknown";
  if (modem?.sim && modem.sim.state !== "Active") serviceStatus = "sim_error";
  else if (!registered) serviceStatus = "searching";
  else if (conn === "connected") serviceStatus = "optimal";
  else if (conn === "degraded") serviceStatus = "limited";
  else if (registered) serviceStatus = "connected";

  const cellState: ConnectionState = registered ? "connected" : "searching";
  const latency = stats(state.latencyHistory);
  const ping = system?.conn.ping;
  const lossSamples = state.latencyHistory.length;
  const lost = state.latencyHistory.filter((v) => v === null).length;

  const mimo = [
    pcell && pcell.rx_diversity
      ? `LTE ${pcell.tx_antennas ?? 1}x${popcount(pcell.rx_diversity)}`
      : "",
    nr0 && nr0.rx_diversity ? `NR 1x${popcount(nr0.rx_diversity)}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const dns = system?.net.dns ?? [];
  const status: ModemStatus = {
    timestamp: Math.floor(Math.max(state.diagAt, state.systemAt) / 1000),
    system_state: snapshot ? "normal" : "degraded",
    modem_reachable: true,
    last_successful_poll: Math.floor(Math.max(state.diagAt, state.systemAt) / 1000),
    errors:
      modem?.sim && modem.sim.state !== "Active" ? ["sim_not_inserted"] : [],
    network: {
      type: networkType,
      sim_slot: modem?.sim?.slot ?? 0,
      carrier: operatorName(modem?.operator),
      service_status: serviceStatus,
      ca_active: scells.length > 0,
      ca_count: scells.length,
      nr_ca_active: nrCells.length > 1,
      nr_ca_count: Math.max(nrCells.length - 1, 0),
      total_bandwidth_mhz: totalBandwidth,
      bandwidth_details: bandwidthDetails,
      apn: text(system?.net.apn),
      wan_ipv4: text(system?.net.wan_ip),
      wan_ipv6: "",
      primary_dns: dns[0] ?? "",
      secondary_dns: dns[1] ?? "",
      carrier_components: components,
    },
    lte: {
      state: pcell ? cellState : "inactive",
      band: pcell ? `B${pcell.band}` : "",
      earfcn: pcell?.earfcn ?? null,
      bandwidth: pcell?.bandwidth_mhz ?? null,
      pci: pcell?.pci ?? null,
      cell_id: pcell?.cell_id ?? null,
      enodeb_id: pcell?.cell_id != null ? pcell.cell_id >>> 8 : null,
      sector_id: pcell?.cell_id != null ? pcell.cell_id & 0xff : null,
      tac: pcell?.tac ?? null,
      rsrp: round1(pcell?.rsrp),
      rsrq: round1(pcell?.rsrq),
      sinr: round1(pcell?.sinr),
      rssi: round1(pcell?.rssi),
      ta: null,
    },
    nr: {
      state: nr0 ? cellState : "inactive",
      band: nr0?.band ? `N${nr0.band}` : "",
      arfcn: nr0?.arfcn ?? null,
      pci: nr0?.pci ?? null,
      cell_id: nr0?.cell_id ?? null,
      enodeb_id: null,
      sector_id: null,
      tac: nr0?.tac ?? null,
      rsrp: round1(nr0?.rsrp),
      rsrq: round1(nr0?.rsrq),
      sinr: round1(nr0?.sinr),
      scs: null,
      ta: null,
    },
    device: {
      temperature: round1(modem?.temperature?.modem),
      cpu_usage: system?.sys.cpu_pct ?? 0,
      memory_used_mb: Math.round((system?.sys.mem_used_kb ?? 0) / 1024),
      memory_total_mb: Math.round((system?.sys.mem_total_kb ?? 0) / 1024),
      uptime_seconds: Math.floor(system?.sys.uptime_s ?? 0),
      conn_uptime_seconds: 0,
      firmware: text(modem?.firmware),
      build_date: "",
      manufacturer: text(modem?.manufacturer),
      model: text(modem?.model),
      imei: text(modem?.imei),
      imsi: text(modem?.imsi),
      iccid: text(modem?.iccid),
      phone_number: "",
      lte_category: "",
      mimo,
      supported_lte_bands: "",
      supported_nsa_nr5g_bands: "",
      supported_sa_nr5g_bands: "",
    },
    connectivity: {
      internet_available: system ? conn === "connected" : null,
      status: conn,
      latency_ms: ping && ping.passed > 0 ? round1(ping.avg_ms) : null,
      avg_latency_ms: latency.avg,
      min_latency_ms: latency.min,
      max_latency_ms: latency.max,
      jitter_ms: latency.jitter,
      packet_loss_pct: lossSamples ? Math.round((lost / lossSamples) * 100) : 0,
      ping_target: ping?.results.map((r) => r.host).join(", ") ?? "",
      latency_history: state.latencyHistory,
      history_interval_sec: Math.round(state.latencyIntervalSec),
      history_size: state.latencyHistory.length,
      during_recovery: false,
      state:
        conn === "connected"
          ? "connected"
          : conn === "disconnected"
            ? "disconnected"
            : "unknown",
      last_family: ping ? (ping.passed > 0 ? "ipv4" : "none") : null,
      limited_reason: null,
      down_reason: null,
      streak_limited: 0,
      profile: "standard",
      fail_secs: 0,
      recover_secs: 0,
      intercept_secs: 0,
    },
    signal_per_antenna: {
      lte_rsrp: pcell?.rsrp_rx ?? NO_CHAINS,
      lte_rsrq: NO_CHAINS,
      lte_sinr: pcell?.sinr_rx ?? NO_CHAINS,
      nr_rsrp: nr0?.rsrp_rx ?? NO_CHAINS,
      nr_rsrq: NO_CHAINS,
      nr_sinr: NO_CHAINS,
    },
    watchcat: {
      enabled: false,
      state: "disabled",
      current_tier: 0,
      failure_count: 0,
      last_recovery_time: null,
      last_recovery_tier: null,
      total_recoveries: 0,
      cooldown_remaining: 0,
      reboots_this_hour: 0,
    },
    sim_failover: {
      active: false,
      original_slot: null,
      current_slot: null,
      switched_at: null,
    },
    sim_swap: {
      detected: false,
      matching_profile_id: null,
      matching_profile_name: null,
    },
  };
  return { status, radioSource: source };
}
