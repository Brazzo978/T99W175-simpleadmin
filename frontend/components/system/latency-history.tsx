"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useBridgeState } from "@/hooks/use-bridge";

// =============================================================================
// LatencyHistoryCard — the last 24 hours of ping rounds
// =============================================================================
// system_bridge pings its targets every 10 s whether or not a page is open
// and sends the last 24 h on connect; the store keeps appending. Shown as
// the average RTT per 5-minute bucket (a gap where no target answered for a
// whole bucket), with the loss of each bucket in the tooltip.
// =============================================================================

const BUCKET_MS = 5 * 60 * 1000;

const chartConfig = {
  latency: { label: "Average RTT", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface Point {
  time: string;
  latency: number | null;
  loss: number;
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function span(ms: number) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

export default function LatencyHistoryCard() {
  const { latencyHistory, latencyIntervalSec, latencyLastAt } =
    useBridgeState();

  const { points, summary } = useMemo(() => {
    const n = latencyHistory.length;
    if (!n || !latencyLastAt) return { points: [] as Point[], summary: null };
    const step = (latencyIntervalSec || 10) * 1000;
    const buckets = new Map<number, { sum: number; ok: number; all: number }>();
    let okSum = 0;
    let okCount = 0;
    latencyHistory.forEach((rtt, i) => {
      const at = latencyLastAt - (n - 1 - i) * step;
      const key = Math.floor(at / BUCKET_MS) * BUCKET_MS;
      const b = buckets.get(key) ?? { sum: 0, ok: 0, all: 0 };
      b.all++;
      if (rtt !== null) {
        b.sum += rtt;
        b.ok++;
        okSum += rtt;
        okCount++;
      }
      buckets.set(key, b);
    });
    const points: Point[] = [...buckets.entries()].map(([key, b]) => ({
      time: clock(key),
      latency: b.ok ? Math.round(b.sum / b.ok) : null,
      loss: Math.round(((b.all - b.ok) / b.all) * 100),
    }));
    return {
      points,
      summary: {
        avg: okCount ? Math.round(okSum / okCount) : null,
        loss: Math.round(((n - okCount) / n) * 100),
        covered: span(n * step),
      },
    };
  }, [latencyHistory, latencyIntervalSec, latencyLastAt]);

  const footer = [
    { label: "Average", value: summary?.avg != null ? `${summary.avg} ms` : "-" },
    { label: "Loss", value: summary ? `${summary.loss}%` : "-" },
    { label: "Covered", value: summary?.covered ?? "-" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latency, Last 24 Hours</CardTitle>
        <CardDescription>
          Average ping time of the targets above per 5 minutes. system_bridge
          measures every 10 seconds, also while no page is open.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No samples yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <LineChart accessibilityLayer data={points} margin={{ left: 0, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={40}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
                tickFormatter={(value: number) => `${value} ms`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => `${value}`}
                    formatter={(value, _name, item) => (
                      <div className="flex w-full items-baseline justify-between gap-4">
                        <span className="text-muted-foreground">Average RTT</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {value} ms
                          {(item.payload as Point).loss
                            ? `, ${(item.payload as Point).loss}% lost`
                            : ""}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Line
                dataKey="latency"
                type="monotone"
                stroke="var(--color-latency)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter>
        <div className="grid w-full grid-cols-3 gap-2 text-sm">
          {footer.map((item) => (
            <div key={item.label} className="grid gap-1">
              <span className="text-muted-foreground leading-none">{item.label}</span>
              <span className="font-semibold tabular-nums leading-none">{item.value}</span>
            </div>
          ))}
        </div>
      </CardFooter>
    </Card>
  );
}
