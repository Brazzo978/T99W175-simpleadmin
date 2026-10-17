// Every carrier of a radio snapshot as one flat row, LTE PCell first, then
// the SCells by index, then NR: the order of the carrier table and charts.

import type { DiagSnapshot } from "@/types/bridge";
import type { Rat } from "./metrics";

export interface CarrierRow {
  key: string;
  rat: Rat;
  /** "PCC", "SCC 1", "NR" or "NR 2" */
  role: string;
  /** "B3", "n78" */
  band: string;
  /** Short name for chart axes: "PCC B3" */
  name: string;
  arfcn: number;
  pci: number;
  bandwidth_mhz?: number;
  bandwidth_estimated?: boolean;
  measured: boolean;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  cqi?: number;
  rank?: number;
  modulation?: string;
  mcs?: number;
  bler?: number;
  dl_mbps?: number;
  ul_mbps?: number;
  tx_power?: number;
}

export function carrierRows(snapshot: DiagSnapshot): CarrierRow[] {
  const lte = snapshot.lte
    .slice()
    .sort((a, b) => a.is_scell - b.is_scell || (a.scell_idx ?? 0) - (b.scell_idx ?? 0));
  const rows: CarrierRow[] = lte.map((c) => {
    const role = c.is_scell ? `SCC ${c.scell_idx}` : "PCC";
    const band = `B${c.band}`;
    return {
      key: `lte-${c.earfcn}-${c.pci}`,
      rat: "lte",
      role,
      band,
      name: `${role} ${band}`,
      arfcn: c.earfcn,
      pci: c.pci,
      bandwidth_mhz: c.bandwidth_mhz,
      bandwidth_estimated: c.bandwidth_estimated,
      measured: c.measured !== false,
      rsrp: c.rsrp,
      rsrq: c.rsrq,
      sinr: c.sinr,
      cqi: c.cqi,
      rank: c.ri,
      modulation: c.modulation,
      mcs: c.mcs,
      bler: c.dl_bler,
      dl_mbps: c.dl_mbps,
      ul_mbps: c.ul_mbps,
      tx_power: c.tx_power_dbm,
    };
  });
  snapshot.nr.forEach((c, i) => {
    const role = i === 0 ? "NR" : `NR ${i + 1}`;
    const band = c.band ? `n${c.band}` : "NR";
    rows.push({
      key: `nr-${c.arfcn}-${c.pci}`,
      rat: "nr",
      role,
      band,
      name: c.band ? `${role} ${band}` : role,
      arfcn: c.arfcn,
      pci: c.pci,
      bandwidth_mhz: c.bandwidth_mhz,
      bandwidth_estimated: c.bandwidth_estimated,
      measured: true,
      rsrp: c.rsrp,
      rsrq: c.rsrq,
      sinr: c.sinr ?? null,
      cqi: c.cqi,
      rank: c.ri ?? (typeof c.dl_layers === "number" ? Math.round(c.dl_layers) : undefined),
      modulation: c.modulation,
      mcs: c.dl_mcs,
      bler: c.dl_bler,
      dl_mbps: c.dl_mbps,
      ul_mbps: c.ul_mbps,
      tx_power: c.tx_power_dbm,
    });
  });
  return rows;
}
