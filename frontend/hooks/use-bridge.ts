"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getState,
  subscribe,
  subscribePassive,
  type BridgeState,
} from "@/lib/bridge/store";

// Prerender (static export) has no sockets: it sees the empty initial state.
const serverState = getState();

/**
 * Live bridge state. Subscribing opens the diag_bridge and system_bridge
 * WebSockets; they close again when the last subscriber unmounts or the tab
 * is hidden.
 */
export function useBridgeState(): BridgeState {
  return useSyncExternalStore(subscribe, getState, () => serverState);
}

/**
 * Bridge state without connecting: it follows whatever the page itself
 * uses, and shows the links as idle when nothing needs the bridges.
 */
export function useBridgeStatePassive(): BridgeState {
  return useSyncExternalStore(subscribePassive, getState, () => serverState);
}

/**
 * Current time, refreshed every `intervalMs`, so freshness checks re-run
 * even when no message arrives (a bridge going silent).
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
