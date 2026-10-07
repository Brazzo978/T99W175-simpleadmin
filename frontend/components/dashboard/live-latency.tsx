"use client";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CartesianGrid, Line, LineChart } from "recharts";
import {
  Card,
  CardContent,
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

import type { ConnectivityStatus } from "@/types/modem-status";

// =============================================================================
// Data Wiring
// =============================================================================
// system_bridge's ping check gives an RTT history as (number | null)[] where
// null = no answer.
// We show the last 10 data points. For each point:
//   - latency: the RTT in ms (rounded), or 0 if timeout
//   - packetloss: rolling % of null entries in a 10-sample window ending at
//                 that point (gives a smoothed per-point loss indicator)
// =============================================================================

/** How many points to show on the chart */
const CHART_POINTS = 10;

/** Rolling window size for per-point packet loss calculation */
const LOSS_WINDOW = 10;

interface LiveLatencyComponentProps {
  connectivity: ConnectivityStatus | null;
  isLoading: boolean;
}

const chartConfig = {
  latency: {
    label: "Latency",
    color: "var(--chart-1)",
  },
  packetloss: {
    label: "Packetloss",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const LiveLatencyComponent = ({ connectivity }: LiveLatencyComponentProps) => {
  const { t } = useTranslation("dashboard");
  const chartData = useMemo(() => {
    if (
      !connectivity?.latency_history ||
      connectivity.latency_history.length === 0
    ) {
      return [];
    }

    const history = connectivity.latency_history;
    const interval = connectivity.history_interval_sec || 2;

    // We need the last CHART_POINTS entries for display, but also preceding
    // entries for the rolling packet-loss window calculation.
    const endIdx = history.length;
    const startIdx = Math.max(0, endIdx - CHART_POINTS);
    const displaySlice = history.slice(startIdx, endIdx);

    return displaySlice.map((rtt, i) => {
      // Absolute index in the full history array
      const absIdx = startIdx + i;

      // Time label: seconds ago counting back from the most recent entry
      const secsAgo = (displaySlice.length - 1 - i) * interval;
      const timeLabel = secsAgo === 0 ? "Now" : `-${secsAgo}s`;

      // Rolling packet loss: look back LOSS_WINDOW entries ending at absIdx
      const windowStart = Math.max(0, absIdx - LOSS_WINDOW + 1);
      const window = history.slice(windowStart, absIdx + 1);
      const nullCount = window.filter((v) => v === null).length;
      const lossPct = Math.round((nullCount / window.length) * 100);

      return {
        time: timeLabel,
        latency: rtt !== null ? Math.round(rtt) : 0,
        packetloss: lossPct,
      };
    });
  }, [connectivity?.latency_history, connectivity?.history_interval_sec]);

  const formatMs = (value: number | null | undefined) =>
    typeof value === "number" ? `${Math.round(value)} ms` : "-";
  const summary = [
    { label: t("latency.avg"), value: formatMs(connectivity?.avg_latency_ms) },
    { label: t("latency.jitter"), value: formatMs(connectivity?.jitter_ms) },
    {
      label: t("latency.loss"),
      value: connectivity ? `${connectivity.packet_loss_pct}%` : "-",
    },
  ];

  return (
    <>
      <Card className="@container/card">
        <CardHeader className="-mb-4">
          <CardTitle className="text-lg font-semibold">
            {t("latency.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <>
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
                          style={
                            {
                              "--color-bg": `var(--color-${name})`,
                            } as React.CSSProperties
                          }
                        />
                        {name === "latency"
                          ? t("latency.chart_latency")
                          : name === "packetloss"
                            ? t("latency.chart_packetloss")
                            : name}
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                          {value}
                          <span className="font-normal text-muted-foreground">
                            {name === "latency" ? "ms" : "%"}
                          </span>
                        </div>
                      </>
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
              />
              <Line
                dataKey="packetloss"
                type="monotone"
                stroke="var(--color-packetloss)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
        <CardFooter>
          <div className="grid w-full grid-cols-3 gap-2 text-sm">
            {summary.map((item) => (
              <div key={item.label} className="grid gap-1">
                <span className="text-muted-foreground leading-none">
                  {item.label}
                </span>
                <span className="font-semibold tabular-nums leading-none">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </CardFooter>
      </Card>
    </>
  );
};

export default LiveLatencyComponent;
