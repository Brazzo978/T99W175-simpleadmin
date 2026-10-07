"use client";

import { useMemo } from "react";
import { useBridgeState } from "@/hooks/use-bridge";
import type { SignalHistoryEntry } from "@/types/modem-status";

// =============================================================================
// useSignalHistory — per-antenna signal history for the dashboard chart
// =============================================================================
// Reads the samples the bridge store takes every 10 s from the live radio
// data, and turns the latest ones into chart points with the best antenna
// value per RAT.
//
// Usage:
//   const { chartData, isLoading, error } = useSignalHistory();
// =============================================================================

/** Chart points shown: the most recent samples, for readability */
const CHART_POINTS = 10;

// --- Types -------------------------------------------------------------------

/** Shape expected by the Recharts AreaChart in signal-history.tsx */
export interface SignalChartPoint {
  /** Formatted time string, e.g. "14:32" */
  time: string;
  /** Best-antenna LTE RSRP (dBm), or null if no LTE data */
  rsrp4G: number | null;
  /** Best-antenna NR RSRP (dBm), or null if no NR data */
  rsrp5G: number | null;
  /** Best-antenna LTE RSRQ (dB) */
  rsrq4G: number | null;
  /** Best-antenna NR RSRQ (dB) */
  rsrq5G: number | null;
  /** Best-antenna LTE SINR (dB) */
  sinr4G: number | null;
  /** Best-antenna NR SINR (dB) */
  sinr5G: number | null;
}

export interface UseSignalHistoryReturn {
  /** Chart-ready data points (oldest first) */
  chartData: SignalChartPoint[];
  /** Raw history entries, oldest first */
  raw: SignalHistoryEntry[];
  /** True until the first sample */
  isLoading: boolean;
  /** Always null: the samples are taken locally */
  error: string | null;
}

// --- Helpers -----------------------------------------------------------------

/**
 * Returns the best (highest / least negative) non-null value from a 4-element
 * antenna array. For RSRP/RSRQ/SINR, higher is always better.
 * Returns null if all values are null.
 */
function bestAntenna(values: (number | null)[]): number | null {
  let best: number | null = null;
  for (const v of values) {
    if (v !== null && (best === null || v > best)) {
      best = v;
    }
  }
  return best;
}

/**
 * Transforms a raw SignalHistoryEntry into a chart point.
 */
function toChartPoint(entry: SignalHistoryEntry): SignalChartPoint {
  const date = new Date(entry.ts * 1000);
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return {
    time,
    rsrp4G: bestAntenna(entry.lte_rsrp),
    rsrp5G: bestAntenna(entry.nr_rsrp),
    rsrq4G: bestAntenna(entry.lte_rsrq),
    rsrq5G: bestAntenna(entry.nr_rsrq),
    sinr4G: bestAntenna(entry.lte_sinr),
    sinr5G: bestAntenna(entry.nr_sinr),
  };
}

// --- Hook --------------------------------------------------------------------

export function useSignalHistory(): UseSignalHistoryReturn {
  const { signalHistory: raw } = useBridgeState();
  const chartData = useMemo(
    () => raw.slice(-CHART_POINTS).map(toChartPoint),
    [raw],
  );
  return { chartData, raw, isLoading: raw.length === 0, error: null };
}
