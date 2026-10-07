"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

// =============================================================================
// useWatchdog — connection watchdog configuration and log
// =============================================================================
// cgi-bin/connection_watchdog: GET the configuration, POST it as JSON.
// cgi-bin/get_watchdog_log?lines=N: the tail of /tmp/connection-watchdog.log.
// =============================================================================

export type WatchdogAction = "cfun" | "reboot";

export interface WatchdogConfig {
  enabled: boolean;
  /** Comma-separated IPv4 targets */
  targets: string;
  failCount: number;
  checkInterval: number;
  pingTimeoutSec: number;
  action: WatchdogAction;
  bootGrace: number;
  cfunMaxAttempts: number;
}

const LOG_LINES = 160;
const LOG_REFRESH_MS = 3000;

export function useWatchdog() {
  const [config, setConfig] = useState<WatchdogConfig | null>(null);
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

  const load = useCallback(async () => {
    try {
      const resp = await authFetch("/cgi-bin/connection_watchdog", { cache: "no-store" });
      const json = await resp.json();
      if (!mounted.current) return;
      setConfig({
        enabled: Boolean(json.enabled),
        targets: json.targets || "1.1.1.1,8.8.8.8",
        failCount: Number(json.failCount || 3),
        checkInterval: Number(json.checkInterval || 10),
        pingTimeoutSec: Number(json.pingTimeoutSec || 5),
        action: json.action === "reboot" ? "reboot" : "cfun",
        bootGrace: Number(json.bootGrace ?? 600),
        cfunMaxAttempts: Number(json.cfunMaxAttempts || 10),
      });
      setError(null);
    } catch {
      if (mounted.current) setError("Unable to read the watchdog configuration");
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next: WatchdogConfig) => {
    setIsSaving(true);
    try {
      const resp = await authFetch("/cgi-bin/connection_watchdog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!resp.ok) return { ok: false, message: `HTTP ${resp.status}` };
      const json = await resp.json();
      if (mounted.current) {
        setConfig({ ...next, enabled: Boolean(json.enabled), targets: json.targets || next.targets });
      }
      return { ok: true };
    } catch {
      return { ok: false, message: "Modem unreachable" };
    } finally {
      if (mounted.current) setIsSaving(false);
    }
  }, []);

  return { config, isLoading, isSaving, error, save, reload: load };
}

/** Tail of the watchdog log, refreshed while `active`. */
export function useWatchdogLog(active: boolean) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const resp = await authFetch(`/cgi-bin/get_watchdog_log?lines=${LOG_LINES}`, {
          cache: "no-store",
        });
        const json = await resp.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message);
        setText(json.content || "");
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to read the log");
      }
    };
    tick();
    const id = setInterval(tick, LOG_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return { text, error };
}

export interface ConnectionChecks {
  /** Comma-separated hosts system_bridge pings */
  pingTargets: string;
  /** Comma-separated server:domain DNS lookups */
  dnsTests: string;
}

/**
 * The checks behind the dashboard's internet status (system_bridge reads
 * them from simpleadmin.conf): get_connection_config / set_connection_config.
 */
export function useConnectionChecks() {
  const [checks, setChecks] = useState<ConnectionChecks | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch("/cgi-bin/get_connection_config", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.status === "success") {
          setChecks({ pingTargets: json.pingTargets || "", dnsTests: json.dnsTests || "" });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: ConnectionChecks) => {
    setIsSaving(true);
    try {
      const resp = await authFetch("/cgi-bin/set_connection_config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await resp.json();
      if (json.status !== "success") return { ok: false, message: json.message || "Save failed" };
      setChecks(next);
      return { ok: true };
    } catch {
      return { ok: false, message: "Modem unreachable" };
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { checks, isSaving, save };
}
