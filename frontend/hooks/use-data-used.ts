"use client";

import { useCallback, useState } from "react";
import { useBridgeState } from "@/hooks/use-bridge";
import { authFetch } from "@/lib/auth-fetch";
import type { RadioUsage } from "@/types/bridge";

// =============================================================================
// useDataUsed — data used over the radio
// =============================================================================
// diag_bridge adds up the bytes of the radio transport blocks (LTE and 5G,
// download and upload) across restarts in /data/simpleadmin/radio_usage and
// sends the totals in every snapshot (`usage`). Radio bytes include the LAN
// traffic the IPA forwards in hardware, which the kernel interface counters
// miss, and read a few percent above the operator's count (protocol
// headers). The reset goes through cgi-bin/reset_data_usage (admin), which
// returns once diag_bridge has zeroed and saved the counter; the next
// snapshot carries the zeroed totals.
// =============================================================================

const RESET_ENDPOINT = "/cgi-bin/reset_data_usage";

export interface UseDataUsedReturn {
  /** Totals since the last reset (null until diag_bridge sends them) */
  data: RadioUsage | null;
  isLoading: boolean;
  isResetting: boolean;
  error: string | null;
  /** Reset the counter. Returns true on success. */
  resetCounter: () => Promise<boolean>;
}

export function useDataUsed(): UseDataUsedReturn {
  const { diag } = useBridgeState();
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return {
    data: diag?.usage ?? null,
    isLoading: !diag,
    isResetting,
    error,
    resetCounter,
  };
}
