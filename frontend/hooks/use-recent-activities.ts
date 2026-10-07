"use client";

import { useCallback } from "react";
import type { NetworkEvent } from "@/types/modem-status";

// =============================================================================
// useRecentActivities — network events (band changes, handovers, CA changes)
// =============================================================================
// Not provided yet: the bridges will detect the events and push them (see
// TODO.md). Until then the list is empty.
// =============================================================================

export interface UseRecentActivitiesReturn {
  /** Network events, newest first */
  events: NetworkEvent[];
  /** True during the very first fetch */
  isLoading: boolean;
  /** True during a manual refresh (non-initial fetch) */
  isRefreshing: boolean;
  /** Error message if the last fetch failed */
  error: string | null;
  /** Manually trigger an immediate fetch and reset the poll timer */
  refresh: () => void;
}

export function useRecentActivities(): UseRecentActivitiesReturn {
  const refresh = useCallback(() => {}, []);
  return {
    events: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    refresh,
  };
}
