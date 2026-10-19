// =============================================================================
// Session activity log: the dashboard's Recent Activities
// =============================================================================
// No poller on the modem detects network events, so the store feeds this
// log with every bridge message and it keeps, newest first:
//   - the DIAG radio events worth a glance (radioActivity in ./events.ts);
//   - network changes between radio snapshots: PCell band or cell, the SCell
//     set (carrier aggregation), the 5G NR leg of NSA;
//   - internet lost/restored and high latency from system_bridge's checks.
// A change counts once it has held for a few snapshots (handovers can
// bounce) and is dated when it was first seen. The log lives in the page:
// it survives route changes while the sockets are open, not a reload.
// =============================================================================

import type {
  DiagLteCell,
  DiagNrCell,
  DiagSnapshot,
  RadioRat,
  SystemSnapshot,
} from "@/types/bridge";
import {
  LATENCY_THRESHOLDS,
  type EventSeverity,
  type NetworkEvent,
  type NetworkEventType,
} from "@/types/modem-status";
import { englishText, msg, type Msg } from "@/lib/i18n/message";
import { radioActivity, type RadioEvent } from "./events";
import type { RadioSource } from "./radio";

export const ACTIVITIES_MAX = 200;

interface Hold {
  samples: number;
  ms: number;
}
/** Radio changes: diag_bridge pushes up to twice a second. */
const RADIO_HOLD: Hold = { samples: 2, ms: 3000 };
/** system_bridge checks connectivity every 10 s and repeats the result in
 *  each 2 s push: a state held for 15 s was reported by two checks. */
const CHECK_HOLD: Hold = { samples: 2, ms: 15_000 };
/** After this long without radio data the baseline is taken again, without
 *  events: what changed meanwhile has no date. */
const RADIO_GAP_MS = 30_000;
/** After this long without system_bridge data, a pending change restarts. */
const SYSTEM_GAP_MS = 30_000;
/** DIAG events reporting the same thing within this are one activity. */
const SAME_EVENT_MS = 5000;
/** A DIAG cell change and a snapshot change to the same PCI within this are
 *  one handover. */
const SAME_HANDOVER_MS = 30_000;
/** Recent entries remembered for the two matches above. */
const RECENT_MAX = 50;

/** Ping average above which latency is high (the dashboard's "poor"), and
 *  below which it has recovered: the gap keeps the state from flapping. */
export const HIGH_LATENCY_MS = LATENCY_THRESHOLDS.fair;
export const LATENCY_RECOVERED_MS = HIGH_LATENCY_MS * 0.8;

interface Change<T> {
  from: T;
  to: T;
  /** Date.now() when the new value was first seen */
  at: number;
}

/** A value that changes only once a new one has held long enough. */
class Held<T> {
  private candidate: string | null = null;
  private seen = 0;
  private since = 0;

  constructor(
    public value: T,
    private readonly key: (value: T) => string,
    private readonly hold: Hold,
  ) {}

  feed(next: T, now: number): Change<T> | null {
    const key = this.key(next);
    if (key === this.key(this.value)) {
      this.drop();
      return null;
    }
    if (key !== this.candidate) {
      this.candidate = key;
      this.seen = 0;
      this.since = now;
    }
    this.seen += 1;
    if (this.seen < this.hold.samples || now - this.since < this.hold.ms) {
      return null;
    }
    const change = { from: this.value, to: next, at: this.since };
    this.reset(next);
    return change;
  }

  /** Forgets a change still on hold. */
  drop(): void {
    this.candidate = null;
    this.seen = 0;
  }

  reset(value: T): void {
    this.value = value;
    this.drop();
  }
}

// --- Radio view --------------------------------------------------------------

interface Cell {
  /** 0 when unknown */
  band: number;
  /** EARFCN or NR-ARFCN */
  freq: number;
  pci: number;
}

interface RadioView {
  lte: Cell | null;
  nr: Cell | null;
  lteScells: Cell[];
  nrScells: Cell[];
}

const cellKey = (cell: Cell | null) => (cell ? `${cell.freq}/${cell.pci}` : "-");
const setKey = (cells: Cell[]) => cells.map(cellKey).sort().join(",");

function lteCell(cell: DiagLteCell): Cell {
  return { band: cell.band, freq: cell.earfcn, pci: cell.pci };
}

function nrCell(cell: DiagNrCell): Cell {
  return { band: cell.band ?? 0, freq: cell.arfcn, pci: cell.pci };
}

/** In NSA the NR cells are the secondary cell group; in SA the first one is
 *  the PCell. Either way nr[0] is the primary NR cell, the rest NR SCells. */
function radioView(snapshot: DiagSnapshot): RadioView {
  const pcell = snapshot.lte.find((cell) => !cell.is_scell);
  return {
    lte: pcell ? lteCell(pcell) : null,
    nr: snapshot.nr[0] ? nrCell(snapshot.nr[0]) : null,
    lteScells: snapshot.lte.filter((cell) => cell.is_scell).map(lteCell),
    nrScells: snapshot.nr.slice(1).map(nrCell),
  };
}

function bandName(rat: RadioRat, band: number): string {
  return band > 0 ? `${rat === "LTE" ? "B" : "N"}${band}` : rat;
}

function cellText(rat: RadioRat, cell: Cell): string {
  return cell.band > 0
    ? `${bandName(rat, cell.band)}, PCI ${cell.pci}`
    : `PCI ${cell.pci}`;
}

/** Keys of the derived activity messages (locales/<lang>/dashboard.json). */
const K = "dashboard:activity.derived";

// --- Log ---------------------------------------------------------------------

interface Recent {
  id: string;
  at: number;
  origin: "diag" | "derived";
  message: string;
  dedupKey?: string;
  rat?: RadioRat | null;
  pci?: number;
}

type Entry = Pick<NetworkEvent, "type" | "severity" | "message" | "category" | "rat"> & {
  text: Msg;
};

export class ActivityLog {
  /** Newest first; replaced by a new array whenever it changes. */
  events: NetworkEvent[] = [];

  private seq = 0;
  private recent: Recent[] = [];

  private radioAt = 0;
  private radioSource: RadioSource = "none";
  private lte = new Held<Cell | null>(null, cellKey, RADIO_HOLD);
  private nr = new Held<Cell | null>(null, cellKey, RADIO_HOLD);
  private lteScells = new Held<Cell[]>([], setKey, RADIO_HOLD);
  private nrScells = new Held<Cell[]>([], setKey, RADIO_HOLD);

  private systemAt = 0;
  // Start from the good state: a bad one found when the page opens is
  // reported once confirmed, a good one is not news.
  private online = new Held<boolean>(true, String, CHECK_HOLD);
  private latency = new Held<{ high: boolean; avg: number }>(
    { high: false, avg: 0 },
    (v) => (v.high ? "high" : "ok"),
    CHECK_HOLD,
  );

  /** DIAG events new in a snapshot, oldest first. */
  addRadioEvents(events: RadioEvent[], lteState?: string): void {
    for (const e of events) {
      const activity = radioActivity(e, lteState);
      if (!activity) continue;
      // Versions of one event, an RLF and its statistics: the more detailed.
      const twin = this.recent.find(
        (r) =>
          r.origin === "diag" &&
          r.dedupKey === activity.dedupKey &&
          Math.abs(r.at - e.ts) <= SAME_EVENT_MS,
      );
      if (twin) {
        if (activity.message.length <= twin.message.length) continue;
        this.remove(twin.id);
      }
      // The snapshots already showed this cell change.
      if (
        activity.pci !== undefined &&
        this.recent.some(
          (r) =>
            r.origin === "derived" &&
            r.rat === activity.rat &&
            r.pci === activity.pci &&
            Math.abs(r.at - e.ts) <= SAME_HANDOVER_MS,
        )
      ) {
        continue;
      }
      this.add(
        {
          type: "radio_event",
          severity: activity.severity,
          message: activity.message,
          text: activity.text,
          category: activity.category,
          rat: activity.rat,
        },
        e.ts,
        { origin: "diag", dedupKey: activity.dedupKey, rat: activity.rat, pci: activity.pci },
      );
    }
  }

  /**
   * One radio snapshot (pickRadio's). `lteState` is diag_bridge's LTE RRC
   * state, unknown with QMI.
   */
  observeRadio(
    snapshot: DiagSnapshot,
    source: RadioSource,
    lteState: string | undefined,
    now: number,
  ): void {
    const view = radioView(snapshot);
    if (!this.radioAt || now - this.radioAt > RADIO_GAP_MS) {
      this.lte.reset(view.lte);
      this.nr.reset(view.nr);
      this.lteScells.reset(view.lteScells);
      this.nrScells.reset(view.nrScells);
      this.radioSource = source;
      this.radioAt = now;
      return;
    }
    this.radioAt = now;
    if (source !== this.radioSource) {
      // DIAG and QMI do not list the same secondary carriers.
      this.lteScells.reset(view.lteScells);
      this.nrScells.reset(view.nrScells);
      this.radioSource = source;
    }
    const idle = lteState !== undefined && lteState !== "Connected";

    // A PCell that disappears is no service, not a change: the next one is
    // compared with the last one seen.
    if (view.lte) {
      const change = this.lte.feed(view.lte, now);
      if (change) this.pcellChanged("LTE", change, idle);
    }

    // SCells and the NR leg of NSA exist only in RRC Connected: an LTE that
    // goes idle releases them, which is no news.
    if (view.lte && idle) {
      this.nr.drop();
      this.lteScells.drop();
      this.nrScells.drop();
      return;
    }
    if (view.lte || view.nr) {
      const change = this.nr.feed(view.nr, now);
      if (change) this.nrChanged(change, view.lte !== null);
    }
    if (view.lte) {
      const change = this.lteScells.feed(view.lteScells, now);
      if (change) this.scellsChanged("LTE", view.lte, change);
    }
    if (view.nr) {
      const change = this.nrScells.feed(view.nrScells, now);
      if (change) this.scellsChanged("5G", view.nr, change);
    }
  }

  /** One system_bridge message: connectivity and latency. */
  observeSystem(system: SystemSnapshot, now: number): void {
    if (now - this.systemAt > SYSTEM_GAP_MS) {
      this.online.drop();
      this.latency.drop();
    }
    this.systemAt = now;
    const conn = system.conn;
    // Checks still in flight report partial results.
    if (!conn || conn.pending) return;
    let up: boolean;
    if (conn.status === "ok" || conn.status === "warning") up = true;
    else if (conn.status === "error") up = false;
    else return;
    const ping = conn.ping;
    const avg =
      ping && ping.passed > 0 && typeof ping.avg_ms === "number"
        ? ping.avg_ms
        : null;

    const online = this.online.feed(up, now);
    if (online?.to) {
      this.derived(
        "internet_restored",
        "info",
        avg === null
          ? msg(`${K}.internet_restored`)
          : msg(`${K}.internet_restored_ping`, { ms: Math.round(avg) }),
        online.at,
      );
    } else if (online) {
      this.derived("internet_lost", "error", msg(`${K}.internet_lost`), online.at);
    }

    if (!up || avg === null) return;
    const high = this.latency.value.high
      ? avg >= LATENCY_RECOVERED_MS
      : avg > HIGH_LATENCY_MS;
    const latency = this.latency.feed({ high, avg }, now);
    if (latency?.to.high) {
      this.derived(
        "high_latency",
        "warning",
        msg(`${K}.high_latency`, { ms: Math.round(latency.to.avg) }),
        latency.at,
      );
    } else if (latency) {
      this.derived(
        "latency_recovered",
        "info",
        msg(`${K}.latency_recovered`, { ms: Math.round(latency.to.avg) }),
        latency.at,
      );
    }
  }

  // --- Radio changes ---------------------------------------------------------

  private pcellChanged(rat: RadioRat, change: Change<Cell | null>, idle: boolean) {
    const { from, to, at } = change;
    if (!from || !to) return;
    if (from.band > 0 && to.band > 0 && from.band !== to.band) {
      this.derived(
        "band_change",
        "info",
        msg(`${K}.band_change`, {
          rat,
          from: bandName(rat, from.band),
          to: bandName(rat, to.band),
          from_pci: from.pci,
          to_pci: to.pci,
        }),
        at,
        rat,
        to.pci,
      );
      return;
    }
    const move = idle && rat === "LTE" ? "reselection" : "handover";
    const detail =
      from.pci !== to.pci
        ? `PCI ${from.pci} → ${to.pci}`
        : `${rat === "LTE" ? "EARFCN" : "ARFCN"} ${from.freq} → ${to.freq}`;
    const text =
      to.band > 0
        ? msg(`${K}.${move}_on`, { rat, band: bandName(rat, to.band), detail })
        : msg(`${K}.${move}`, { rat, detail });
    this.derived("pci_change", "info", text, at, rat, to.pci);
  }

  /** NR primary cell: a cell change, or in NSA the NR leg added or lost. */
  private nrChanged(change: Change<Cell | null>, nsa: boolean) {
    const { from, to, at } = change;
    if (from && to) {
      this.pcellChanged("5G", change, false);
      return;
    }
    // In SA, NR is the whole service: losing it is an out of service.
    if (!nsa) return;
    if (to) {
      this.derived(
        "nr_anchor",
        "info",
        msg(`${K}.nr_added`, { cell: cellText("5G", to) }),
        at,
        "5G",
        to.pci,
      );
    } else if (from) {
      this.derived(
        "nr_anchor",
        "warning",
        msg(`${K}.nr_lost`, { cell: cellText("5G", from) }),
        at,
      );
    }
  }

  private scellsChanged(rat: RadioRat, pcell: Cell, change: Change<Cell[]>) {
    const { from, to, at } = change;
    const tech = rat === "LTE" ? "LTE" : "NR";
    const name = (cell: Cell) => bandName(rat, cell.band);
    if (!from.length && to.length) {
      const bands = [pcell, ...to].map(name).join(" + ");
      this.derived(
        "ca_change",
        "info",
        msg(`${K}.ca_active`, { tech, bands, count: to.length + 1 }),
        at,
      );
      return;
    }
    if (from.length && !to.length) {
      this.derived(
        "ca_change",
        "warning",
        msg(`${K}.ca_off`, { tech, band: name(pcell) }),
        at,
      );
      return;
    }
    let added = to.filter((cell) => !from.some((old) => cellKey(old) === cellKey(cell)));
    let removed = from.filter((old) => !to.some((cell) => cellKey(cell) === cellKey(old)));
    // Same carrier, another PCI: the SCell moved to another cell.
    for (const cell of [...added]) {
      const old = removed.find((r) => r.freq === cell.freq);
      if (!old) continue;
      this.derived(
        "scc_pci_change",
        "info",
        msg(`${K}.scell_moved`, {
          tech,
          band: name(cell),
          from: old.pci,
          to: cell.pci,
        }),
        at,
      );
      added = added.filter((a) => a !== cell);
      removed = removed.filter((r) => r !== old);
    }
    if (!added.length && !removed.length) return;
    const diff = [
      ...added.map((cell) => `+${name(cell)}`),
      ...removed.map((cell) => `-${name(cell)}`),
    ].join(", ");
    const before = from.length + 1;
    const after = to.length + 1;
    this.derived(
      "ca_change",
      after < before ? "warning" : "info",
      before === after
        ? msg(`${K}.carriers_changed`, { tech, diff })
        : msg(`${K}.carriers_count`, { tech, before, after, diff }),
      at,
    );
  }

  // --- Entries ---------------------------------------------------------------

  /** An event derived from the snapshots. A cell change also reported by a
   *  DIAG event replaces it and takes its time, which is exact. */
  private derived(
    type: NetworkEventType,
    severity: EventSeverity,
    text: Msg,
    at: number,
    rat?: RadioRat,
    pci?: number,
  ) {
    let when = at;
    if (rat && pci !== undefined) {
      const twin = this.recent.find(
        (r) =>
          r.origin === "diag" &&
          r.rat === rat &&
          r.pci === pci &&
          Math.abs(r.at - at) <= SAME_HANDOVER_MS,
      );
      if (twin) {
        when = Math.min(at, twin.at);
        this.remove(twin.id);
      }
    }
    this.add(
      { type, severity, message: englishText(text), text },
      when,
      { origin: "derived", rat, pci },
    );
  }

  private add(entry: Entry, at: number, meta: Omit<Recent, "id" | "at" | "message">) {
    const id = `activity-${++this.seq}`;
    const event: NetworkEvent = { ...entry, id, timestamp: Math.floor(at / 1000) };
    const events = [...this.events];
    const index = events.findIndex((e) => e.timestamp <= event.timestamp);
    events.splice(index < 0 ? events.length : index, 0, event);
    this.events = events.slice(0, ACTIVITIES_MAX);
    this.recent = [{ ...meta, id, at, message: entry.message }, ...this.recent].slice(
      0,
      RECENT_MAX,
    );
  }

  private remove(id: string) {
    this.events = this.events.filter((e) => e.id !== id);
    this.recent = this.recent.filter((r) => r.id !== id);
  }
}
