// =============================================================================
// Bridge store — one shared WebSocket per modem bridge
// =============================================================================
// diag_bridge (9001) and system_bridge (9002) push JSON snapshots while a
// client is connected and stop polling the modem when nobody listens. The
// store therefore opens the sockets only while at least one component is
// subscribed and the tab is visible, and closes them otherwise.
//
// Components read it through useSyncExternalStore (see hooks/use-bridge.ts):
// every accepted message replaces the snapshot object, so React sees a new
// reference exactly when something changed.
// =============================================================================

import type { DiagEvent, DiagSnapshot, SystemSnapshot } from "@/types/bridge";
import type { SignalHistoryEntry } from "@/types/modem-status";
import { pickRadio, type RadioSource } from "./radio";
import {
  RADIO_HISTORY_INTERVAL_MS,
  RADIO_HISTORY_MAX,
  takeRadioSample,
  type RadioSample,
} from "./radio-history";

export type LinkState = "idle" | "connecting" | "connected" | "disconnected";

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
  /** Average ping RTT samples (ms), oldest first; null for a failed check */
  latencyHistory: (number | null)[];
  /** Mean seconds between latency samples, 0 until two have arrived */
  latencyIntervalSec: number;
  /** One radio sample per second, oldest first (Signal Details trends) */
  radioHistory: RadioSample[];
  /** First sighting of each DIAG log counter in this page session, for a
   *  per-minute rate: code -> Date.now() and count then */
  diagLogBase: Record<string, { t: number; n: number }>;
  /** DIAG events seen while the page was open, newest first: the bridge
   *  sends only its last 20, this keeps the whole session */
  radioEvents: RadioEvent[];
}

export interface RadioEvent extends Omit<DiagEvent, "age_s"> {
  /** Unique within the session */
  key: string;
  /** Date.now() of the event: receive time minus its age */
  ts: number;
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
/** Latency samples kept for the live latency card. */
const LATENCY_HISTORY_MAX = 60;

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
  radioHistory: [],
  diagLogBase: {},
  radioEvents: [],
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

/** New events of a snapshot (its list repeats them with growing ages). */
function mergeEvents(events: DiagEvent[] | undefined, now: number): RadioEvent[] {
  const known = state.radioEvents;
  if (!events?.length) return known;
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
  if (!added.length) return known;
  return [...added.reverse(), ...known].slice(0, RADIO_EVENTS_MAX);
}
let lastLatencySampleAt = 0;
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
  setState({
    diag,
    diagAt: now,
    diagLogBase,
    radioEvents: mergeEvents(diag.events, now),
  });
  sampleSignal();
  sampleRadio();
}

function onSystem(system: SystemSnapshot) {
  const now = Date.now();
  const ping = system.conn?.ping;
  let { latencyHistory, latencyIntervalSec } = state;
  if (ping && !system.conn.pending) {
    const sample = ping.passed > 0 ? ping.avg_ms : null;
    latencyHistory = [...latencyHistory, sample].slice(-LATENCY_HISTORY_MAX);
    if (lastLatencySampleAt) {
      const gap = (now - lastLatencySampleAt) / 1000;
      // Exponential average: one late message must not skew the axis.
      latencyIntervalSec = latencyIntervalSec
        ? latencyIntervalSec * 0.8 + gap * 0.2
        : gap;
    }
    lastLatencySampleAt = now;
  }
  setState({ system, systemAt: now, latencyHistory, latencyIntervalSec });
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

export type { RadioSource };
