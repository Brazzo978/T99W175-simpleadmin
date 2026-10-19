"use client";

import { useMemo, useState } from "react";
import { RadioTowerIcon } from "lucide-react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RadioSample } from "@/lib/bridge/radio-history";
import { cn } from "@/lib/utils";
import type { ChainValues } from "@/types/bridge";
import {
  RSRP_THRESHOLDS,
  SINR_THRESHOLDS,
  type SignalThresholds,
} from "@/types/modem-status";
import {
  CHAINS,
  activeChains,
  chainStats,
  chainValue,
  isChainActive,
  stripDomain,
  type ChainMetric,
} from "../antenna/chains";
import {
  ChainMeter,
  ChainStatusBadge,
  RSRP_RANGE,
  RangeStrip,
  SINR_RANGE,
  SpreadNote,
} from "../antenna/chain-meters";
import { Metric } from "../signal/cell-cards";
import { quality, type Rat } from "../signal/metrics";

export interface CellMetric {
  label: string;
  value: number | null | undefined;
  unit: string;
  thresholds?: SignalThresholds;
  note?: string;
}

/** The card a RAT gets when the modem has no cell of it. */
export function NoCellCard({ title, rat }: { title: string; rat: Rat }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Per-chain RSRP and {rat === "nr" ? "SNR" : "SINR"}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty className="border bg-muted/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RadioTowerIcon />
            </EmptyMedia>
            <EmptyTitle>{rat === "nr" ? "No 5G cell" : "No LTE cell"}</EmptyTitle>
            <EmptyDescription className="max-w-xs text-pretty">
              {rat === "nr"
                ? "Chains appear while the modem uses a 5G NR cell (NSA or SA)."
                : "Chains appear while the modem is attached to an LTE cell."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

/** Live view of the four receive chains of one serving cell. */
export function LiveChainsCard({
  title,
  description,
  mask,
  rsrp,
  sinr,
  sinrLabel,
  metrics,
  footnote,
}: {
  title: string;
  description: string;
  mask: number;
  rsrp: ChainValues | undefined;
  sinr: ChainValues | undefined;
  sinrLabel: "SINR" | "SNR";
  metrics: CellMetric[];
  footnote?: string;
}) {
  // A RAT whose chains never carry SINR/SNR gets RSRP rows only.
  const hasSinr = CHAINS.some((_, i) => chainValue(sinr, i) !== null);
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            {activeChains(mask)} of 4 chains
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 @sm/card:grid-cols-4">
          {metrics.map((m) => (
            <Metric key={m.label} {...m} />
          ))}
        </div>
        <div className="grid gap-3 @xl/card:grid-cols-2">
          {CHAINS.map((port, i) => {
            const active = isChainActive(mask, i);
            const name = `${port.name} (${port.rx})`;
            return (
              <div
                key={port.rx}
                role="group"
                aria-label={`${name}, ${active ? "in use" : "not used"}`}
                className={cn(
                  "grid content-start gap-2 rounded-lg border p-3 transition-opacity",
                  !active && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-medium">{port.name}</span>
                    <span className="text-xs text-muted-foreground">{port.rx}</span>
                  </span>
                  <ChainStatusBadge active={active} />
                </div>
                <ChainMeter
                  label="RSRP"
                  value={chainValue(rsrp, i)}
                  unit="dBm"
                  range={RSRP_RANGE}
                  thresholds={RSRP_THRESHOLDS}
                  name={name}
                />
                {hasSinr && (
                  <ChainMeter
                    label={sinrLabel}
                    value={chainValue(sinr, i)}
                    unit="dB"
                    range={SINR_RANGE}
                    thresholds={SINR_THRESHOLDS}
                    name={name}
                  />
                )}
              </div>
            );
          })}
        </div>
        <SpreadNote rsrp={rsrp} />
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

/** How each chain of one RAT spread over the window. */
export function ChainStatsCard({
  title,
  rat,
  samples,
}: {
  title: string;
  rat: Rat;
  samples: RadioSample[];
}) {
  const [metric, setMetric] = useState<ChainMetric>("rsrp");
  const sinrLabel = rat === "nr" ? "SNR" : "SINR";
  const def =
    metric === "rsrp"
      ? { label: "RSRP", unit: "dBm", thresholds: RSRP_THRESHOLDS }
      : { label: sinrLabel, unit: "dB", thresholds: SINR_THRESHOLDS };
  const { cellSamples, chains } = useMemo(
    () => chainStats(samples, rat, metric),
    [samples, rat, metric],
  );
  const reported = chains.filter((c) => c.summary !== null);
  const domain = stripDomain(reported.map((c) => c.summary!));
  const emptyHint =
    metric === "sinr"
      ? rat === "nr"
        ? " Not every firmware logs the per-chain SNR."
        : " Per-chain SINR comes from DIAG only."
      : "";
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {def.label} of each chain over the window, {cellSamples} sample
          {cellSamples === 1 ? "" : "s"}: the bar spans the 10th to 90th
          percentile, the tick marks the median.
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={metric}
            onValueChange={(v) => v && setMetric(v as ChainMetric)}
            aria-label={`${title} metric`}
          >
            <ToggleGroupItem value="rsrp" className="px-2.5">
              RSRP
            </ToggleGroupItem>
            <ToggleGroupItem value="sinr" className="px-2.5">
              {sinrLabel}
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {reported.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
            No per-chain {def.label} samples in this window.{emptyHint}
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              {chains.map((c) => {
                const port = CHAINS[c.index];
                const name = `${port.name} (${port.rx})`;
                return (
                  <div
                    key={port.rx}
                    className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-sm"
                  >
                    <span className="truncate text-muted-foreground">{port.name}</span>
                    {c.summary ? (
                      <RangeStrip
                        summary={c.summary}
                        domain={domain}
                        rat={rat}
                        unit={def.unit}
                        name={name}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Not reported</span>
                    )}
                    <span className="text-right tabular-nums">
                      {c.summary ? c.summary.median.toFixed(1) : "—"}
                    </span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[5.5rem_1fr_4.5rem] gap-3 text-[11px] text-muted-foreground tabular-nums">
                <span />
                <span className="flex justify-between">
                  <span>{domain[0]}</span>
                  <span>{def.unit}</span>
                  <span>{domain[1]}</span>
                </span>
                <span className="text-right">median</span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-xs">Chain</TableHead>
                  <TableHead className="h-8 text-right text-xs">Mean</TableHead>
                  <TableHead className="hidden h-8 text-right text-xs @sm/card:table-cell">
                    Std dev
                  </TableHead>
                  <TableHead className="h-8 text-right text-xs">vs Main</TableHead>
                  <TableHead className="h-8 text-right text-xs">Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chains.map((c) => {
                  const port = CHAINS[c.index];
                  const s = c.summary;
                  return (
                    <TableRow key={port.rx}>
                      <TableCell className="py-1.5">
                        {port.name}{" "}
                        <span className="text-xs text-muted-foreground">{port.rx}</span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-1.5 text-right font-medium tabular-nums",
                          s && getValueColorClass(quality(s.mean, def.thresholds)),
                        )}
                      >
                        {s ? s.mean.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell className="hidden py-1.5 text-right tabular-nums @sm/card:table-cell">
                        {c.sd !== null ? c.sd.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">
                        {c.index === 0 ? (
                          <span className="text-muted-foreground">ref</span>
                        ) : c.vsMain !== null ? (
                          signed(c.vsMain)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">
                        {Math.round(c.seen * 100)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Values in {def.unit}. vs Main is the mean gap to the Main chain
              over the samples where both report; Seen is the share of the
              window&apos;s samples in which the chain reported.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
