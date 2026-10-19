"use client";

import { useCallback } from "react";
import { useBridgeState } from "@/hooks/use-bridge";
import type { NetworkEvent } from "@/types/modem-status";

// =============================================================================
// useRecentActivities — network events for the dashboard
// =============================================================================
// The store derives them in the browser from the bridge messages (DIAG radio
// events, radio snapshot changes, connectivity checks; see
// lib/bridge/activities.ts) and keeps them while the page is open.
// =============================================================================

export interface UseRecentActivitiesReturn {
  /** Network events, newest first */
  events: NetworkEvent[];
  /** True until the first radio data arrives */
  isLoading: boolean;
  /** Always false: the list is pushed, not fetched */
  isRefreshing: boolean;
  /** Always null: the bridges' own state is shown elsewhere */
  error: string | null;
  /** No-op: the list follows the bridges by itself */
  refresh: () => void;
}

export function useRecentActivities(): UseRecentActivitiesReturn {
  const { diag, system, activities } = useBridgeState();
  const refresh = useCallback(() => {}, []);
  return {
    events: activities,
    isLoading: !diag && !system?.radio && activities.length === 0,
    isRefreshing: false,
    error: null,
    refresh,
  };
}
