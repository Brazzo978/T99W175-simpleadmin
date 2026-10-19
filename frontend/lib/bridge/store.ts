// =============================================================================
// Bridge store — one shared WebSocket per modem bridge
// =============================================================================
// diag_bridge (9001) and system_bridge (9002) push JSON snapshots while a
// client is connected and stop polling the modem when nobody listens. The
// store therefore opens the sockets only while at least one component is
// subscribed and the tab is visible, and closes them otherwise.
//
// system_bridge keeps a 24 h latency history (one slot per background check
// interval) and QMI signal samples (30 min) while nobody is connected, and
// sends them in a one-time `history` message on connect: the store starts
// from them, then appends its own samples (signal), the bridge's new slots
// (latency24h) and one live sample per check round (latencyHistory).
//
// Components read it through useSyncExternalStore (see hooks/use-bridge.ts):
// every accepted message replaces the snapshot object, so React sees a new
// reference exactly when something changed.
// =============================================================================

import type {
  DiagEvent,
  DiagSnapshot,
  SystemHistory,
  SystemSnapshot,
} from "@/types/bridge";
import type { NetworkEvent, SignalHistoryEntry } from "@/types/modem-status";
import { ActivityLog } from "./activities";
import type { RadioEvent } from "./events";
import { pickRadio, type RadioSource } from "./radio";
import {
  RADIO_HISTORY_INTERVAL_MS,
  RADIO_HISTORY_MAX,
  takeRadioSample,
  type RadioSample,
} from "./radio-history";

export type LinkState = "idle" | "connecting" | "connected" | "disconnected";

/** system_bridge's 24 h latency history (conn.hist_*), oldest first. */
export interface LatencyHistory24h {
  /** History step (s): the background check interval, 0 until known */
  intervalSec: number;
  /** Average RTT (ms) of each step's rounds, null when none had an answer */
  rtt: (number | null)[];
  /** Date.now() of the newest slot, 0 before the first */
  lastAt: number;
}

export interface BridgeState {
  diag: DiagSnapshot | null;
  /** Date.now() of the last diag_bridge message, 0 before the first */
  diagAt: number;
  system: SystemSnapshot | null;
  systemAt: number;
  diagLink: LinkState;
  systemLink: LinkState;
  /** Per-antenna signal samples, oldest first */
  signalHistory: SignalHistoryEntry[];
  /** Live latency: average ping RTT of each check round (ms) while the
   *  page is connected, oldest first; null for a round no target answered */
  latencyHistory: (number | null)[];
  /** Seconds between check rounds, 0 until known */
  latencyIntervalSec: number;
  /** Date.now() of the newest live sample, 0 before the first */
  latencyLastAt: number;
  /** The bridge's 24 h latency history, one slot per step */
  latency24h: LatencyHistory24h;
  /** One radio sample per second, oldest first (Signal Details trends) */
  radioHistory: RadioSample[];
  /** First sighting of each DIAG log counter in this page session, for a
   *  per-minute rate: code -> Date.now() and count then */
  diagLogBase: Record<string, { t: number; n: number }>;
  /** DIAG events seen while the page was open, newest first: the bridge
   *  sends only its last 20, this keeps the whole session */
  radioEvents: RadioEvent[];
  /** Dashboard activity log, newest first (lib/bridge/activities.ts) */
  activities: NetworkEvent[];
}

const RADIO_EVENTS_MAX = 500;
/** Ages are whole seconds and messages arrive late: same event within this. */
const EVENT_MATCH_MS = 2500;

const PORTS = { diag: 9001, system: 9002 } as const;
type Kind = keyof typeof PORTS;

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10_000;
/** Signal history cadence and depth: 30 minutes at 10 s. */
export const SIGNAL_HISTORY_INTERVAL_S = 10;
const SIGNAL_HISTORY_MAX = 180;
/** Live latency samples kept: 24 h of system_bridge's 10 s check rounds. */
export const LATENCY_HISTORY_MAX = 8640;

/** Slots of the 24 h latency history at a step of intervalSec. */
function latency24hMax(intervalSec: number): number {
  return Math.round(86400 / Math.max(intervalSec, 1));
}

let state: BridgeState = {
  diag: null,
  diagAt: 0,
  system: null,
  systemAt: 0,
  diagLink: "idle",
  systemLink: "idle",
  signalHistory: [],
  latencyHistory: [],
  latencyIntervalSec: 0,
  latencyLastAt: 0,
  latency24h: { intervalSec: 0, rtt: [], lastAt: 0 },
  radioHistory: [],
  diagLogBase: {},
  radioEvents: [],
  activities: [],
};

const listeners = new Set<() => void>();
// Passive listeners see every update but do not keep the sockets open: the
// bridge status in the header uses them, so it never makes the bridges poll.
const passiveListeners = new Set<() => void>();
const sockets: Record<Kind, WebSocket | null> = { diag: null, system: null };
const timers: Record<Kind, ReturnType<typeof setTimeout> | null> = {
  diag: null,
  system: null,
};
const backoff: Record<Kind, number> = {
  diag: RECONNECT_MIN_MS,
  system: RECONNECT_MIN_MS,
};
let lastSignalSampleAt = 0;
let lastRadioSampleAt = 0;
let eventSeq = 0;
/** Events older than this were cleared by the user: not re-added. */
let eventsClearedAt = 0;
/** Derived once per message, here rather than in a component, so that it
 *  keeps running across page changes. */
const activityLog = new ActivityLog();

/** The session's event list with the new events of a snapshot (its list
 *  repeats them with growing ages), and those new events, oldest first. */
function mergeEvents(
  events: DiagEvent[] | undefined,
  now: number,
): { list: RadioEvent[]; added: RadioEvent[] } {
  const known = state.radioEvents;
  if (!events?.length) return { list: known, added: [] };
  const added: RadioEvent[] = [];
  // Oldest first, so equal events in one snapshot stay apart.
  for (const e of [...events].reverse()) {
    const ts = now - e.age_s * 1000;
    if (ts < eventsClearedAt) continue;
    const f = JSON.stringify(e.f ?? {});
    const dup = [...added, ...known.slice(0, 60)].some(
      (k) => k.id === e.id && Math.abs(k.ts - ts) <= EVENT_MATCH_MS && JSON.stringify(k.f ?? {}) === f,
    );
    if (dup) continue;
    added.push({ key: `${ts}-${e.id}-${eventSeq++}`, ts, id: e.id, name: e.name, f: e.f });
  }
  if (!added.length) return { list: known, added };
  return {
    list: [...[...added].reverse(), ...known].slice(0, RADIO_EVENTS_MAX),
    added,
  };
}
let lastLatencySampleAt = 0;
/** conn.seq of the last latency sample taken (see onSystem) */
let lastConnSeq: number | undefined;
/** conn.hist_seq of the newest slot in latency24h */
let lastHistSeq: number | undefined;
let visibilityHooked = false;

function setState(patch: Partial<BridgeState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
  passiveListeners.forEach((listener) => listener());
}

function linkKey(kind: Kind) {
  return kind === "diag" ? "diagLink" : "systemLink";
}

function shouldRun() {
  return (
    listeners.size > 0 &&
    typeof document !== "undefined" &&
    document.visibilityState !== "hidden"
  );
}

function connect(kind: Kind) {
  if (!shouldRun()) return;
  const current = sockets[kind];
  if (
    current &&
    (current.readyState === WebSocket.OPEN ||
      current.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (timers[kind]) clearTimeout(timers[kind]!);
  timers[kind] = null;

  const host = window.location.hostname || "192.168.225.1";
  let ws: WebSocket;
  try {
    ws = new WebSocket(`ws://${host}:${PORTS[kind]}/`);
  } catch {
    scheduleReconnect(kind);
    return;
  }
  sockets[kind] = ws;
  setState({ [linkKey(kind)]: "connecting" });

  ws.onopen = () => {
    if (sockets[kind] !== ws) return;
    backoff[kind] = RECONNECT_MIN_MS;
    setState({ [linkKey(kind)]: "connected" });
  };
  ws.onmessage = (event) => {
    if (sockets[kind] !== ws) return;
    let data: unknown;
    try {
      data = JSON.parse(event.data as string);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    if (kind === "diag") onDiag(data as DiagSnapshot);
    else if ("history" in data) onHistory((data as { history: SystemHistory }).history);
    else onSystem(data as SystemSnapshot);
  };
  ws.onerror = () => ws.close();
  ws.onclose = () => {
    if (sockets[kind] !== ws) return;
    sockets[kind] = null;
    setState({ [linkKey(kind)]: "disconnected" });
    scheduleReconnect(kind);
  };
}

function scheduleReconnect(kind: Kind) {
  if (!shouldRun()) return;
  const delay = backoff[kind];
  backoff[kind] = Math.min(delay * 2, RECONNECT_MAX_MS);
  timers[kind] = setTimeout(() => connect(kind), delay);
}

function disconnect(kind: Kind) {
  if (timers[kind]) clearTimeout(timers[kind]!);
  timers[kind] = null;
  const ws = sockets[kind];
  sockets[kind] = null;
  if (ws) ws.close();
  backoff[kind] = RECONNECT_MIN_MS;
}

function onDiag(diag: DiagSnapshot) {
  const now = Date.now();
  let { diagLogBase } = state;
  const fresh = (diag.diag_logs ?? []).filter((l) => !(l.code in diagLogBase));
  if (fresh.length) {
    diagLogBase = { ...diagLogBase };
    for (const l of fresh) diagLogBase[l.code] = { t: now, n: l.n };
  }
  const { list: radioEvents, added } = mergeEvents(diag.events, now);
  const lteState = diag.rrc?.lte_state;
  activityLog.addRadioEvents(added, lteState);
  // Each radio source is observed on its own messages.
  const radio = pickRadio({ ...state, diag, diagAt: now }, now);
  if (radio.snapshot && radio.source === "diag") {
    activityLog.observeRadio(radio.snapshot, radio.source, lteState, now);
  }
  setState({
    diag,
    diagAt: now,
    diagLogBase,
    radioEvents,
    activities: activityLog.events,
  });
  sampleSignal();
  sampleRadio();
}

/** One history row ([age_s, lte x6, nr x6]) as a chart entry. */
function signalEntry(row: (number | null)[], nowSec: number): SignalHistoryEntry {
  const v = (i: number) => row[i] ?? null;
  return {
    ts: nowSec - (row[0] ?? 0),
    lte_rsrp: [v(1), v(2), v(3), v(4)],
    lte_rsrq: [v(5), null, null, null],
    lte_sinr: [v(6), null, null, null],
    nr_rsrp: [v(7), v(8), v(9), v(10)],
    nr_rsrq: [v(11), null, null, null],
    nr_sinr: [v(12), null, null, null],
  };
}

/**
 * The bridge's histories replace the local ones (it kept sampling while the
 * page was closed); an empty one (bridge just restarted) leaves them as
 * they are, unless its latency step differs. The live latency series is
 * seeded from the 24 h history only when its slots are check rounds (a
 * 10 s step); at a longer step the dashboard starts empty and fills at
 * one sample per round.
 */
function onHistory(history: SystemHistory) {
  const now = Date.now();
  const patch: Partial<BridgeState> = {};
  lastConnSeq = history.seq;
  const latency = history.latency;
  if (latency) {
    const step = latency.interval_s;
    const round = latency.round_s ?? step;
    const rtt = latency.rtt ?? [];
    const lastAt = rtt.length ? now - Math.max(latency.age_s, 0) * 1000 : 0;
    lastHistSeq = latency.seq;
    if (rtt.length || step !== state.latency24h.intervalSec) {
      patch.latency24h = { intervalSec: step, rtt: rtt.slice(-latency24hMax(step)), lastAt };
    }
    patch.latencyIntervalSec = round;
    if (step !== round) {
      patch.latencyHistory = [];
      patch.latencyLastAt = 0;
    } else if (rtt.length) {
      patch.latencyHistory = rtt.slice(-LATENCY_HISTORY_MAX);
      patch.latencyLastAt = lastAt;
    }
  }
  const rows = history.signal?.rows ?? [];
  if (rows.length) {
    const nowSec = Math.floor(now / 1000);
    const entries = rows.map((row) => signalEntry(row, nowSec));
    patch.signalHistory = entries.slice(-SIGNAL_HISTORY_MAX);
    lastSignalSampleAt = entries[entries.length - 1].ts * 1000;
  }
  setState(patch);
}

function onSystem(system: SystemSnapshot) {
  const now = Date.now();
  const conn = system.conn;
  const ping = conn?.ping;
  let { latencyHistory, latencyIntervalSec, latencyLastAt, latency24h } = state;
  // 24 h history: the bridge's newest slot when hist_seq moves on; a new
  // step means it restarted the history, which starts empty here too.
  if (conn?.hist_seq !== undefined && conn.hist_interval_s) {
    const step = conn.hist_interval_s;
    if (step !== latency24h.intervalSec) {
      latency24h = { intervalSec: step, rtt: [], lastAt: 0 };
      lastHistSeq = conn.hist_seq;
    } else if (conn.hist_seq !== lastHistSeq) {
      lastHistSeq = conn.hist_seq;
      latency24h = {
        intervalSec: step,
        rtt: [...latency24h.rtt, conn.hist_rtt ?? null].slice(-latency24hMax(step)),
        lastAt: now,
      };
    }
  }
  // Live: one sample per finished check round (conn.seq), at the round
  // interval the history message gave; a bridge without seq gets one per
  // settled message and a measured interval, as before.
  const rounds = conn?.seq !== undefined;
  const fresh = rounds ? conn.seq !== lastConnSeq : !conn?.pending;
  if (ping && fresh) {
    lastConnSeq = conn.seq;
    const sample = ping.passed > 0 ? ping.avg_ms : null;
    latencyHistory = [...latencyHistory, sample].slice(-LATENCY_HISTORY_MAX);
    if (!rounds && lastLatencySampleAt) {
      const gap = (now - lastLatencySampleAt) / 1000;
      // Exponential average: one late message must not skew the axis.
      latencyIntervalSec = latencyIntervalSec
        ? latencyIntervalSec * 0.8 + gap * 0.2
        : gap;
    }
    lastLatencySampleAt = now;
    latencyLastAt = now;
  }
  const radio = pickRadio({ ...state, system, systemAt: now }, now);
  if (radio.snapshot && radio.source === "qmi") {
    activityLog.observeRadio(radio.snapshot, radio.source, undefined, now);
  }
  activityLog.observeSystem(system, now);
  setState({
    system,
    systemAt: now,
    latencyHistory,
    latencyIntervalSec,
    latencyLastAt,
    latency24h,
    activities: activityLog.events,
  });
  sampleSignal();
  sampleRadio();
}

function sampleSignal() {
  const now = Date.now();
  if (now - lastSignalSampleAt < SIGNAL_HISTORY_INTERVAL_S * 1000) return;
  const { snapshot } = pickRadio(state, now);
  if (!snapshot) return;
  const pcell = snapshot.lte.find((cell) => !cell.is_scell);
  const nr = snapshot.nr[0];
  const none = [null, null, null, null];
  const entry: SignalHistoryEntry = {
    ts: Math.floor(now / 1000),
    lte_rsrp: pcell?.rsrp_rx ?? none,
    lte_rsrq: pcell ? [pcell.rsrq, null, null, null] : none,
    lte_sinr: pcell?.sinr_rx ?? none,
    nr_rsrp: nr?.rsrp_rx ?? none,
    nr_rsrq: nr ? [nr.rsrq, null, null, null] : none,
    nr_sinr: nr ? [nr.sinr ?? null, null, null, null] : none,
  };
  lastSignalSampleAt = now;
  setState({
    signalHistory: [...state.signalHistory, entry].slice(-SIGNAL_HISTORY_MAX),
  });
}

function sampleRadio() {
  const now = Date.now();
  if (now - lastRadioSampleAt < RADIO_HISTORY_INTERVAL_MS) return;
  const { snapshot, source } = pickRadio(state, now);
  if (!snapshot) return;
  lastRadioSampleAt = now;
  setState({
    radioHistory: [
      ...state.radioHistory,
      takeRadioSample(snapshot, source, now),
    ].slice(-RADIO_HISTORY_MAX),
  });
}

/** Drops the radio samples (Signal Details "Reset"). */
export function clearRadioHistory(): void {
  lastRadioSampleAt = 0;
  setState({ radioHistory: [] });
}

/** Clears the session's event log (Radio events "Clear"). */
export function clearRadioEvents(): void {
  eventsClearedAt = Date.now() + EVENT_MATCH_MS;
  setState({ radioEvents: [] });
}

function syncConnections() {
  (Object.keys(PORTS) as Kind[]).forEach((kind) => {
    if (shouldRun()) {
      connect(kind);
    } else if (sockets[kind] || timers[kind]) {
      disconnect(kind);
      setState({ [linkKey(kind)]: "idle" });
    }
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!visibilityHooked && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", syncConnections);
    visibilityHooked = true;
  }
  syncConnections();
  return () => {
    listeners.delete(listener);
    // Let a page transition re-subscribe before tearing the sockets down.
    setTimeout(syncConnections, 0);
  };
}

export function subscribePassive(listener: () => void): () => void {
  passiveListeners.add(listener);
  return () => {
    passiveListeners.delete(listener);
  };
}

/** Keeps both bridges connected for `ms`, then lets them go. */
export function holdConnections(ms: number): void {
  const release = subscribe(() => {});
  setTimeout(release, ms);
}

export function getState(): BridgeState {
  return state;
}

export type { RadioEvent, RadioSource };
