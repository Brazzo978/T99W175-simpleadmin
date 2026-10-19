"use client";

import {
  CheckCircle2Icon,
  MinusCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { getValueColorClass } from "@/components/dashboard/signal-card-utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChainValues } from "@/types/bridge";
import type { SignalThresholds } from "@/types/modem-status";
import { RangeMeter } from "../signal/meters";
import { fmt, quality, type Rat, type Summary } from "../signal/metrics";
import { CHAINS, SPREAD_UNEVEN_DB, chainSpread } from "./chains";

// Live meters share the Signal Details scales: RSRP on -140..-44 dBm,
// SINR/SNR on -20..30 dB.
export const RSRP_RANGE = [-140, -44] as const;
export const SINR_RANGE = [-20, 30] as const;

export function ChainStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge
      variant="outline"
      className="border-success/30 bg-success/15 text-success hover:bg-success/20"
    >
      <CheckCircle2Icon className="size-3" />
      In use
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-muted-foreground/30 bg-muted/50 text-muted-foreground"
    >
      <MinusCircleIcon className="size-3" />
      Not used
    </Badge>
  );
}

/** One live value of a chain: label, quality-tinted bar, value. */
export function ChainMeter({
  label,
  value,
  unit,
  range,
  thresholds,
  name,
}: {
  label: string;
  value: number | null;
  unit: string;
  range: readonly [number, number];
  thresholds: SignalThresholds;
  /** Chain name, for the meter's accessible label */
  name: string;
}) {
  const q = quality(value, thresholds);
  return (
    <div className="grid grid-cols-[2.75rem_1fr_5.5rem] items-center gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <RangeMeter
        value={value}
        min={range[0]}
        max={range[1]}
        quality={q}
        label={`${label} ${name}`}
      />
      <span
        className={cn(
          "text-right font-semibold tabular-nums transition-colors",
          value === null ? "text-muted-foreground" : getValueColorClass(q),
        )}
      >
        {fmt(value, unit)}
      </span>
    </div>
  );
}

/** RSRP gap between the strongest and the weakest chain that reports. */
export function SpreadNote({ rsrp }: { rsrp: ChainValues | undefined }) {
  const spread = chainSpread(rsrp);
  if (!spread) return null;
  const uneven = spread.spread >= SPREAD_UNEVEN_DB;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm"
      role="status"
    >
      <span className="text-muted-foreground">
        RSRP spread{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {spread.spread.toFixed(1)} dB
        </span>
        , strongest {CHAINS[spread.best].name}, weakest{" "}
        {CHAINS[spread.worst].name}
      </span>
      {uneven ? (
        <Badge
          variant="outline"
          className="border-warning/30 bg-warning/15 text-warning hover:bg-warning/20"
        >
          <TriangleAlertIcon className="size-3" />
          Uneven
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-success/30 bg-success/15 text-success hover:bg-success/20"
        >
          <CheckCircle2Icon className="size-3" />
          Balanced
        </Badge>
      )}
    </div>
  );
}

const BAND_FILL: Record<Rat, string> = {
  lte: "bg-chart-lte",
  nr: "bg-chart-nr",
};

/**
 * Distribution of one chain over a window on a shared axis: a thin line
 * from min to max, a bar from the 10th to the 90th percentile and a tick
 * at the median. Hover or focus shows the numbers.
 */
export function RangeStrip({
  summary,
  domain,
  rat,
  unit,
  name,
}: {
  summary: Summary;
  domain: readonly [number, number];
  rat: Rat;
  unit: string;
  name: string;
}) {
  const at = (v: number) =>
    Math.max(0, Math.min(100, ((v - domain[0]) / (domain[1] - domain[0])) * 100));
  const f = (v: number) => `${v.toFixed(1)} ${unit}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative h-5 cursor-default rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          tabIndex={0}
          role="img"
          aria-label={`${name}: median ${f(summary.median)}, 10th to 90th percentile ${f(summary.p10)} to ${f(summary.p90)}`}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className={cn("absolute top-1/2 h-px -translate-y-1/2 opacity-50", BAND_FILL[rat])}
            style={{ left: `${at(summary.min)}%`, width: `${at(summary.max) - at(summary.min)}%` }}
          />
          <div
            className={cn("absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full", BAND_FILL[rat])}
            style={{
              left: `min(${at(summary.p10)}%, calc(100% - 4px))`,
              width: `max(4px, ${at(summary.p90) - at(summary.p10)}%)`,
            }}
          />
          <div
            className="absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${at(summary.median)}%` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent className="grid gap-0.5 tabular-nums">
        <span className="font-medium">{name}</span>
        <span>Median {f(summary.median)}</span>
        <span>
          P10 to P90 {f(summary.p10)} to {f(summary.p90)}
        </span>
        <span>
          Min {f(summary.min)}, max {f(summary.max)}
        </span>
        <span>{summary.n} samples</span>
      </TooltipContent>
    </Tooltip>
  );
}
