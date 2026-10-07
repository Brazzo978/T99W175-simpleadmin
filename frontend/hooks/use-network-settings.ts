"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

// =============================================================================
// useNetworkSettings — LAN, DHCP, DMZ, IP passthrough, WAN and TTL
// =============================================================================
// Backed by the SimpleAdmin CGIs:
//   network_settings  GET ?action=get / POST action=update (form encoded);
//                     most changes take effect after a modem restart
//   get_ttl_status    {isEnabled, ttl}
//   set_ttl           ?ttlvalue=N (0 disables), applied at once
//   get_arp           clients seen on the LAN, for the passthrough MAC
// =============================================================================

export interface NetworkConfig {
  ipAddress: string;
  subnetMask: string;
  dhcpEnabled: boolean;
  dhcpStart: string;
  dhcpEnd: string;
  dhcpLease: string;
  dmzEnabled: boolean;
  dmzIp: string;
  ipv6Enabled: boolean;
  bridgeEnabled: boolean;
  bridgeMac: string;
  autoConnect: boolean;
  roamingEnabled: boolean;
}

export interface ArpClient {
  mac: string;
  ips: string[];
}

export interface TtlState {
  enabled: boolean;
  value: number;
}

function toParams(config: NetworkConfig): URLSearchParams {
  const p = new URLSearchParams();
  p.set("action", "update");
  p.set("ip_address", config.ipAddress.trim());
  p.set("subnet_mask", config.subnetMask.trim());
  p.set("dhcp_enabled", config.dhcpEnabled ? "1" : "0");
  if (config.dhcpEnabled) {
    p.set("dhcp_start", config.dhcpStart.trim());
    p.set("dhcp_end", config.dhcpEnd.trim());
    p.set("dhcp_lease", config.dhcpLease.trim());
  }
  p.set("dmz_enabled", config.dmzEnabled ? "1" : "0");
  p.set("dmz_ip", config.dmzEnabled ? config.dmzIp.trim() : "0.0.0.0");
  p.set("ipv6_enabled", config.ipv6Enabled ? "1" : "0");
  p.set("bridge_enabled", config.bridgeEnabled ? "1" : "0");
  p.set("bridge_mac", config.bridgeEnabled ? config.bridgeMac.trim().toUpperCase() : "0");
  p.set("auto_connect", config.autoConnect ? "1" : "0");
  p.set("roaming_enabled", config.roamingEnabled ? "1" : "0");
  return p;
}

export function useNetworkSettings() {
  const [config, setConfig] = useState<NetworkConfig | null>(null);
  const [ttl, setTtl] = useState<TtlState | null>(null);
  const [clients, setClients] = useState<ArpClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [netResp, ttlResp, arpResp] = await Promise.all([
        authFetch("/cgi-bin/network_settings?action=get", { cache: "no-store" }),
        authFetch("/cgi-bin/get_ttl_status", { cache: "no-store" }),
        authFetch("/cgi-bin/get_arp", { cache: "no-store" }),
      ]);
      const net = await netResp.json();
      const ttlJson = await ttlResp.json().catch(() => ({}));
      const arp = await arpResp.json().catch(() => ({}));
      if (!mounted.current) return;
      if (!net.success) throw new Error(net.message || "Unable to read the network settings");
      setConfig(net.data as NetworkConfig);
      setTtl({ enabled: Boolean(ttlJson.isEnabled), value: Number(ttlJson.ttl) || 0 });
      const byMac = new Map<string, string[]>();
      for (const entry of (arp.entries ?? []) as { mac: string; ip: string }[]) {
        const mac = entry.mac.toUpperCase();
        const ips = byMac.get(mac) ?? [];
        if (entry.ip && !ips.includes(entry.ip)) ips.push(entry.ip);
        byMac.set(mac, ips);
      }
      setClients([...byMac].map(([mac, ips]) => ({ mac, ips })));
      setError(null);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Unable to read the network settings");
      }
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Saves the whole configuration; the caller decides about the restart. */
  const save = useCallback(
    async (next: NetworkConfig): Promise<{ ok: boolean; message?: string }> => {
      setIsSaving(true);
      try {
        const resp = await authFetch("/cgi-bin/network_settings", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: toParams(next).toString(),
        });
        const json = await resp.json();
        if (!json.success) {
          const details = Array.isArray(json.errors) ? ` ${json.errors.join(" ")}` : "";
          return { ok: false, message: (json.message || "Save failed") + details };
        }
        if (mounted.current) setConfig(next);
        return { ok: true };
      } catch {
        return { ok: false, message: "Modem unreachable" };
      } finally {
        if (mounted.current) setIsSaving(false);
      }
    },
    [],
  );

  /** 0 disables the TTL override. Applied at once, no restart. */
  const setTtlValue = useCallback(async (value: number) => {
    setIsSaving(true);
    try {
      const resp = await authFetch(
        `/cgi-bin/set_ttl?${new URLSearchParams({ ttlvalue: String(value) })}`,
        { cache: "no-store" },
      );
      if (!resp.ok) return { ok: false, message: `HTTP ${resp.status}` };
      if (mounted.current) setTtl({ enabled: value > 0, value });
      return { ok: true };
    } catch {
      return { ok: false, message: "Modem unreachable" };
    } finally {
      if (mounted.current) setIsSaving(false);
    }
  }, []);

  return { config, ttl, clients, isLoading, isSaving, error, refresh, save, setTtlValue };
}
