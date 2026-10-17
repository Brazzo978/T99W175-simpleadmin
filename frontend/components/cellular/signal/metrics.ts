// =============================================================================
// Signal Details metrics — labels, units, quality ramps, histograms and
// summary statistics over the radio history
// =============================================================================

import type { CellSample, RadioSample } from "@/lib/bridge/radio-history";
import {
  CQI_THRESHOLDS,
  RSRP_THRESHOLDS,
  RSRQ_THRESHOLDS,
  SINR_THRESHOLDS,
  getSignalQuality,
  type SignalThresholds,
} from "@/types/modem-status";

export { CQI_THRESHOLDS };

export type Quality = "excellent" | "good" | "fair" | "poor" | "none";

/** Lower is better for TX power (23 dBm is the power class 3 maximum). */
export function txPowerQuality(dbm: number | null | undefined): Quality {
  if (typeof dbm !== "number") return "none";
  if (dbm <= 0) return "excellent";
  if (dbm <= 10) return "good";
  if (dbm <= 20) return "fair";
  return "poor";
}

/** Lower is better for BLER; link adaptation aims at 10 %. */
export function blerQuality(bler: number | null | undefined): Quality {
  if (typeof bler !== "number") return "none";
  if (bler <= 0.02) return "excellent";
  if (bler <= 0.1) return "good";
  if (bler <= 0.2) return "fair";
  return "poor";
}

export function quality(
  value: number | null | undefined,
  thresholds: SignalThresholds,
): Quality {
  return getSignalQuality(typeof value === "number" ? value : null, thresholds);
}

/** Fill class for a meter or bar, by quality. */
export function qualityFill(q: Quality): string {
  switch (q) {
    // Same ramp as getValueColorClass(): excellent and good both read green.
    case "excellent":
    case "good":
      return "bg-success";
    case "fair":
      return "bg-warning";
    case "poor":
      return "bg-destructive";
    default:
      return "bg-muted-foreground/40";
  }
}

export function fmt(
  value: number | null | undefined,
  unit = "",
  digits = 1,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const v = value.toFixed(digits);
  return unit ? `${v} ${unit}` : v;
}

export function fmtMbps(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(value < 10 ? 2 : 1);
}

export const pct = (v: number | null | undefined): string =>
  typeof v === "number" ? `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` : "—";

// --- Metric registry ---------------------------------------------------------

export type MetricKey =
  | "rsrp"
  | "rsrq"
  | "sinr"
  | "cqi"
  | "mcs"
  | "ri"
  | "tx_power"
  | "bler";

type Binning =
  /** One bin per integer of a fixed domain (the scale itself is the story) */
  | { kind: "int"; min: number; max: number }
  /** Fixed-width bins spanning the observed range */
  | { kind: "range"; step: number };

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  digits: number;
  binning: Binning;
  /** Quality of a value, for coloring readouts */
  quality: (v: number | null) => Quality;
  /** Multiplier for display (BLER is a ratio, shown in %) */
  scale?: number;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  rsrp: {
    key: "rsrp",
    label: "RSRP",
    unit: "dBm",
    digits: 1,
    binning: { kind: "range", step: 2 },
    quality: (v) => quality(v, RSRP_THRESHOLDS),
  },
  rsrq: {
    key: "rsrq",
    label: "RSRQ",
    unit: "dB",
    digits: 1,
    binning: { kind: "range", step: 1 },
    quality: (v) => quality(v, RSRQ_THRESHOLDS),
  },
  sinr: {
    key: "sinr",
    label: "SINR",
    unit: "dB",
    digits: 1,
    binning: { kind: "range", step: 2 },
    quality: (v) => quality(v, SINR_THRESHOLDS),
  },
  cqi: {
    key: "cqi",
    label: "CQI",
    unit: "",
    digits: 0,
    binning: { kind: "int", min: 0, max: 15 },
    quality: (v) => quality(v, CQI_THRESHOLDS),
  },
  mcs: {
    key: "mcs",
    label: "DL MCS",
    unit: "",
    digits: 1,
    binning: { kind: "int", min: 0, max: 28 },
    quality: () => "none",
  },
  ri: {
    key: "ri",
    label: "Rank",
    unit: "",
    digits: 0,
    binning: { kind: "int", min: 1, max: 4 },
    quality: () => "none",
  },
  tx_power: {
    key: "tx_power",
    label: "TX power",
    unit: "dBm",
    digits: 1,
    binning: { kind: "range", step: 3 },
    quality: (v) => txPowerQuality(v),
  },
  bler: {
    key: "bler",
    label: "DL BLER",
    unit: "%",
    digits: 1,
    binning: { kind: "range", step: 2 },
    quality: (v) => blerQuality(v === null ? null : v / 100),
    scale: 100,
  },
};

// --- Sample access -----------------------------------------------------------

export type Rat = "lte" | "nr";

export function sampleValue(
  cell: CellSample | null,
  key: MetricKey,
  scale = 1,
): number | null {
  if (!cell) return null;
  const v = key === "tx_power" ? cell.tx_power : cell[key];
  return typeof v === "number" ? v * scale : null;
}

export function windowed(
  samples: RadioSample[],
  windowMs: number,
  now: number,
): RadioSample[] {
  const from = now - windowMs;
  let i = samples.length;
  while (i > 0 && samples[i - 1].ts >= from) i--;
  return samples.slice(i);
}

export function seriesValues(
  samples: RadioSample[],
  rat: Rat,
  key: MetricKey,
): number[] {
  const scale = METRICS[key].scale ?? 1;
  const out: number[] = [];
  for (const s of samples) {
    const v = sampleValue(s[rat], key, scale);
    if (v !== null) out.push(v);
  }
  return out;
}

// --- Statistics --------------------------------------------------------------

export interface Summary {
  n: number;
  min: number;
  p10: number;
  median: number;
  mean: number;
  p90: number;
  max: number;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(values: number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1],
  };
}

export interface HistogramBin {
  /** Axis label */
  bin: string;
  /** Range the bin covers, for the tooltip */
  range: string;
  /** Share of the samples of each RAT (%), null when the RAT has none */
  lte: number | null;
  nr: number | null;
  lteCount: number;
  nrCount: number;
}

const MAX_RANGE_BINS = 24;

/** Histogram of both RATs on shared bins, each normalized to its own count. */
export function histogram(
  lte: number[],
  nr: number[],
  def: MetricDef,
): HistogramBin[] {
  const all = [...lte, ...nr];
  if (all.length === 0) return [];
  let edges: number[];
  let integer = false;
  if (def.binning.kind === "int") {
    integer = true;
    edges = [];
    for (let v = def.binning.min; v <= def.binning.max + 1; v++) edges.push(v);
  } else {
    let step = def.binning.step;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    while ((hi - lo) / step > MAX_RANGE_BINS) step *= 2;
    const start = Math.floor(lo / step) * step;
    const end = Math.max(Math.floor(hi / step) * step + step, start + step);
    edges = [];
    for (let v = start; v <= end + 1e-9; v += step) edges.push(+v.toFixed(6));
  }
  const nBins = edges.length - 1;
  const count = (values: number[]) => {
    const c = new Array<number>(nBins).fill(0);
    for (const raw of values) {
      const v = integer ? Math.round(raw) : raw;
      let i = 0;
      while (i < nBins - 1 && v >= edges[i + 1]) i++;
      c[i]++;
    }
    return c;
  };
  const lc = count(lte);
  const nc = count(nr);
  return lc.map((lteCount, i) => {
    const nrCount = nc[i];
    const lo = edges[i];
    const hi = edges[i + 1];
    return {
      bin: `${lo}`,
      range: integer
        ? `${def.label} ${lo}`
        : `${lo} to ${hi} ${def.unit}`.trim(),
      lte: lte.length ? (lteCount / lte.length) * 100 : null,
      nr: nr.length ? (nrCount / nr.length) * 100 : null,
      lteCount,
      nrCount,
    };
  });
}

/** Smallest 1/2/2.5/5 x 10^n at or above v: a clean axis maximum. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** TA command to distance (LTE: 16 Ts per unit, about 78 m one way). */
export function taDistanceM(ta: number): number {
  return ta * 78.12;
}
