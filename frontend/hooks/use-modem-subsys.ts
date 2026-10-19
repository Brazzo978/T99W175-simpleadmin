"use client";

import { useCallback, useMemo } from "react";
import { useBridgeState } from "@/hooks/use-bridge";
import type { ModemSubsysData } from "@/types/modem-subsys";

// =============================================================================
// useModemSubsys — system resources and storage
// =============================================================================
// From system_bridge: uptime, load, CPU, memory and the /data partition
// (UBIFS usrfs, where SimpleAdmin keeps its binaries and state). The modem
// crash counters of QManager's CGI have no source here and stay empty.
// =============================================================================

export interface UseModemSubsysReturn {
  data: ModemSubsysData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useModemSubsys(): UseModemSubsysReturn {
  const { system } = useBridgeState();
  const refetch = useCallback(() => {}, []);
  const data = useMemo<ModemSubsysData | null>(() => {
    if (!system) return null;
    const { sys } = system;
    const fs = sys.data_fs;
    return {
      state: "unknown",
      state_raw: null,
      crash_count: null,
      coredump_present: false,
      last_crash_at: null,
      total_logged_crashes: 0,
      uptime_seconds: Math.floor(sys.uptime_s),
      cpu: {
        load_1m: sys.load[0] ?? null,
        load_5m: sys.load[1] ?? null,
        load_15m: sys.load[2] ?? null,
        core_count: null,
        usage_pct: sys.cpu_pct,
        freq_khz: null,
        max_freq_khz: null,
      },
      memory: {
        total_kb: sys.mem_total_kb,
        available_kb: sys.mem_total_kb - sys.mem_used_kb,
        used_kb: sys.mem_used_kb,
      },
      storage: fs
        ? {
            mount: "/data",
            total_kb: fs.total_kb,
            used_kb: fs.used_kb,
            available_kb: fs.avail_kb,
          }
        : null,
    };
  }, [system]);
  return { data, isLoading: !system, error: null, refetch };
}
