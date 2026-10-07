"use client";

import { useMemo } from "react";
import { PageShell } from "@/components/page-shell";
import { getValueColorClass } from "@/components/dashboard/signal-card-utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { pickRadio, type RadioSource } from "@/lib/bridge/radio";
import type { ChainValues, DiagLteCell, DiagNrCell } from "@/types/bridge";
import {
  RSRP_THRESHOLDS,
  RSRQ_THRESHOLDS,
  SINR_THRESHOLDS,
  getSignalQuality,
  type SignalThresholds,
} from "@/types/modem-status";

// RSRP shown on a -140..-44 dBm bar, SINR on -20..30 dB.
const RSRP_RANGE = [-140, -44] as const;
const SINR_RANGE = [-20, 30] as const;

const ANTENNA_NAMES = ["Main (PRX)", "Diversity (DRX)", "MIMO 3 (RX2)", "MIMO 4 (RX3)"];

function fmt(value: number | null | undefined, unit: string, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)} ${unit}`
    : "—";
}

function Metric({
  label,
  value,
  unit,
  thresholds,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  thresholds?: SignalThresholds;
}) {
  const quality = thresholds ? getSignalQuality(value ?? null, thresholds) : "none";
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${getValueColorClass(quality)}`}>
        {fmt(value, unit)}
      </span>
    </div>
  );
}

function ChainBars({
  label,
  values,
  unit,
  range,
  thresholds,
}: {
  label: string;
  values: ChainValues | undefined;
  unit: string;
  range: readonly [number, number];
  thresholds: SignalThresholds;
}) {
  const chains = (values ?? []).map((v, i) => ({ v, i })).filter((c) => typeof c.v === "number");
  if (chains.length === 0) return null;
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      {chains.map(({ v, i }) => {
        const value = v as number;
        const pct = Math.max(0, Math.min(100, ((value - range[0]) / (range[1] - range[0])) * 100));
        const quality = getSignalQuality(value, thresholds);
        const bar =
          quality === "excellent" || quality === "good"
            ? "bg-success"
            : quality === "fair"
              ? "bg-warning"
              : "bg-destructive";
        return (
          <div key={i} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{ANTENNA_NAMES[i]}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-right tabular-nums">{fmt(value, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <Badge variant="secondary" className="font-normal">
      <span className="text-muted-foreground">{label}</span> {value}
    </Badge>
  );
}

const pct = (v: number | undefined) =>
  typeof v === "number" ? `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` : null;

function LteCard({ cell }: { cell: DiagLteCell }) {
  const title = cell.is_scell ? `LTE SCell ${cell.scell_idx}` : "LTE Primary Cell";
  return (
    <Card className="@container/card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              Band {cell.band} · EARFCN {cell.earfcn} · PCI {cell.pci}
              {cell.bandwidth_mhz ? ` · ${cell.bandwidth_mhz} MHz${cell.bandwidth_estimated ? " (est.)" : ""}` : ""}
            </CardDescription>
          </div>
          <Badge variant="outline">{cell.is_scell ? "SCC" : "PCC"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        {cell.measured === false ? (
          <p className="text-sm text-muted-foreground">
            Configured by the network, not measured by this firmware.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 @sm/card:grid-cols-4">
              <Metric label="RSRP" value={cell.rsrp} unit="dBm" thresholds={RSRP_THRESHOLDS} />
              <Metric label="RSRQ" value={cell.rsrq} unit="dB" thresholds={RSRQ_THRESHOLDS} />
              <Metric label="RSSI" value={cell.rssi} unit="dBm" />
              <Metric label="SINR" value={cell.sinr} unit="dB" thresholds={SINR_THRESHOLDS} />
            </div>
            <ChainBars label="RSRP per antenna" values={cell.rsrp_rx} unit="dBm" range={RSRP_RANGE} thresholds={RSRP_THRESHOLDS} />
            <ChainBars label="SINR per antenna" values={cell.sinr_rx} unit="dB" range={SINR_RANGE} thresholds={SINR_THRESHOLDS} />
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Detail label="Cell ID" value={cell.cell_id} />
          <Detail label="TAC" value={cell.tac} />
          <Detail label="PLMN" value={cell.mcc != null && cell.mnc != null ? `${cell.mcc}-${cell.mnc}` : null} />
          <Detail label="TX antennas" value={cell.tx_antennas} />
          <Detail label="DL" value={cell.modulation} />
          <Detail label="MCS" value={cell.mcs} />
          <Detail label="DL BLER" value={pct(cell.dl_bler)} />
          <Detail label="DL" value={typeof cell.dl_mbps === "number" ? `${cell.dl_mbps.toFixed(1)} Mbps` : null} />
          <Detail label="UL" value={cell.ul_modulation} />
          <Detail label="UL RB" value={cell.ul_rb} />
          <Detail label="UL" value={typeof cell.ul_mbps === "number" ? `${cell.ul_mbps.toFixed(2)} Mbps` : null} />
        </div>
      </CardContent>
    </Card>
  );
}

function NrCard({ cell, index, nsa }: { cell: DiagNrCell; index: number; nsa: boolean }) {
  const title = nsa
    ? index === 0 ? "5G NSA Cell" : `5G NSA Cell ${index + 1}`
    : index === 0 ? "5G Primary Cell" : `5G SCell ${index}`;
  return (
    <Card className="@container/card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {cell.band ? `Band n${cell.band} · ` : ""}NR-ARFCN {cell.arfcn} · PCI {cell.pci}
              {cell.bandwidth_mhz ? ` · ${cell.bandwidth_mhz} MHz${cell.bandwidth_estimated ? " (est.)" : ""}` : ""}
            </CardDescription>
          </div>
          <Badge variant="outline">NR</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-3 gap-4">
          <Metric label="RSRP" value={cell.rsrp} unit="dBm" thresholds={RSRP_THRESHOLDS} />
          <Metric label="RSRQ" value={cell.rsrq} unit="dB" thresholds={RSRQ_THRESHOLDS} />
          <Metric label="SINR" value={cell.sinr} unit="dB" thresholds={SINR_THRESHOLDS} />
        </div>
        <ChainBars label="RSRP per antenna" values={cell.rsrp_rx} unit="dBm" range={RSRP_RANGE} thresholds={RSRP_THRESHOLDS} />
        <div className="flex flex-wrap gap-2">
          <Detail label="SSB" value={cell.ssb} />
          <Detail label="Beams" value={cell.num_beams} />
          <Detail label="Neighbours" value={cell.neighbor_cells} />
          <Detail label="UL BW" value={cell.ul_bandwidth_mhz ? `${cell.ul_bandwidth_mhz} MHz` : null} />
          <Detail label="DL" value={cell.modulation} />
          <Detail label="DL BLER" value={pct(cell.dl_bler)} />
          <Detail label="DL" value={typeof cell.dl_mbps === "number" ? `${cell.dl_mbps.toFixed(1)} Mbps` : null} />
          <Detail label="UL MCS" value={typeof cell.ul_mcs === "number" ? cell.ul_mcs.toFixed(1) : null} />
          <Detail label="UL PRB" value={typeof cell.ul_prb === "number" ? cell.ul_prb.toFixed(0) : null} />
          <Detail label="UL" value={typeof cell.ul_mbps === "number" ? `${cell.ul_mbps.toFixed(2)} Mbps` : null} />
          <Detail label="PHR" value={typeof cell.phr_db === "number" ? `${cell.phr_db.toFixed(1)} dB` : null} />
          <Detail label="Pcmax" value={typeof cell.pcmax_dbm === "number" ? `${cell.pcmax_dbm.toFixed(1)} dBm` : null} />
        </div>
      </CardContent>
    </Card>
  );
}

const SOURCE_LABEL: Record<RadioSource, string> = {
  diag: "DIAG",
  qmi: "QMI (diag_bridge not connected)",
  none: "no data",
};

export default function SignalDetailsComponent() {
  const state = useBridgeState();
  const now = useNow();
  const { snapshot, source } = useMemo(() => pickRadio(state, now), [state, now]);

  const lte = (snapshot?.lte ?? [])
    .slice()
    .sort((a, b) => a.is_scell - b.is_scell || (a.scell_idx ?? 0) - (b.scell_idx ?? 0));
  const nr = snapshot?.nr ?? [];
  const total = [...lte, ...nr].reduce((s, c) => s + (c.bandwidth_mhz ?? 0), 0);

  return (
    <PageShell
      title="Signal Details"
      description={`Every carrier the modem uses, live. Source: ${SOURCE_LABEL[source]}${
        total ? ` · ${total} MHz aggregated` : ""
      }.`}
    >
      {!snapshot ? (
        Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-xl" />)
      ) : (
        <>
          {lte.map((cell) => (
            <LteCard key={`lte-${cell.earfcn}-${cell.pci}`} cell={cell} />
          ))}
          {nr.map((cell, i) => (
            <NrCard key={`nr-${cell.arfcn}-${cell.pci}`} cell={cell} index={i} nsa={lte.length > 0} />
          ))}
        </>
      )}
    </PageShell>
  );
}
