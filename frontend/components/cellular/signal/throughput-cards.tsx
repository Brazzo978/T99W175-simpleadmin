"use client";

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { aggregateRates, type RadioSample } from "@/lib/bridge/radio-history";
import type { RadioSource } from "@/lib/bridge/radio";
import type { DiagSnapshot } from "@/types/bridge";
import { carrierRows } from "./carriers";
import { RatLegend, timeTick } from "./controls";
import { fmtMbps, niceCeil, summarize } from "./metrics";

const rateConfig = {
  mbps: { label: "Mbps", color: "var(--chart-3)" },
} satisfies ChartConfig;

function RatePanel({
  label,
  icon,
  current,
  series,
  from,
  to,
}: {
  label: string;
  icon: React.ReactNode;
  current: number | null;
  series: { ts: number; mbps: number | null }[];
  from: number;
  to: number;
}) {
  const { t } = useTranslation("signal");
  const fillId = useId().replace(/:/g, "");
  const values = series.flatMap((p) => (p.mbps === null ? [] : [p.mbps]));
  const stats = summarize(values);
  return (
    <div className="grid gap-2 rounded-lg border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {icon}
          {label}
        </span>
        {stats && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("throughput.peak_avg", { peak: fmtMbps(stats.max), avg: fmtMbps(stats.mean) })}
          </span>
        )}
      </div>
      <span className="text-3xl font-semibold tabular-nums @[640px]/card:text-4xl">
        {current === null ? "—" : fmtMbps(current)}
        <span className="ml-1 text-base font-normal text-muted-foreground">Mbps</span>
      </span>
      {values.length > 1 ? (
        <ChartContainer config={rateConfig} className="aspect-auto h-24 w-full">
          <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-mbps)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-mbps)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="ts" type="number" domain={[from, to]} hide />
            <YAxis hide domain={[0, "auto"]} />
            <ChartTooltip
              cursor={{ strokeWidth: 1 }}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) =>
                    payload?.[0] ? timeTick(payload[0].payload.ts as number) : ""
                  }
                  formatter={(value) => (
                    <span className="font-mono font-medium tabular-nums">
                      {fmtMbps(value as number)} Mbps
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="mbps"
              type="monotone"
              stroke="var(--color-mbps)"
              strokeWidth={2}
              fill={`url(#${fillId})`}
              isAnimationActive={false}
              connectNulls={false}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          {t("throughput.collecting")}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// Aggregate throughput across every carrier, counted by diag_bridge from the
// transport blocks the modem decodes: below the IPA, so hardware-offloaded
// traffic is included, and so are HARQ retransmissions. QMI has no rates.
export function AggregateThroughputCard({
  snapshot,
  source,
  samples,
  from,
  to,
}: {
  snapshot: DiagSnapshot;
  source: RadioSource;
  samples: RadioSample[];
  from: number;
  to: number;
}) {
  const { t } = useTranslation("signal");
  const live = source === "diag";
  const rates = live ? aggregateRates(snapshot) : null;
  const rows = carrierRows(snapshot);
  const bandwidth = rows.reduce((s, r) => s + (r.bandwidth_mhz ?? 0), 0);
  const lte = rows.filter((r) => r.rat === "lte").length;
  const nr = rows.length - lte;
  const efficiency = rates && bandwidth ? rates.dl / bandwidth : null;
  const dl = samples.map((s) => ({ ts: s.ts, mbps: s.dl_mbps }));
  const ul = samples.map((s) => ({ ts: s.ts, mbps: s.ul_mbps }));
  return (
    <Card className="@container/card border-primary/30 bg-primary/5 @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>{t("throughput.aggregate_title")}</CardTitle>
        <CardDescription>
          {live ? t("throughput.aggregate_live") : t("throughput.needs_bridge")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 @[640px]/card:grid-cols-2">
          <RatePanel
            label={t("throughput.download")}
            icon={<ArrowDownIcon className="size-4" />}
            current={rates ? rates.dl : null}
            series={dl}
            from={from}
            to={to}
          />
          <RatePanel
            label={t("throughput.upload")}
            icon={<ArrowUpIcon className="size-4" />}
            current={rates ? rates.ul : null}
            series={ul}
            from={from}
            to={to}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 @[640px]/card:grid-cols-4">
          <Stat label={t("throughput.aggregated_bandwidth")} value={bandwidth ? `${bandwidth} MHz` : "—"} />
          <Stat
            label={t("throughput.carriers")}
            value={[lte ? `${lte} LTE` : "", nr ? `${nr} NR` : ""].filter(Boolean).join(" + ") || "—"}
          />
          <Stat
            label={t("throughput.spectral_efficiency")}
            value={efficiency === null ? "—" : `${efficiency.toFixed(2)} b/s/Hz`}
          />
          <Stat
            label={t("throughput.ul_dl_ratio")}
            value={rates && rates.dl > 0.05 ? `${((rates.ul / rates.dl) * 100).toFixed(0)}%` : "—"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const carrierConfig = {
  mbps: { label: "Mbps" },
} satisfies ChartConfig;

function CarrierBars({
  title,
  data,
  total,
}: {
  title: string;
  data: { name: string; rat: "lte" | "nr"; mbps: number }[];
  total: number;
}) {
  const { t } = useTranslation("signal");
  const height = Math.max(96, data.length * 36 + 24);
  const top = niceCeil(Math.max(1, ...data.map((d) => d.mbps)));
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("throughput.total", { total: fmtMbps(total) })}
        </span>
      </div>
      <ChartContainer config={carrierConfig} className="aspect-auto w-full" style={{ height }}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            dataKey="mbps"
            domain={[0, top]}
            ticks={[0, top / 2, top]}
            tickFormatter={(v: number) => `${v}`}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
          />
          <YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value) => {
                  const v = value as number;
                  const share = total > 0 ? ` (${((v / total) * 100).toFixed(0)}%)` : "";
                  return (
                    <span className="font-mono font-medium tabular-nums">
                      {fmtMbps(v)} Mbps{share}
                    </span>
                  );
                }}
              />
            }
          />
          <Bar dataKey="mbps" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.rat === "lte" ? "var(--chart-lte)" : "var(--chart-nr)"} />
            ))}
            <LabelList
              dataKey="mbps"
              position="right"
              offset={8}
              className="fill-foreground"
              fontSize={12}
              formatter={(v: number) => fmtMbps(v)}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Small multiples, DL and UL: their scales differ by an order of magnitude. */
export function CarrierThroughputCard({
  snapshot,
  source,
}: {
  snapshot: DiagSnapshot;
  source: RadioSource;
}) {
  const { t } = useTranslation("signal");
  const rows = carrierRows(snapshot).filter((r) => r.measured || r.dl_mbps || r.ul_mbps);
  const live = source === "diag";
  const rates = live ? aggregateRates(snapshot) : { dl: 0, ul: 0 };
  const dl = rows.map((r) => ({ name: r.name, rat: r.rat, mbps: r.dl_mbps ?? 0 }));
  const ul = rows.map((r) => ({ name: r.name, rat: r.rat, mbps: r.ul_mbps ?? 0 }));
  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>{t("throughput.by_carrier_title")}</CardTitle>
        <CardDescription>{t("throughput.by_carrier_description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!live ? (
          <p className="text-sm text-muted-foreground">{t("throughput.needs_bridge")}</p>
        ) : (
          <>
            <div className="grid gap-6 @[640px]/card:grid-cols-2">
              <CarrierBars title={t("throughput.download")} data={dl} total={rates.dl} />
              <CarrierBars title={t("throughput.upload")} data={ul} total={rates.ul} />
            </div>
            <RatLegend lte={rows.some((r) => r.rat === "lte")} nr={rows.some((r) => r.rat === "nr")} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
