// =============================================================================
// DIAG radio events: one classification for Signal Details and the dashboard
// =============================================================================
// diag_bridge forwards Qualcomm DIAG events with AirScreen's event and field
// names. Signal Details lists every one of them; the dashboard's Recent
// Activities keeps the ones worth a glance (failures, cell changes, abnormal
// RRC transitions) as a one-line message, and leaves the routine ones
// (paging, RACH and SCell bookkeeping, normal RRC state changes) to Signal
// Details.
// =============================================================================

import { englishText, msg, type Msg } from "@/lib/i18n/message";
import type { DiagEvent, RadioEventCategory, RadioRat } from "@/types/bridge";
import type { EventSeverity } from "@/types/modem-status";

/** A DIAG event as the store keeps it for the session. */
export interface RadioEvent extends Omit<DiagEvent, "age_s"> {
  /** Unique within the session */
  key: string;
  /** Date.now() of the event: receive time minus its age */
  ts: number;
}

type NamedEvent = Pick<DiagEvent, "name" | "f">;

// --- Classification ----------------------------------------------------------

/** English names of the categories; the UI shows
 *  `common:radio_category.<category>` instead. */
export const RADIO_EVENT_CATEGORIES: Record<RadioEventCategory, string> = {
  failure: "Failure",
  mobility: "Mobility",
  rrc: "RRC state",
  rach: "RACH",
  ca: "Carrier agg.",
  paging: "Paging",
  other: "Other",
};

export function eventCategory(name: string): RadioEventCategory {
  const n = name.toUpperCase();
  if (/FAIL|RLF|RADIO_LINK|OUT_OF_SERVICE|_OOS/.test(n)) return "failure";
  if (/HANDOVER|_HO_|_HO$|NEW_CELL|RESELECT|REDIRECT/.test(n)) return "mobility";
  if (/RACH|RANDOM_ACCESS/.test(n)) return "rach";
  if (/SCELL|_CA_|SCG_ADD|SCG_CONFIG/.test(n)) return "ca";
  if (/PAGING/.test(n)) return "paging";
  if (/STATE|CONNECTION|RRC/.test(n)) return "rrc";
  return "other";
}

/** A good outcome inside a category (handover or RACH success). */
export function eventSucceeded(e: NamedEvent): boolean {
  if (/SUCCESS/i.test(e.name)) return true;
  return Object.entries(e.f ?? {}).some(
    ([k, v]) => /result|status/i.test(k) && /^success/i.test(String(v)),
  );
}

const ACRONYMS = new Set([
  "SCG", "MCG", "RLF", "HO", "RACH", "PCI", "TA", "PHR", "EPHR", "BSR", "OOS",
  "IRAT", "MIB", "SIB", "PDCP", "RLC", "MAC", "RRC", "CA", "NR", "LTE", "UE",
  "DRX", "ML1", "LL1", "NAS", "EMM", "ESM", "SR", "CSI", "CQI", "TDD", "FDD",
]);

export interface EventTitle {
  rat: RadioRat | null;
  layer: string | null;
  title: string;
}

/** EVENT_NR5G_RRC_SCG_FAILURE -> { rat: "5G", layer: "RRC", title: "SCG failure" } */
export function describeEvent(name: string): EventTitle {
  let parts = name.replace(/^EVENT_/, "").split("_").filter(Boolean);
  let rat: RadioRat | null = null;
  if (parts[0] === "LTE") {
    rat = "LTE";
    parts = parts.slice(1);
  } else if (parts[0] === "NR5G" || parts[0] === "NR") {
    rat = "5G";
    parts = parts.slice(1);
  }
  let layer: string | null = null;
  if (parts.length > 1 && ["RRC", "ML1", "LL1", "MAC", "NAS", "EMM", "PDCP", "RLC"].includes(parts[0])) {
    layer = parts[0];
    parts = parts.slice(1);
  }
  const words = parts.map((w, i) => {
    if (w === "IND") return "indication";
    if (w === "SCELL") return "SCell";
    if (/^V\d+$/.test(w)) return w.toLowerCase();
    if (ACRONYMS.has(w)) return w;
    const lower = w.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  });
  return { rat, layer, title: words.join(" ") || name };
}

// --- Dashboard view ----------------------------------------------------------

/** A DIAG event as a dashboard activity. */
export interface RadioActivity {
  category: RadioEventCategory;
  rat: RadioRat | null;
  severity: EventSeverity;
  /** The one-line message, translated when it renders */
  text: Msg;
  /** `text` in English */
  message: string;
  /** Shared by events that report the same thing (versions of one event, an
   *  RLF and its statistics): the activity log keeps one of them. */
  dedupKey: string;
  /** Cell moved to, to pair the event with the same change seen in the
   *  radio snapshots. */
  pci?: number;
}

/** Keys of the radio activity messages (locales/<lang>/dashboard.json). */
const K = "dashboard:activity.radio";

/** Text that is no translation: DIAG names and values. */
const raw = (text: string): Msg => msg(`${K}.raw`, { text });

function field(
  f: DiagEvent["f"],
  ...names: string[]
): string | number | undefined {
  for (const name of names) {
    const v = f?.[name];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

function num(v: string | number | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v);
  return null;
}

const VALUE_ACRONYMS = new Set([
  ...ACRONYMS, "CFG", "CPHY", "IP", "SMC", "DSDS", "ENDC", "NRDC", "PDCPUL",
]);

/** Enum value as text: "T310_EXPIRY" -> "T310 expiry", "CAUSE_RACH" ->
 *  "RACH". Camel-case names ("randomAccessProblem") stay as they are; a
 *  number is an enum value AirScreen has no name for. */
function valueText(v: string | number | undefined): Msg | null {
  if (v === undefined) return null;
  if (typeof v === "number") return msg(`${K}.cause_number`, { value: v });
  const s = v.trim();
  if (!s || /^(CAUSE_)?(NONE|MAX)$/i.test(s)) return null;
  if (!/^[A-Z0-9_ ]+$/.test(s)) return raw(s);
  const words = s
    .replace(/^NR5G_[A-Z]+_FAILURE_CAUSE_/, "")
    .replace(/^CAUSE_/, "")
    .split(/[_ ]+/)
    .filter(Boolean);
  return raw(
    words
      .map((w, i) => {
        if (VALUE_ACRONYMS.has(w) || /\d/.test(w)) return w;
        const lower = w.toLowerCase();
        return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
      })
      .join(" "),
  );
}

function withCause(text: Msg, cause: Msg | null): Msg {
  return cause ? msg(`${K}.with_cause`, { text, cause }) : text;
}

/** Trigger suffixes with a message of their own (keys under K). */
const SETUP_FAILURE = new Set([
  "CONN_ABORTED", "T300_EXPIRY", "CONN_REJECT", "CELL_RESEL", "ACCESS_BARRED",
  "OTHER",
]);
const REESTABLISHMENT = new Set(["RECFG_FAILURE", "HO_FAILURE", "OTHER_FAILURE"]);
const DROP = new Set(["T311_EXPIRY", "T301_EXPIRY", "REEST_REJECT"]);

/** EVENT_LTE_RRC_STATE_CHANGE_TRIGGER: only the abnormal transitions. */
function rrcTrigger(
  trigger: string,
): { severity: EventSeverity; text: Msg } | null {
  let m = /^CAMPED_TRIGGER_CONN_EST_FAILURE_(\w+)$/.exec(trigger);
  if (m) {
    const cause = SETUP_FAILURE.has(m[1])
      ? msg(`${K}.setup_cause.${m[1].toLowerCase()}`)
      : (valueText(m[1]) ?? msg(`${K}.setup_cause.other`));
    return { severity: "warning", text: msg(`${K}.rrc_setup_failed`, { cause }) };
  }
  m = /^CONNECTED_TRIGGER_REEST_(\w+)$/.exec(trigger);
  if (m) {
    const cause = msg(
      `${K}.reest_cause.${REESTABLISHMENT.has(m[1]) ? m[1].toLowerCase() : "other_failure"}`,
    );
    return { severity: "warning", text: msg(`${K}.rrc_reestablishment`, { cause }) };
  }
  m = /^CLOSING_TRIGGER_(\w+)$/.exec(trigger);
  if (m && DROP.has(m[1])) {
    const cause = msg(`${K}.drop_cause.${m[1].toLowerCase()}`);
    return { severity: "error", text: msg(`${K}.rrc_dropped`, { cause }) };
  }
  return null;
}

/**
 * The dashboard view of a DIAG event, or null for the routine ones left to
 * Signal Details. `lteState` (the bridge's current LTE RRC state) tells an
 * LTE handover from an idle-mode reselection.
 */
export function radioActivity(
  e: NamedEvent,
  lteState?: string,
): RadioActivity | null {
  const category = eventCategory(e.name);
  const { rat, title } = describeEvent(e.name);
  const name = e.name.toUpperCase();
  const f = e.f;
  const plainTitle = title.replace(/ v\d+$/, "");
  const make = (
    severity: EventSeverity,
    text: Msg,
    key: string,
    pci?: number | null,
  ): RadioActivity => ({
    category,
    rat,
    severity,
    text,
    message: englishText(text),
    dedupKey: `${rat ?? ""}:${key}`,
    ...(pci != null ? { pci } : {}),
  });
  const channel = rat === "5G" ? "ARFCN" : "EARFCN";
  /** "PCI 12" or "PCI 12 (EARFCN 1850)" */
  const cellAt = (pci: number, freq: number | null): Msg =>
    freq === null
      ? msg(`${K}.cell_pci`, { pci })
      : msg(`${K}.cell_pci_freq`, { pci, channel, freq });

  switch (category) {
    case "failure": {
      if (/RADIO_LINK/.test(name)) {
        return make(
          "error",
          withCause(msg(`${K}.rlf`), valueText(field(f, "RLF Cause"))),
          "rlf",
        );
      }
      if (/OUT_OF_SERVICE|_OOS/.test(name)) return make("error", msg(`${K}.oos`), "oos");
      if (/HO_FAIL|HANDOVER_FAIL/.test(name)) {
        const pci = num(field(f, "Target Phy Cell Id", "Cell ID"));
        const freq = num(field(f, "Target ARFCN", "Frequency"));
        const text =
          pci === null
            ? msg(`${K}.handover_failed`)
            : msg(`${K}.handover_to_failed`, { target: cellAt(pci, freq) });
        const cause = valueText(field(f, "Failure Cause", "Cause"));
        return make("warning", withCause(text, cause), "hof");
      }
      if (/SCG_FAIL/.test(name)) {
        return make(
          "warning",
          withCause(msg(`${K}.scg_failure`), valueText(field(f, "Failure Type"))),
          "scg",
        );
      }
      if (/MCG_FAIL/.test(name)) {
        return make(
          "error",
          withCause(msg(`${K}.mcg_failure`), valueText(field(f, "Failure Type"))),
          "mcg",
        );
      }
      return make("warning", raw(plainTitle), plainTitle);
    }
    case "mobility": {
      // A handover start is followed by its success or failure.
      if (/HO_START|HANDOVER_START/.test(name)) return null;
      const pci = num(field(f, "Phy Cell Id", "Cell ID", "Target Phy Cell Id"));
      if (pci === null) return make("info", raw(plainTitle), plainTitle);
      const freq = num(field(f, "Frequency", "EARFCN", "SSB Freq", "Target ARFCN"));
      const where = cellAt(pci, freq);
      let text = msg(`${K}.handover_to`, { where });
      if (/NEW_CELL/.test(name)) {
        if (rat === "5G") text = msg(`${K}.new_cell`, { where });
        else if (lteState !== undefined && lteState !== "Connected") {
          text = msg(`${K}.reselection_to`, { where });
        }
      }
      return make("info", text, `cell:${pci}`, pci);
    }
    case "rach": {
      const result = valueText(field(f, "RACH Result", "RACH_RESULT", "RACH RESULT"));
      const resultText = result ? englishText(result) : "";
      if (!resultText || !/fail|problem/i.test(resultText)) return null;
      return make(
        "warning",
        msg(/problem/i.test(resultText) ? `${K}.rach_problem` : `${K}.rach_failed`),
        "rach",
      );
    }
    case "rrc": {
      const trigger = field(f, "RRC State Change Trigger");
      const abnormal = typeof trigger === "string" ? rrcTrigger(trigger) : null;
      return abnormal ? make(abnormal.severity, abnormal.text, "rrc") : null;
    }
    default:
      // Carrier aggregation bookkeeping (frame-level SCell configuration and
      // activation), paging and the rest: Signal Details only.
      return null;
  }
}
