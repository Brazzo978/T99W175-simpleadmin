// =============================================================================
// Frequency calculator — queries, their outcome, formatting and the history
// kept in this browser
// =============================================================================

import {
  calculateChannel,
  calculateFrequency,
  type CalcResult,
  type Rat,
} from "@/lib/earfcn";
import { msg, type Msg } from "@/lib/i18n/message";
import type { CarrierRow } from "../signal/carriers";

export type Mode = "channel" | "frequency";
/** Channel mode: guess the RAT; frequency mode: both RATs */
export type RatChoice = "auto" | Rat;

export interface Query {
  mode: Mode;
  rat: RatChoice;
  value: string;
}

export type Outcome =
  | { ok: true; query: Query; input: number; results: CalcResult[] }
  | { ok: false; query: Query; error: Msg };

export const EMPTY_QUERY: Query = { mode: "channel", rat: "auto", value: "" };

export const channelName = (rat: Rat): string => (rat === "LTE" ? "EARFCN" : "NR-ARFCN");

/** LTE sits on a 100 kHz raster; NR down to 5 kHz (FR2: 60 kHz steps). */
export function fmtMHz(freq: number | null | undefined, rat: Rat): string {
  if (typeof freq !== "number" || !Number.isFinite(freq)) return "—";
  if (rat === "LTE") return `${freq.toFixed(1)} MHz`;
  const s = freq.toFixed(3).replace(/0+$/, "");
  return `${s.endsWith(".") ? `${s}0` : s} MHz`;
}

export function runQuery(query: Query): Outcome {
  const text = query.value.trim().replace(",", ".");
  if (!text) {
    return {
      ok: false,
      query,
      error: msg(
        query.mode === "channel"
          ? "frequency-calculator:errors.enter_channel"
          : "frequency-calculator:errors.enter_frequency",
      ),
    };
  }
  const v = Number(text);
  if (query.mode === "channel") {
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, query, error: msg("frequency-calculator:errors.channel_not_integer") };
    }
    const result = calculateChannel(v, query.rat);
    if (result.matches.length === 0) {
      const error =
        query.rat === "auto"
          ? msg("frequency-calculator:errors.no_band_any", { value: v })
          : msg("frequency-calculator:errors.no_band_rat", {
              channel: channelName(query.rat),
              value: v,
            });
      return { ok: false, query, error };
    }
    return { ok: true, query, input: v, results: [result] };
  }
  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, query, error: msg("frequency-calculator:errors.frequency_invalid") };
  }
  const results = calculateFrequency(v, query.rat).filter((r) => r.matches.length > 0);
  if (results.length === 0) {
    const error =
      query.rat === "auto"
        ? msg("frequency-calculator:errors.no_band_frequency_any", { value: v })
        : msg("frequency-calculator:errors.no_band_frequency_rat", {
            rat: query.rat,
            value: v,
          });
    return { ok: false, query, error };
  }
  return { ok: true, query, input: v, results };
}

/** One line for the history list. */
export function outcomeSummary(outcome: Extract<Outcome, { ok: true }>): string {
  const bands = (r: CalcResult) => [...new Set(r.matches.map((m) => m.label))].join("/");
  if (outcome.query.mode === "channel") {
    const r = outcome.results[0];
    return `${channelName(r.rat)} ${outcome.input} → ${bands(r)}, ${fmtMHz(r.freq, r.rat)}`;
  }
  return `${outcome.input} MHz → ${outcome.results
    .map((r) => (r.rat === "NR" ? `NR-ARFCN ${r.channel} (${bands(r)})` : `LTE ${bands(r)}`))
    .join(", ")}`;
}

/** The query that names a serving carrier. */
export function carrierQuery(row: CarrierRow): Query {
  return { mode: "channel", rat: row.rat === "lte" ? "LTE" : "NR", value: String(row.arfcn) };
}

/** Keys of the serving carriers, to flag the band a result shares with them. */
export function servingKeys(rows: CarrierRow[]): Set<string> {
  return new Set(
    rows.map((r) => `${r.rat === "lte" ? "LTE" : "NR"}:${r.arfcn}:${r.band === "NR" ? "*" : r.band}`),
  );
}

export function isServing(keys: Set<string>, rat: Rat, channel: number | undefined, label: string): boolean {
  if (channel === undefined) return false;
  return keys.has(`${rat}:${channel}:${label}`) || keys.has(`${rat}:${channel}:*`);
}

// --- History -------------------------------------------------------------------

export interface HistoryEntry {
  id: string;
  query: Query;
  summary: string;
  ts: number;
}

const HISTORY_KEY = "simpleadmin_frequency_history";
const HISTORY_VERSION = 1;
export const HISTORY_MAX = 10;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (p?.version !== HISTORY_VERSION || !Array.isArray(p.entries)) return [];
    return p.entries
      .filter(
        (e: HistoryEntry) =>
          e &&
          typeof e.id === "string" &&
          typeof e.summary === "string" &&
          typeof e.ts === "number" &&
          typeof e.query?.value === "string" &&
          (e.query.mode === "channel" || e.query.mode === "frequency") &&
          ["auto", "LTE", "NR"].includes(e.query.rat),
      )
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    if (entries.length === 0) window.localStorage.removeItem(HISTORY_KEY);
    else
      window.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify({ version: HISTORY_VERSION, entries }),
      );
  } catch {
    // Storage disabled or full: the history lives until the page closes.
  }
}
