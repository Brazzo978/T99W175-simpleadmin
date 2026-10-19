"use client";

import { getValueColorClass } from "@/components/dashboard/signal-card-utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ChainValues, DiagLteCell, DiagNrCell } from "@/types/bridge";
import {
  RSRP_THRESHOLDS,
  RSRQ_THRESHOLDS,
  SINR_THRESHOLDS,
  type SignalThresholds,
} from "@/types/modem-status";
import { RangeMeter, RankDots, SegmentMeter } from "./meters";
import {
  CQI_THRESHOLDS,
  blerQuality,
  fmt,
  fmtMbps,
  pct,
  quality,
  txPowerQuality,
} from "./metrics";

// RSRP on a -140..-44 dBm bar, SINR/SNR on -20..30 dB, TX power -40..23 dBm.
const RSRP_RANGE = [-140, -44] as const;
const SINR_RANGE = [-20, 30] as const;
const TX_RANGE = [-40, 23] as const;

const ANTENNA_NAMES = ["Main (PRX)", "Diversity (DRX)", "MIMO 3 (RX2)", "MIMO 4 (RX3)"];

const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function Metric({
  label,
  value,
  unit,
  thresholds,
  note,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  thresholds?: SignalThresholds;
  note?: string;
}) {
  const q = thresholds ? quality(value, thresholds) : "none";
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums transition-colors", getValueColorClass(q))}>
        {fmt(value, unit)}
      </span>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
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
  const chains = (values ?? []).map((v, i) => ({ v, i })).filter((c) => has(c.v));
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      {chains.length === 0 && <span className="text-sm text-muted-foreground">Not reported</span>}
      {chains.map(({ v, i }) => {
        const value = v as number;
        return (
          <div key={i} className="grid grid-cols-[7.5rem_1fr_5rem] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{ANTENNA_NAMES[i]}</span>
            <RangeMeter
              value={value}
              min={range[0]}
              max={range[1]}
              quality={quality(value, thresholds)}
              label={`${label} ${ANTENNA_NAMES[i]}`}
            />
            <span className="text-right tabular-nums">{fmt(value, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** CQI, rank and TX power: the link adaptation state of one carrier. */
function LinkAdaptation({
  cqi,
  ri,
  layers,
  txPower,
  pcmax,
}: {
  cqi?: number;
  ri?: number;
  layers?: number;
  txPower?: number;
  pcmax?: number;
}) {
  const cqiQ = quality(cqi, CQI_THRESHOLDS);
  const txQ = txPowerQuality(txPower);
  const rank = has(ri) ? ri : layers;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 @sm/card:grid-cols-3">
      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">CQI</span>
          <span className={cn("font-semibold tabular-nums", getValueColorClass(cqiQ))}>
            {has(cqi) ? `${cqi}` : "—"}
            <span className="text-xs font-normal text-muted-foreground"> / 15</span>
          </span>
        </div>
        <SegmentMeter value={cqi} max={15} quality={cqiQ} label="Wideband CQI" />
      </div>
      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">MIMO</span>
          <span className="font-semibold tabular-nums">
            {has(rank) ? `rank ${Math.round(rank)}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <RankDots rank={rank} label={has(rank) ? `Rank ${Math.round(rank)} of 4` : "Rank unknown"} />
          {has(layers) && has(ri) && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {layers.toFixed(1)} layers used
            </span>
          )}
        </div>
      </div>
      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">TX power</span>
          <span className={cn("font-semibold tabular-nums", getValueColorClass(txQ))}>
            {fmt(txPower, "dBm")}
          </span>
        </div>
        <RangeMeter
          value={txPower}
          min={TX_RANGE[0]}
          max={TX_RANGE[1]}
          quality={txQ}
          marker={pcmax}
          label="PUSCH TX power"
        />
        <span className="text-[11px] text-muted-foreground">
          {has(txPower)
            ? "Last PUSCH transmission, not an average"
            : "No PUSCH in the last 5 s"}
        </span>
      </div>
    </div>
  );
}

interface LinkRow {
  label: string;
  dl?: React.ReactNode;
  ul?: React.ReactNode;
}

/** DL against UL, one row per quantity; a dash where the modem reports nothing. */
function LinkTable({ rows }: { rows: LinkRow[] }) {
  const shown = rows;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 text-xs">Link</TableHead>
          <TableHead className="h-8 text-right text-xs">Downlink</TableHead>
          <TableHead className="h-8 text-right text-xs">Uplink</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((r) => (
          <TableRow key={r.label}>
            <TableCell className="py-1.5 text-muted-foreground">{r.label}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{r.dl ?? "—"}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{r.ul ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <Badge variant="secondary" className="font-normal">
      <span className="text-muted-foreground">{label}</span> {empty ? "—" : value}
    </Badge>
  );
}

function Bler({ value }: { value?: number }) {
  if (!has(value)) return null;
  return <span className={getValueColorClass(blerQuality(value))}>{pct(value)}</span>;
}

function Rate({ value }: { value?: number }) {
  return has(value) ? <>{fmtMbps(value)} Mbps</> : null;
}

/** Timing advance as the bridge reports it: raw command, distance, age. */
function TimingAdvance({
  ta,
  meters,
  age,
  scs,
  scsEstimated,
}: {
  ta?: number;
  meters?: number;
  age?: number;
  scs?: number;
  scsEstimated?: boolean;
}) {
  if (!has(ta)) return <Detail label="TA" value="— (no RACH logged yet)" />;
  const parts = [`${ta}`];
  if (has(meters)) {
    parts.push(meters >= 1000 ? `≈ ${(meters / 1000).toFixed(2)} km` : `≈ ${Math.round(meters)} m`);
  }
  if (has(scs)) parts.push(`SCS ${scs} kHz${scsEstimated ? " (est.)" : ""}`);
  if (has(age)) parts.push(`${age} s ago`);
  return <Detail label="TA" value={parts.join(" · ")} />;
}

export function LteCard({ cell }: { cell: DiagLteCell }) {
  const title = cell.is_scell ? `LTE SCell ${cell.scell_idx}` : "LTE Primary Cell";
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Band {cell.band} · EARFCN {cell.earfcn} · PCI {cell.pci}
          {cell.bandwidth_mhz ? ` · ${cell.bandwidth_mhz} MHz${cell.bandwidth_estimated ? " (est.)" : ""}` : ""}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{cell.is_scell ? "SCC" : "PCC"}</Badge>
        </CardAction>
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
        <LinkAdaptation cqi={cell.cqi} ri={cell.ri} txPower={cell.tx_power_dbm} pcmax={cell.mtpl_dbm} />
        <LinkTable
          rows={[
            { label: "Modulation", dl: cell.modulation, ul: cell.ul_modulation },
            { label: "MCS", dl: has(cell.mcs) ? cell.mcs : undefined },
            {
              label: "Resource blocks",
              dl: has(cell.bandwidth_prb) ? `${cell.bandwidth_prb} PRB cell` : undefined,
              ul: has(cell.ul_rb) ? `${cell.ul_rb.toFixed(1)} RB` : undefined,
            },
            { label: "BLER", dl: has(cell.dl_bler) ? <Bler value={cell.dl_bler} /> : undefined },
            {
              label: "Throughput",
              dl: has(cell.dl_mbps) ? <Rate value={cell.dl_mbps} /> : undefined,
              ul: has(cell.ul_mbps) ? <Rate value={cell.ul_mbps} /> : undefined,
            },
            {
              label: "Power headroom",
              ul: has(cell.phr_db) ? `${cell.phr_db} dB` : undefined,
            },
            {
              label: "Max TX power (MTPL)",
              ul: has(cell.mtpl_dbm) ? `${cell.mtpl_dbm} dBm` : undefined,
            },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Detail label="Cell ID" value={cell.cell_id} />
          <Detail label="TAC" value={cell.tac} />
          <Detail label="PLMN" value={cell.mcc != null && cell.mnc != null ? `${cell.mcc}-${cell.mnc}` : null} />
          <Detail label="TX antennas" value={cell.tx_antennas} />
          <TimingAdvance ta={cell.ta} meters={cell.ta_m} age={cell.ta_age_s} />
        </div>
      </CardContent>
    </Card>
  );
}

export function NrCard({ cell, index, nsa }: { cell: DiagNrCell; index: number; nsa: boolean }) {
  const title = nsa
    ? index === 0 ? "5G NSA Cell" : `5G NSA Cell ${index + 1}`
    : index === 0 ? "5G Primary Cell" : `5G SCell ${index}`;
  const sinrNote = has(cell.sinr_age_s) ? `RRC report, ${cell.sinr_age_s} s ago` : undefined;
  // 0 dBm comes with an idle uplink: the bridge has no Pcmax to report then.
  const pcmax = has(cell.pcmax_dbm) && cell.pcmax_dbm > 0 ? cell.pcmax_dbm : undefined;
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {cell.band ? `Band n${cell.band} · ` : ""}NR-ARFCN {cell.arfcn} · PCI {cell.pci}
          {cell.bandwidth_mhz ? ` · ${cell.bandwidth_mhz} MHz${cell.bandwidth_estimated ? " (est.)" : ""}` : ""}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">NR</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 @sm/card:grid-cols-4">
          <Metric label="RSRP" value={cell.rsrp} unit="dBm" thresholds={RSRP_THRESHOLDS} />
          <Metric label="RSRQ" value={cell.rsrq} unit="dB" thresholds={RSRQ_THRESHOLDS} />
          <Metric label="SINR" value={cell.sinr} unit="dB" thresholds={SINR_THRESHOLDS} note={sinrNote} />
          <Metric label="SNR (best)" value={cell.snr} unit="dB" thresholds={SINR_THRESHOLDS} />
        </div>
        <ChainBars label="RSRP per antenna" values={cell.rsrp_rx} unit="dBm" range={RSRP_RANGE} thresholds={RSRP_THRESHOLDS} />
        <ChainBars label="SNR per antenna" values={cell.snr_rx} unit="dB" range={SINR_RANGE} thresholds={SINR_THRESHOLDS} />
        <LinkAdaptation
          cqi={cell.cqi}
          ri={cell.ri}
          layers={cell.dl_layers}
          txPower={cell.tx_power_dbm}
          pcmax={pcmax}
        />
        <LinkTable
          rows={[
            { label: "Modulation", dl: cell.modulation },
            {
              label: "MCS (avg)",
              dl: has(cell.dl_mcs) ? cell.dl_mcs.toFixed(1) : undefined,
              ul: has(cell.ul_mcs) ? cell.ul_mcs.toFixed(1) : undefined,
            },
            { label: "Layers (avg)", dl: has(cell.dl_layers) ? cell.dl_layers.toFixed(1) : undefined },
            {
              label: "Resource blocks",
              dl: has(cell.dl_rb) ? `${cell.dl_rb.toFixed(0)} RB` : undefined,
              ul: has(cell.ul_prb) ? `${cell.ul_prb.toFixed(0)} PRB` : undefined,
            },
            {
              label: "Bandwidth",
              dl: cell.bandwidth_mhz ? `${cell.bandwidth_mhz} MHz` : undefined,
              ul: cell.ul_bandwidth_mhz ? `${cell.ul_bandwidth_mhz} MHz` : undefined,
            },
            { label: "BLER", dl: has(cell.dl_bler) ? <Bler value={cell.dl_bler} /> : undefined },
            {
              label: "Throughput",
              dl: has(cell.dl_mbps) ? <Rate value={cell.dl_mbps} /> : undefined,
              ul: has(cell.ul_mbps) ? <Rate value={cell.ul_mbps} /> : undefined,
            },
            {
              label: "Path loss",
              dl: has(cell.pathloss_db) ? `${cell.pathloss_db.toFixed(1)} dB` : undefined,
            },
            {
              label: "Power headroom",
              ul: has(cell.phr_db) ? `${cell.phr_db.toFixed(1)} dB` : undefined,
            },
            {
              label: "Pcmax",
              ul: has(pcmax) ? `${pcmax.toFixed(1)} dBm` : undefined,
            },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Detail label="SSB" value={cell.ssb} />
          <Detail label="Beams" value={cell.num_beams} />
          <Detail label="Neighbours" value={cell.neighbor_cells} />
          <Detail label="Cell ID" value={cell.cell_id} />
          <TimingAdvance
            ta={cell.ta}
            meters={cell.ta_m}
            age={cell.ta_age_s}
            scs={cell.ta_scs_khz}
            scsEstimated={cell.ta_scs_estimated}
          />
        </div>
      </CardContent>
    </Card>
  );
}
