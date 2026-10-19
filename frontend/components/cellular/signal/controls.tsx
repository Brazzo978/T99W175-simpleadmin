"use client";

import {
  CheckCircle2Icon,
  MinusCircleIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RadioSource } from "@/lib/bridge/radio";
import type { MetricKey } from "./metrics";

export const WINDOWS = [
  { ms: 60_000, label: "1 min" },
  { ms: 300_000, label: "5 min" },
  { ms: 600_000, label: "10 min" },
] as const;

export function SourceBadge({ source }: { source: RadioSource }) {
  const { t } = useTranslation("signal");
  if (source === "diag") {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/15 text-success hover:bg-success/20">
        <CheckCircle2Icon className="size-3" />
        {t("source_badge.diag")}
      </Badge>
    );
  }
  if (source === "qmi") {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning hover:bg-warning/20">
        <TriangleAlertIcon className="size-3" />
        {t("source_badge.qmi")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 bg-muted/50 text-muted-foreground">
      <MinusCircleIcon className="size-3" />
      {t("source_badge.none")}
    </Badge>
  );
}

/** The one filter row: it scopes every chart and distribution below it. */
export function SignalToolbar({
  source,
  windowMs,
  onWindow,
  samples,
  onReset,
}: {
  source: RadioSource;
  windowMs: number;
  onWindow: (ms: number) => void;
  samples: number;
  onReset: () => void;
}) {
  const { t } = useTranslation("signal");
  return (
    <div className="flex flex-wrap items-center gap-3 @3xl/main:col-span-2" role="toolbar" aria-label={t("toolbar.aria")}>
      <SourceBadge source={source} />
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("toolbar.window")}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(windowMs)}
          onValueChange={(v) => v && onWindow(Number(v))}
        >
          {WINDOWS.map((w) => (
            <ToggleGroupItem key={w.ms} value={String(w.ms)} className="px-3">
              {w.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <span className="text-sm text-muted-foreground tabular-nums" role="status" aria-live="polite">
        {t("toolbar.samples", { count: samples })}
      </span>
      <Button variant="outline" size="sm" className="ml-auto" onClick={onReset}>
        <RotateCcwIcon />
        {t("toolbar.reset")}
      </Button>
    </div>
  );
}

/** Metric picker: toggle group on wide cards, select on narrow ones. */
export function MetricPicker({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: MetricKey;
  onChange: (key: MetricKey) => void;
  options: MetricKey[];
  ariaLabel: string;
}) {
  const { t } = useTranslation("signal");
  return (
    <>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        onValueChange={(v) => v && onChange(v as MetricKey)}
        className="hidden *:data-[slot=toggle-group-item]:px-2.5! @[560px]/card:flex"
        aria-label={ariaLabel}
      >
        {options.map((key) => (
          <ToggleGroupItem key={key} value={key}>
            {t(`metrics.${key}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select value={value} onValueChange={(v) => onChange(v as MetricKey)}>
        <SelectTrigger size="sm" className="w-32 @[560px]/card:hidden" aria-label={ariaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {options.map((key) => (
            <SelectItem key={key} value={key} className="rounded-lg">
              {t(`metrics.${key}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function timeTick(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Swatch legend for charts whose marks are colored per item (by RAT). */
export function RatLegend({ lte, nr }: { lte: boolean; nr: boolean }) {
  if (!lte && !nr) return null;
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
      {lte && (
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-chart-lte" aria-hidden />
          LTE
        </span>
      )}
      {nr && (
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-chart-nr" aria-hidden />
          5G NR
        </span>
      )}
    </div>
  );
}
