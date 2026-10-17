"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RadioSample } from "@/lib/bridge/radio-history";
import { cn } from "@/lib/utils";
import { MetricPicker, timeTick } from "./controls";
import {
  METRICS,
  histogram,
  niceCeil,
  sampleValue,
  seriesValues,
  summarize,
  type MetricDef,
  type MetricKey,
  type Summary,
} from "./metrics";

const ratConfig = {
  lte: { label: "LTE", color: "var(--chart-lte)" },
  nr: { label: "5G NR", color: "var(--chart-nr)" },
} satisfies ChartConfig;

const TREND_METRICS: MetricKey[] = ["rsrp", "rsrq", "sinr", "cqi", "mcs", "tx_power", "bler"];
const DIST_METRICS: MetricKey[] = ["cqi", "mcs", "ri", "sinr", "rsrp", "tx_power", "bler"];

function fmtValue(v: number, def: MetricDef): string {
  const s = v.toFixed(def.digits);
  return def.unit ? `${s} ${def.unit}` : s;
}

function EmptyChart({ height, children }: { height: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-center rounded-lg border bg-muted/30 px-4 text-center text-sm text-muted-foreground", height)}>
      {children}
    </div>
  );
}

/** One metric over time, LTE PCell against the first NR cell. */
export function TrendCard({ samples, from, to }: { samples: RadioSample[]; from: number; to: number }) {
  const [key, setKey] = useState<MetricKey>("sinr");
  const def = METRICS[key];
  const scale = def.scale ?? 1;
  const data = useMemo(
    () =>
      samples.map((s) => ({
        ts: s.ts,
        lte: sampleValue(s.lte, key, scale),
        nr: sampleValue(s.nr, key, scale),
      })),
    [samples, key, scale],
  );
  const hasLte = data.some((d) => d.lte !== null);
  const hasNr = data.some((d) => d.nr !== null);
  // The newest sample only: an older value is not "now" (TX power stops
  // being reported as soon as the modem stops transmitting).
  const latest = (rat: "lte" | "nr") => data[data.length - 1]?.[rat] ?? null;
  const stats = [
    { name: "LTE", swatch: "bg-chart-lte", now: latest("lte"), s: summarize(seriesValues(samples, "lte", key)) },
    { name: "5G NR", swatch: "bg-chart-nr", now: latest("nr"), s: summarize(seriesValues(samples, "nr", key)) },
  ].filter((r) => r.s);
  const f = (v: number | null) => (v === null ? "—" : v.toFixed(def.digits));
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Trends</CardTitle>
        <CardDescription>
          {def.label}
          {def.unit ? ` (${def.unit})` : ""} over the window, PCell against the 5G cell.
        </CardDescription>
        <CardAction>
          <MetricPicker value={key} onChange={setKey} options={TREND_METRICS} ariaLabel="Trend metric" />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!hasLte && !hasNr ? (
          <EmptyChart height="h-[240px]">
            No {def.label} samples in this window.
            {key === "tx_power" ? " The modem reports TX power only while it transmits." : ""}
          </EmptyChart>
        ) : (
          <ChartContainer config={ratConfig} className="aspect-auto h-[240px] w-full">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                domain={[from, to]}
                tickFormatter={timeTick}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
              />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                domain={
                  def.binning.kind === "int"
                    ? [def.binning.min, def.binning.max]
                    : [(min: number) => Math.floor(min - 2), (max: number) => Math.ceil(max + 2)]
                }
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={{ strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) =>
                      payload?.[0] ? timeTick(payload[0].payload.ts as number) : ""
                    }
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{ratConfig[name as "lte" | "nr"].label}</span>
                        <span className="font-mono font-medium tabular-nums">
                          {fmtValue(value as number, def)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              {hasLte && (
                <Line dataKey="lte" type="monotone" stroke="var(--color-lte)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              )}
              {hasNr && (
                <Line dataKey="nr" type="monotone" stroke="var(--color-nr)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              )}
              <ChartLegend content={<ChartLegendContent />} />
            </LineChart>
          </ChartContainer>
        )}
        {stats.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs">{def.label}{def.unit ? ` (${def.unit})` : ""}</TableHead>
                <TableHead className="h-8 text-right text-xs">Now</TableHead>
                <TableHead className="h-8 text-right text-xs">Min</TableHead>
                <TableHead className="h-8 text-right text-xs">Mean</TableHead>
                <TableHead className="h-8 text-right text-xs">Max</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map(({ name, swatch, now, s }) => (
                <TableRow key={name}>
                  <TableCell className="py-1.5">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-[2px]", swatch)} aria-hidden />
                      {name}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-medium tabular-nums">{f(now)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{f(s!.min)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{f(s!.mean)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{f(s!.max)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTable({ lte, nr, def }: { lte: Summary | null; nr: Summary | null; def: MetricDef }) {
  const rows = [
    { name: "LTE", swatch: "bg-chart-lte", s: lte },
    { name: "5G NR", swatch: "bg-chart-nr", s: nr },
  ].filter((r) => r.s);
  if (rows.length === 0) return null;
  const f = (v: number) => v.toFixed(def.digits === 0 ? 1 : def.digits);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 text-xs">{def.label}{def.unit ? ` (${def.unit})` : ""}</TableHead>
          <TableHead className="h-8 text-right text-xs">Samples</TableHead>
          <TableHead className="h-8 text-right text-xs">Min</TableHead>
          <TableHead className="h-8 text-right text-xs">P10</TableHead>
          <TableHead className="h-8 text-right text-xs">Median</TableHead>
          <TableHead className="h-8 text-right text-xs">Mean</TableHead>
          <TableHead className="h-8 text-right text-xs">P90</TableHead>
          <TableHead className="h-8 text-right text-xs">Max</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ name, swatch, s }) => (
          <TableRow key={name}>
            <TableCell className="py-1.5">
              <span className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-[2px]", swatch)} aria-hidden />
                {name}
              </span>
            </TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{s!.n}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{f(s!.min)}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{f(s!.p10)}</TableCell>
            <TableCell className="py-1.5 text-right font-medium tabular-nums">{f(s!.median)}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{f(s!.mean)}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{f(s!.p90)}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{f(s!.max)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Histogram of one metric, each RAT normalized to its own sample count. */
export function DistributionCard({ samples }: { samples: RadioSample[] }) {
  const [key, setKey] = useState<MetricKey>("cqi");
  const def = METRICS[key];
  const { bins, lteSum, nrSum } = useMemo(() => {
    const lte = seriesValues(samples, "lte", key);
    const nr = seriesValues(samples, "nr", key);
    return { bins: histogram(lte, nr, def), lteSum: summarize(lte), nrSum: summarize(nr) };
  }, [samples, key, def]);
  const hasLte = lteSum !== null;
  const hasNr = nrSum !== null;
  const top = Math.min(
    100,
    niceCeil(Math.max(1, ...bins.flatMap((b) => [b.lte ?? 0, b.nr ?? 0]))),
  );
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Distributions</CardTitle>
        <CardDescription>
          Share of the window&apos;s samples in each {def.label} bin, per radio technology.
        </CardDescription>
        <CardAction>
          <MetricPicker value={key} onChange={setKey} options={DIST_METRICS} ariaLabel="Distribution metric" />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {bins.length === 0 ? (
          <EmptyChart height="h-[240px]">
            No {def.label} samples in this window.
            {key === "tx_power" ? " The modem reports TX power only while it transmits." : ""}
          </EmptyChart>
        ) : (
          <ChartContainer config={ratConfig} className="aspect-auto h-[240px] w-full">
            <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bin" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={8} />
              <YAxis
                width={40}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, top]}
                ticks={[0, top / 2, top]}
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => (payload?.[0]?.payload.range as string) ?? ""}
                    formatter={(value, name, item) => {
                      const rat = name as "lte" | "nr";
                      const n = rat === "lte" ? item.payload.lteCount : item.payload.nrCount;
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">{ratConfig[rat].label}</span>
                          <span className="font-mono font-medium tabular-nums">
                            {(value as number).toFixed(1)}% · {n}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              {hasLte && <Bar dataKey="lte" fill="var(--color-lte)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
              {hasNr && <Bar dataKey="nr" fill="var(--color-nr)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        )}
        <SummaryTable lte={lteSum} nr={nrSum} def={def} />
      </CardContent>
    </Card>
  );
}
