"use client";

import { useCallback, useMemo, useState } from "react";
import { useBridgeState } from "@/hooks/use-bridge";
import { authFetch } from "@/lib/auth-fetch";
import type { DataUsedBlock } from "@/types/modem-status";

// =============================================================================
// useDataUsed — persistent data-usage counter
// =============================================================================
// system_bridge accumulates the rmnet_ipa0 byte counters across reboots in
// /data/simpleadmin/data_usage and pushes the totals in its snapshot (`data`).
// The reset goes through cgi-bin/reset_data_usage (admin), which signals the
// daemon; the next snapshot carries the zeroed totals.
// =============================================================================

const RESET_ENDPOINT = "/cgi-bin/reset_data_usage";

export interface UseDataUsedReturn {
  /** Latest data-usage block (null until system_bridge sends one) */
  data: DataUsedBlock | null;
  isLoading: boolean;
  isResetting: boolean;
  error: string | null;
  /** Reset the counter. Returns true on success. */
  resetCounter: () => Promise<boolean>;
  refresh: () => void;
}

export function useDataUsed(): UseDataUsedReturn {
  const { system } = useBridgeState();
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const block = system?.data;
  const data = useMemo<DataUsedBlock | null>(() => {
    if (!block) return null;
    return {
      accumulated_rx_bytes: block.rx,
      accumulated_tx_bytes: block.tx,
      selected_counter: block.counter,
      last_update_ts: block.sampled_at,
      last_reset_ts: block.reset_at,
      modem_reset_count: block.resets,
      stale: !block.ok,
    };
  }, [block]);

  const resetCounter = useCallback(async () => {
    setIsResetting(true);
    try {
      const resp = await authFetch(RESET_ENDPOINT, { method: "POST" });
      const json: { success?: boolean; message?: string } = await resp
        .json()
        .catch(() => ({}));
      if (!resp.ok || !json.success) {
        setError(json.message || `HTTP ${resp.status}`);
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError("Modem unreachable");
      return false;
    } finally {
      setIsResetting(false);
    }
  }, []);

  const refresh = useCallback(() => {}, []);
  return {
    data,
    isLoading: !system,
    isResetting,
    error,
    resetCounter,
    refresh,
  };
}
