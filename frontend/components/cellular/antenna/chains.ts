// =============================================================================
// Receive chains — which of the four the modem uses, and per-chain
// statistics over the radio history (Antenna Statistics, Antenna Alignment)
// =============================================================================
// The modem measures up to four receive chains per cell: PRX (main), DRX
// (diversity) and two MIMO chains. diag_bridge sends the chains in use as a
// bit mask (rx_diversity); for QMI radio.ts derives it from the chains that
// report. Which connector feeds which chain depends on the band and on the
// modem's RF configuration.
// =============================================================================

import type { RadioSample } from "@/lib/bridge/radio-history";
import type { ChainValues } from "@/types/bridge";
import { ANTENNA_PORTS } from "@/types/modem-status";
import { summarize, type Rat, type Summary } from "../signal/metrics";

export const CHAINS = ANTENNA_PORTS;

/** Above this RSRP gap one chain is clearly weaker than the others: a loose
 *  connector, a damaged cable or an antenna element facing elsewhere. */
export const SPREAD_UNEVEN_DB = 6;

const has = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function chainValue(
  values: ChainValues | null | undefined,
  index: number,
): number | null {
  const v = values?.[index];
  return has(v) ? v : null;
}

/** Chains in use: the bridge mask, else the chains that report a value. */
export function chainMask(
  rxDiversity: number | undefined,
  ...values: (ChainValues | null | undefined)[]
): number {
  if (rxDiversity) return rxDiversity & 0xf;
  let mask = 0;
  for (const chains of values) {
    CHAINS.forEach((_, i) => {
      if (chainValue(chains, i) !== null) mask |= 1 << i;
    });
  }
  return mask;
}

export const isChainActive = (mask: number, index: number): boolean =>
  (mask & (1 << index)) !== 0;

export const activeChains = (mask: number): number =>
  CHAINS.filter((_, i) => isChainActive(mask, i)).length;

/** Strongest and weakest reporting chain and the gap between them. */
export function chainSpread(
  values: ChainValues | null | undefined,
): { best: number; worst: number; spread: number } | null {
  const reported = CHAINS.map((_, i) => ({ i, v: chainValue(values, i) })).filter(
    (c): c is { i: number; v: number } => c.v !== null,
  );
  if (reported.length < 2) return null;
  const best = reported.reduce((a, b) => (b.v > a.v ? b : a));
  const worst = reported.reduce((a, b) => (b.v < a.v ? b : a));
  return { best: best.i, worst: worst.i, spread: best.v - worst.v };
}

// --- Statistics over the radio history -----------------------------------------

export type ChainMetric = "rsrp" | "sinr";

export interface ChainStat {
  index: number;
  summary: Summary | null;
  /** Standard deviation: how much the chain moves over the window */
  sd: number | null;
  /** Mean gap to the Main chain over the samples where both report */
  vsMain: number | null;
  /** Share (0..1) of the samples with this cell in which the chain reported */
  seen: number;
}

export function chainStats(
  samples: RadioSample[],
  rat: Rat,
  metric: ChainMetric,
): { cellSamples: number; chains: ChainStat[] } {
  const values: number[][] = CHAINS.map(() => []);
  const gaps: number[][] = CHAINS.map(() => []);
  let cellSamples = 0;
  for (const s of samples) {
    const cell = s[rat];
    if (!cell) continue;
    cellSamples++;
    const chains = metric === "rsrp" ? cell.rsrp_rx : cell.sinr_rx;
    if (!chains) continue;
    const main = chainValue(chains, 0);
    CHAINS.forEach((_, i) => {
      const v = chainValue(chains, i);
      if (v === null) return;
      values[i].push(v);
      if (main !== null && i > 0) gaps[i].push(v - main);
    });
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    cellSamples,
    chains: values.map((v, index) => {
      const summary = summarize(v);
      const sd = summary
        ? Math.sqrt(mean(v.map((x) => (x - summary.mean) ** 2)))
        : null;
      return {
        index,
        summary,
        sd,
        vsMain: gaps[index].length ? mean(gaps[index]) : null,
        seen: cellSamples ? v.length / cellSamples : 0,
      };
    }),
  };
}

/** Axis for the range strips: the observed range padded to 5 dB steps,
 *  at least `minSpan` wide so small differences are not blown up. */
export function stripDomain(
  summaries: Summary[],
  minSpan = 20,
): [number, number] {
  if (summaries.length === 0) return [0, minSpan];
  const lo = Math.min(...summaries.map((s) => s.min));
  const hi = Math.max(...summaries.map((s) => s.max));
  let from = Math.floor((lo - 1) / 5) * 5;
  let to = Math.ceil((hi + 1) / 5) * 5;
  while (to - from < minSpan) {
    from -= 5;
    if (to - from < minSpan) to += 5;
  }
  return [from, to];
}
