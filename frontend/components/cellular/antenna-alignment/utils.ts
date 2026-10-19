// =============================================================================
// Antenna alignment — recordings, scoring and their localStorage copy
// =============================================================================
// A recording averages SAMPLES_PER_RECORDING samples of the radio history
// (one a second) for the LTE PCell and the first NR cell. Slots are compared
// on a 0..100 score, 60% RSRP and 40% SINR, over the radio technologies and
// metrics every recorded slot has: a slot that saw no 5G is not penalised
// against one that did, the comparison just leaves 5G out.
// =============================================================================

import type { CellSample, RadioSample } from "@/lib/bridge/radio-history";
import type { ChainValues, DiagSnapshot } from "@/types/bridge";

export type RadioMode = "lte" | "nr" | "endc";
export type AntennaType = "directional" | "omni";
export type RatKey = "lte" | "nr";

export const SAMPLES_PER_RECORDING = 5;
export const SLOT_COUNT = 3;
export const ALIGNMENT_STORAGE_KEY = "simpleadmin_antenna_alignment";
const STORAGE_VERSION = 1;

export const RADIO_MODE_LABELS: Record<RadioMode, string> = {
  lte: "4G LTE",
  nr: "5G SA",
  endc: "5G NSA (EN-DC)",
};

export const DEFAULT_LABELS: Record<AntennaType, string[]> = {
  directional: ["0°", "45°", "90°"],
  omni: ["Position A", "Position B", "Position C"],
};

/** Score scales: the same bars as the live meters. */
export const RSRP_SCALE = [-140, -44] as const;
export const SINR_SCALE = [-20, 30] as const;
const RSRP_WEIGHT = 0.6;

export interface RatReading {
  /** Serving cell when the recording ended, e.g. "B3 · PCI 123" */
  cell: string;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  rsrp_rx: ChainValues;
  sinr_rx: ChainValues;
}

export interface Recording {
  label: string;
  ts: number;
  samples: number;
  lte: RatReading | null;
  nr: RatReading | null;
}

export function radioMode(snapshot: DiagSnapshot | null): RadioMode | null {
  if (!snapshot) return null;
  const lte = snapshot.lte.some((c) => !c.is_scell);
  const nr = snapshot.nr.length > 0;
  if (lte && nr) return "endc";
  if (nr) return "nr";
  return lte ? "lte" : null;
}

export function cellLabel(snapshot: DiagSnapshot | null, rat: RatKey): string {
  if (rat === "lte") {
    const c = snapshot?.lte.find((cell) => !cell.is_scell);
    return c ? `B${c.band} · PCI ${c.pci}` : "";
  }
  const c = snapshot?.nr[0];
  return c ? `${c.band ? `n${c.band}` : "NR"} · PCI ${c.pci}` : "";
}

/** History samples taken after `since` that carry a serving cell. */
export function samplesSince(history: RadioSample[], since: number): RadioSample[] {
  return history.filter((s) => s.ts > since && (s.lte || s.nr));
}

function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return null;
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}

function average(cells: (CellSample | null)[], cell: string): RatReading | null {
  const present = cells.filter((c): c is CellSample => c !== null);
  if (present.length === 0) return null;
  const chains = (pick: (c: CellSample) => ChainValues | null) =>
    [0, 1, 2, 3].map((i) => mean(present.map((c) => pick(c)?.[i])));
  return {
    cell,
    rsrp: mean(present.map((c) => c.rsrp)),
    rsrq: mean(present.map((c) => c.rsrq)),
    sinr: mean(present.map((c) => c.sinr)),
    rsrp_rx: chains((c) => c.rsrp_rx),
    sinr_rx: chains((c) => c.sinr_rx),
  };
}

export function makeRecording(
  label: string,
  samples: RadioSample[],
  snapshot: DiagSnapshot | null,
  ts: number,
): Recording {
  return {
    label,
    ts,
    samples: samples.length,
    lte: average(samples.map((s) => s.lte), cellLabel(snapshot, "lte")),
    nr: average(samples.map((s) => s.nr), cellLabel(snapshot, "nr")),
  };
}

// --- Scoring -------------------------------------------------------------------

const toPct = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100;

export interface SlotComparison {
  /** Score per slot, null for empty slots or when nothing is comparable */
  scores: (number | null)[];
  /** Best slot once two or more are recorded */
  best: number | null;
  /** Runner-up, to say how clear the win is */
  second: number | null;
  /** What the score was computed on, e.g. "LTE RSRP and SINR, 5G RSRP" */
  basis: string;
  /** A compared RAT was recorded on different serving cells */
  mixedCells: boolean;
}

export function compareSlots(slots: (Recording | null)[]): SlotComparison {
  const recorded = slots
    .map((s, i) => (s ? i : -1))
    .filter((i) => i >= 0);
  const rats = (["lte", "nr"] as RatKey[])
    .filter((rat) => recorded.length > 0 && recorded.every((i) => slots[i]![rat]?.rsrp != null))
    .map((rat) => ({
      rat,
      sinr: recorded.every((i) => slots[i]![rat]?.sinr != null),
    }));

  const scores = slots.map((slot) => {
    if (!slot || rats.length === 0) return null;
    const parts = rats.map(({ rat, sinr }) => {
      const r = slot[rat]!;
      const rsrp = toPct(r.rsrp!, RSRP_SCALE);
      return sinr ? RSRP_WEIGHT * rsrp + (1 - RSRP_WEIGHT) * toPct(r.sinr!, SINR_SCALE) : rsrp;
    });
    return Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 10) / 10;
  });

  const ranked = recorded
    .filter((i) => scores[i] !== null)
    .sort((a, b) => scores[b]! - scores[a]! || a - b);
  const enough = ranked.length >= 2;
  return {
    scores,
    best: enough ? ranked[0] : null,
    second: enough ? ranked[1] : null,
    basis: rats
      .map(({ rat, sinr }) => `${rat === "lte" ? "LTE" : "5G"} RSRP${sinr ? " and SINR" : ""}`)
      .join(", "),
    mixedCells: rats.some(
      ({ rat }) => new Set(recorded.map((i) => slots[i]![rat]!.cell)).size > 1,
    ),
  };
}

// --- Persistence ---------------------------------------------------------------

export interface StoredAlignment {
  antennaType: AntennaType;
  labels: Record<AntennaType, string[]>;
  slots: (Recording | null)[];
}

export const EMPTY_ALIGNMENT: StoredAlignment = {
  antennaType: "directional",
  labels: { directional: [...DEFAULT_LABELS.directional], omni: [...DEFAULT_LABELS.omni] },
  slots: [null, null, null],
};

const isLabels = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length === SLOT_COUNT && v.every((x) => typeof x === "string");

const isRecording = (v: unknown): v is Recording => {
  if (!v || typeof v !== "object") return false;
  const r = v as Recording;
  return typeof r.label === "string" && typeof r.ts === "number" && "lte" in r && "nr" in r;
};

export function loadAlignment(): StoredAlignment {
  try {
    const raw = window.localStorage.getItem(ALIGNMENT_STORAGE_KEY);
    if (!raw) return EMPTY_ALIGNMENT;
    const p = JSON.parse(raw);
    if (p?.version !== STORAGE_VERSION) return EMPTY_ALIGNMENT;
    const antennaType: AntennaType = p.antennaType === "omni" ? "omni" : "directional";
    const slots =
      Array.isArray(p.slots) && p.slots.length === SLOT_COUNT
        ? p.slots.map((s: unknown) => (isRecording(s) ? s : null))
        : EMPTY_ALIGNMENT.slots;
    return {
      antennaType,
      labels: {
        directional: isLabels(p.labels?.directional) ? p.labels.directional : EMPTY_ALIGNMENT.labels.directional,
        omni: isLabels(p.labels?.omni) ? p.labels.omni : EMPTY_ALIGNMENT.labels.omni,
      },
      slots,
    };
  } catch {
    return EMPTY_ALIGNMENT;
  }
}

export function saveAlignment(state: StoredAlignment): void {
  try {
    window.localStorage.setItem(
      ALIGNMENT_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...state }),
    );
  } catch {
    // Storage disabled or full: the recordings live until the page closes.
  }
}
