"use client";

import { useCallback } from "react";
import type { DataUsedBlock } from "@/types/modem-status";

// =============================================================================
// useDataUsed — persistent data-usage counter
// =============================================================================
// Not provided yet: the counter that survives reboots will come from
// system_bridge (see TODO.md). Until then the dashboard shows no data and
// the reset action reports failure.
// =============================================================================

export interface UseDataUsedReturn {
  /** Latest data-usage block (null while no source provides one) */
  data: DataUsedBlock | null;
  isLoading: boolean;
  isResetting: boolean;
  error: string | null;
  /** Reset the counter. Returns true on success. */
  resetCounter: () => Promise<boolean>;
  refresh: () => void;
}

export function useDataUsed(): UseDataUsedReturn {
  const resetCounter = useCallback(async () => false, []);
  const refresh = useCallback(() => {}, []);
  return {
    data: null,
    isLoading: false,
    isResetting: false,
    error: null,
    resetCounter,
    refresh,
  };
}
