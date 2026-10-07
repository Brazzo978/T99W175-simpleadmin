"use client";

import { useMemo, useState } from "react";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { buildModemStatus } from "@/lib/bridge/modem-status";
import type { RadioSource } from "@/lib/bridge/radio";
import type { ModemStatus } from "@/types/modem-status";

// =============================================================================
// useModemStatus — live modem status from the WebSocket bridges
// =============================================================================
// Builds QManager's ModemStatus structure from the latest diag_bridge and
// system_bridge messages (see lib/bridge/modem-status.ts). Nothing polls the
// modem: the bridges push while this hook has subscribers.
//
// Usage:
//   const { data, isLoading, isStale, error, radioSource } = useModemStatus();
// =============================================================================

/** No message from either bridge for this long: data is stale. */
const STALE_THRESHOLD_MS = 10_000;
/** Nothing at all after this long: report the bridges as unreachable. */
const UNREACHABLE_AFTER_MS = 10_000;

export interface UseModemStatusReturn {
  /** The latest modem status (null before the first bridge message) */
  data: ModemStatus | null;
  /** True until the first message arrives */
  isLoading: boolean;
  /** True when no bridge has sent anything for STALE_THRESHOLD_MS */
  isStale: boolean;
  /** Set when neither bridge can be reached */
  error: string | null;
  /** Where the radio values come from */
  radioSource: RadioSource;
  /** Kept for API compatibility: the bridges push, there is nothing to pull */
  refresh: () => void;
}

const noop = () => {};

export function useModemStatus(): UseModemStatusReturn {
  const state = useBridgeState();
  const now = useNow();
  // Mount time, to tell "still connecting" from "unreachable".
  const [since] = useState(() => Date.now());

  const { status, radioSource } = useMemo(
    () => buildModemStatus(state, now),
    [state, now],
  );

  const lastAt = Math.max(state.diagAt, state.systemAt);
  const isLoading = lastAt === 0 && now - since < UNREACHABLE_AFTER_MS;
  const isStale = lastAt > 0 && now - lastAt > STALE_THRESHOLD_MS;
  const unreachable =
    state.diagLink !== "connected" &&
    state.systemLink !== "connected" &&
    now - Math.max(lastAt, since) > UNREACHABLE_AFTER_MS;

  return {
    data: status,
    isLoading,
    isStale,
    error: unreachable ? "Bridges unreachable" : null,
    radioSource,
    refresh: noop,
  };
}
