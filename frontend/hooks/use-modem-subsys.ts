"use client";

import { useCallback } from "react";
import type { ModemSubsysData } from "@/types/modem-subsys";

// =============================================================================
// useModemSubsys — modem subsystem and storage status
// =============================================================================
// Not provided yet: storage usage and the modem crash counters will come
// from system_bridge (see TODO.md). Until then consumers get no data.
// =============================================================================

export interface UseModemSubsysReturn {
  data: ModemSubsysData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useModemSubsys(): UseModemSubsysReturn {
  const refetch = useCallback(() => {}, []);
  return { data: null, isLoading: false, error: null, refetch };
}
