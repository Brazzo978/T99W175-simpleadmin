"use client";

import { useTranslation } from "react-i18next";
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

/** Receive chains in port order (keys under cell.antenna). */
const ANTENNA_KEYS = ["main", "diversity", "mimo3", "mimo4"];

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
  optional = false,
}: {
  label: string;
  values: ChainValues | undefined;
  unit: string;
  range: readonly [number, number];
  thresholds: SignalThresholds;
  /** Hidden rather than "not reported" when no chain has a value */
  optional?: boolean;
}) {
  const { t } = useTranslation("signal");
  const chains = (values ?? []).map((v, i) => ({ v, i })).filter((c) => has(c.v));
  if (optional && chains.length === 0) return null;
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      {chains.length === 0 && <span className="text-sm text-muted-foreground">{t("cell.not_reported")}</span>}
      {chains.map(({ v, i }) => {
        const value = v as number;
        const antenna = ANTENNA_KEYS[i] ? t(`cell.antenna.${ANTENNA_KEYS[i]}`) : "";
        return (
          <div key={i} className="grid grid-cols-[7.5rem_1fr_5rem] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{antenna}</span>
            <RangeMeter
              value={value}
              min={range[0]}
              max={range[1]}
              quality={quality(value, thresholds)}
              label={t("cell.chain_aria", { metric: label, antenna })}
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
  showTx = true,
}: {
  cqi?: number;
  ri?: number;
  layers?: number;
  txPower?: number;
  pcmax?: number;
  /** Whether this carrier ever reports a TX power (NR does not here) */
  showTx?: boolean;
}) {
  const { t } = useTranslation("signal");
  const cqiQ = quality(cqi, CQI_THRESHOLDS);
  const txQ = txPowerQuality(txPower);
  const rank = has(ri) ? ri : layers;
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3",
        showTx ? "@sm/card:grid-cols-3" : "@sm/card:grid-cols-2",
      )}
    >
      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">CQI</span>
          <span className={cn("font-semibold tabular-nums", getValueColorClass(cqiQ))}>
            {has(cqi) ? `${cqi}` : "—"}
            <span className="text-xs font-normal text-muted-foreground"> / 15</span>
          </span>
        </div>
        <SegmentMeter value={cqi} max={15} quality={cqiQ} label={t("cell.link_adaptation.cqi_aria")} />
      </div>
      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">MIMO</span>
          <span className="font-semibold tabular-nums">
            {has(rank) ? t("cell.link_adaptation.rank_value", { rank: Math.round(rank) }) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <RankDots
            rank={rank}
            label={
              has(rank)
                ? t("cell.link_adaptation.rank_of", { rank: Math.round(rank) })
                : t("cell.link_adaptation.rank_unknown")
            }
          />
          {has(layers) && has(ri) && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {t("cell.link_adaptation.layers_used", { layers: layers.toFixed(1) })}
            </span>
          )}
        </div>
      </div>
      {showTx && (
      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t("cell.link_adaptation.tx_power")}</span>
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
          label={t("cell.link_adaptation.tx_power_aria")}
        />
        <span className="text-[11px] text-muted-foreground">
          {has(txPower)
            ? t("cell.link_adaptation.tx_last")
            : t("cell.link_adaptation.tx_none")}
        </span>
      </div>
      )}
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
  const { t } = useTranslation("signal");
  const shown = rows;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 text-xs">{t("cell.link.head")}</TableHead>
          <TableHead className="h-8 text-right text-xs">{t("cell.link.downlink")}</TableHead>
          <TableHead className="h-8 text-right text-xs">{t("cell.link.uplink")}</TableHead>
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
  const { t } = useTranslation("signal");
  const label = t("cell.detail.ta");
  if (!has(ta)) return <Detail label={label} value={t("cell.ta.none")} />;
  const parts = [`${ta}`];
  if (has(meters)) {
    parts.push(meters >= 1000 ? `≈ ${(meters / 1000).toFixed(2)} km` : `≈ ${Math.round(meters)} m`);
  }
  if (has(scs)) parts.push(t(scsEstimated ? "cell.ta.scs_estimated" : "cell.ta.scs", { scs }));
  if (has(age)) parts.push(t("cell.ta.age", { age }));
  return <Detail label={label} value={parts.join(" · ")} />;
}

/** " · 20 MHz", " · 20 MHz (est.)" or nothing: the tail of a cell description. */
function useBandwidthSuffix() {
  const { t } = useTranslation("signal");
  return (mhz: number | undefined, estimated: boolean | undefined) =>
    mhz ? t(estimated ? "cell.bandwidth_estimated" : "cell.bandwidth", { mhz }) : "";
}

export function LteCard({ cell }: { cell: DiagLteCell }) {
  const { t } = useTranslation("signal");
  const bandwidth = useBandwidthSuffix();
  const title = cell.is_scell
    ? t("cell.lte_scell", { index: cell.scell_idx })
    : t("cell.lte_primary");
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {t("cell.lte_description", { band: cell.band, earfcn: cell.earfcn, pci: cell.pci })}
          {bandwidth(cell.bandwidth_mhz, cell.bandwidth_estimated)}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{cell.is_scell ? "SCC" : "PCC"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        {cell.measured === false ? (
          <p className="text-sm text-muted-foreground">
            {t("cell.not_measured")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 @sm/card:grid-cols-4">
              <Metric label="RSRP" value={cell.rsrp} unit="dBm" thresholds={RSRP_THRESHOLDS} />
              <Metric label="RSRQ" value={cell.rsrq} unit="dB" thresholds={RSRQ_THRESHOLDS} />
              <Metric label="RSSI" value={cell.rssi} unit="dBm" />
              <Metric label="SINR" value={cell.sinr} unit="dB" thresholds={SINR_THRESHOLDS} />
            </div>
            <ChainBars label={t("cell.rsrp_per_antenna")} values={cell.rsrp_rx} unit="dBm" range={RSRP_RANGE} thresholds={RSRP_THRESHOLDS} />
            <ChainBars label={t("cell.sinr_per_antenna")} values={cell.sinr_rx} unit="dB" range={SINR_RANGE} thresholds={SINR_THRESHOLDS} />
          </>
        )}
        <LinkAdaptation cqi={cell.cqi} ri={cell.ri} txPower={cell.tx_power_dbm} pcmax={cell.mtpl_dbm} />
        <LinkTable
          rows={[
            { label: t("cell.link.modulation"), dl: cell.modulation, ul: cell.ul_modulation },
            { label: t("cell.link.mcs"), dl: has(cell.mcs) ? cell.mcs : undefined },
            {
              label: t("cell.link.resource_blocks"),
              dl: has(cell.bandwidth_prb) ? t("cell.link.prb_cell", { prb: cell.bandwidth_prb }) : undefined,
              ul: has(cell.ul_rb) ? `${cell.ul_rb.toFixed(1)} RB` : undefined,
            },
            { label: t("cell.link.bler"), dl: has(cell.dl_bler) ? <Bler value={cell.dl_bler} /> : undefined },
            {
              label: t("cell.link.throughput"),
              dl: has(cell.dl_mbps) ? <Rate value={cell.dl_mbps} /> : undefined,
              ul: has(cell.ul_mbps) ? <Rate value={cell.ul_mbps} /> : undefined,
            },
            {
              label: t("cell.link.power_headroom"),
              ul: has(cell.phr_db) ? `${cell.phr_db} dB` : undefined,
            },
            {
              label: t("cell.link.mtpl"),
              ul: has(cell.mtpl_dbm) ? `${cell.mtpl_dbm} dBm` : undefined,
            },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Detail label={t("cell.detail.cell_id")} value={cell.cell_id} />
          <Detail label={t("cell.detail.tac")} value={cell.tac} />
          <Detail label={t("cell.detail.plmn")} value={cell.mcc != null && cell.mnc != null ? `${cell.mcc}-${cell.mnc}` : null} />
          <Detail label={t("cell.detail.tx_antennas")} value={cell.tx_antennas} />
          <TimingAdvance ta={cell.ta} meters={cell.ta_m} age={cell.ta_age_s} />
        </div>
      </CardContent>
    </Card>
  );
}

export function NrCard({ cell, index, nsa }: { cell: DiagNrCell; index: number; nsa: boolean }) {
  const { t } = useTranslation("signal");
  const bandwidth = useBandwidthSuffix();
  const title = nsa
    ? index === 0 ? t("cell.nsa_cell") : t("cell.nsa_cell_n", { index: index + 1 })
    : index === 0 ? t("cell.nr_primary") : t("cell.nr_scell", { index });
  const sinrNote = has(cell.sinr_age_s) ? t("cell.sinr_note", { age: cell.sinr_age_s }) : undefined;
  // 0 dBm comes with an idle uplink: the bridge has no Pcmax to report then.
  const pcmax = has(cell.pcmax_dbm) && cell.pcmax_dbm > 0 ? cell.pcmax_dbm : undefined;
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {cell.band
            ? t("cell.nr_description_band", { band: cell.band, arfcn: cell.arfcn, pci: cell.pci })
            : t("cell.nr_description", { arfcn: cell.arfcn, pci: cell.pci })}
          {bandwidth(cell.bandwidth_mhz, cell.bandwidth_estimated)}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">NR</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        {/* This firmware never logs NR SNR (0xB8D8) nor NR UL power and path
            loss (0xB884): those fields show only when a firmware sends them. */}
        <div className={cn("grid grid-cols-2 gap-4", has(cell.snr) ? "@sm/card:grid-cols-4" : "@sm/card:grid-cols-3")}>
          <Metric label="RSRP" value={cell.rsrp} unit="dBm" thresholds={RSRP_THRESHOLDS} />
          <Metric label="RSRQ" value={cell.rsrq} unit="dB" thresholds={RSRQ_THRESHOLDS} />
          <Metric label="SINR" value={cell.sinr} unit="dB" thresholds={SINR_THRESHOLDS} note={sinrNote} />
          {has(cell.snr) && (
            <Metric label={t("cell.snr_best")} value={cell.snr} unit="dB" thresholds={SINR_THRESHOLDS} />
          )}
        </div>
        <ChainBars label={t("cell.rsrp_per_antenna")} values={cell.rsrp_rx} unit="dBm" range={RSRP_RANGE} thresholds={RSRP_THRESHOLDS} />
        <ChainBars label={t("cell.snr_per_antenna")} values={cell.snr_rx} unit="dB" range={SINR_RANGE} thresholds={SINR_THRESHOLDS} optional />
        <LinkAdaptation
          cqi={cell.cqi}
          ri={cell.ri}
          layers={cell.dl_layers}
          txPower={cell.tx_power_dbm}
          pcmax={pcmax}
          showTx={has(cell.tx_power_dbm)}
        />
        <LinkTable
          rows={[
            { label: t("cell.link.modulation"), dl: cell.modulation },
            {
              label: t("cell.link.mcs_avg"),
              dl: has(cell.dl_mcs) ? cell.dl_mcs.toFixed(1) : undefined,
              ul: has(cell.ul_mcs) ? cell.ul_mcs.toFixed(1) : undefined,
            },
            { label: t("cell.link.layers_avg"), dl: has(cell.dl_layers) ? cell.dl_layers.toFixed(1) : undefined },
            {
              label: t("cell.link.resource_blocks"),
              dl: has(cell.dl_rb) ? `${cell.dl_rb.toFixed(0)} RB` : undefined,
              ul: has(cell.ul_prb) ? `${cell.ul_prb.toFixed(0)} PRB` : undefined,
            },
            {
              label: t("cell.link.bandwidth"),
              dl: cell.bandwidth_mhz ? `${cell.bandwidth_mhz} MHz` : undefined,
              ul: cell.ul_bandwidth_mhz ? `${cell.ul_bandwidth_mhz} MHz` : undefined,
            },
            { label: t("cell.link.bler"), dl: has(cell.dl_bler) ? <Bler value={cell.dl_bler} /> : undefined },
            {
              label: t("cell.link.throughput"),
              dl: has(cell.dl_mbps) ? <Rate value={cell.dl_mbps} /> : undefined,
              ul: has(cell.ul_mbps) ? <Rate value={cell.ul_mbps} /> : undefined,
            },
            ...(has(cell.pathloss_db)
              ? [{ label: t("cell.link.path_loss"), dl: `${cell.pathloss_db.toFixed(1)} dB` }]
              : []),
            {
              label: t("cell.link.power_headroom"),
              ul: has(cell.phr_db) ? `${cell.phr_db.toFixed(1)} dB` : undefined,
            },
            {
              label: t("cell.link.pcmax"),
              ul: has(pcmax) ? `${pcmax.toFixed(1)} dBm` : undefined,
            },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Detail label={t("cell.detail.ssb")} value={cell.ssb} />
          <Detail label={t("cell.detail.beams")} value={cell.num_beams} />
          <Detail label={t("cell.detail.neighbours")} value={cell.neighbor_cells} />
          <Detail label={t("cell.detail.cell_id")} value={cell.cell_id} />
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
