"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useBridgeState } from "@/hooks/use-bridge";
import type { AboutDeviceData } from "@/types/about-device";

// =============================================================================
// useAboutDevice — device identity and addresses
// =============================================================================
// Identity and WAN address come live from system_bridge; the LAN address is
// read once from the get_lanip CGI (mobileap configuration).
// =============================================================================

const LANIP_ENDPOINT = "/cgi-bin/get_lanip";

export interface UseAboutDeviceReturn {
  data: AboutDeviceData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAboutDevice(): UseAboutDeviceReturn {
  const { system } = useBridgeState();
  const [lanIp, setLanIp] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchLanIp = useCallback(async () => {
    setError(null);
    try {
      const resp = await authFetch(LANIP_ENDPOINT);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const json: { status: string; lanip?: string; message?: string } =
        await resp.json();
      if (!mountedRef.current) return;
      if (json.status !== "ok" || !json.lanip) {
        setError(json.message || "Failed to read the LAN address");
        return;
      }
      setLanIp(json.lanip);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to read the LAN address",
      );
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLanIp();
  }, [fetchLanIp]);

  const data = useMemo<AboutDeviceData | null>(() => {
    if (!system && !lanIp) return null;
    const modem = system?.modem;
    return {
      device: {
        model: modem?.model ?? "",
        manufacturer: modem?.manufacturer ?? "",
        firmware: modem?.firmware ?? "",
        build_date: "",
        imei: modem?.imei ?? "",
      },
      threeGppRelease: { lte: "", nr5g: "" },
      network: {
        device_ip: lanIp,
        lan_gateway: lanIp,
        wan_ipv4: system?.net.wan_ip ?? "",
        wan_ipv6: "",
        public_ipv4: "",
        public_ipv6: "",
      },
      system: { hostname: "", kernel_version: "", openwrt_version: "" },
    };
  }, [system, lanIp]);

  return {
    data,
    isLoading: isLoading && !system,
    error,
    refresh: fetchLanIp,
  };
}
