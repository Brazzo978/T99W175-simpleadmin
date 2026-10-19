"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { authFetch } from "@/lib/auth-fetch";
import { msg, translate, type Msg } from "@/lib/i18n/message";

// =============================================================================
// useWatchdog — connection watchdog configuration, activity and log
// =============================================================================
// cgi-bin/connection_watchdog: GET the configuration, POST it as JSON.
// cgi-bin/watchdog_events?limit=N: recent recovery actions (newest first),
//   the daemon's live state, the rate limit counters and the SIM failover.
// cgi-bin/get_watchdog_log?lines=N: the tail of /tmp/connection-watchdog.log.
// =============================================================================

export type SimRevertPolicy = "never" | "timer";

export interface WatchdogConfig {
  enabled: boolean;
  /** Comma-separated IPv4 targets */
  targets: string;
  failCount: number;
  checkInterval: number;
  pingTimeoutSec: number;
  bootGrace: number;
  /** Seconds after a recovery ladder before another one may start */
  recoveryCooldown: number;
  /** Tier 1: re-registration (AT+COPS=2, AT+COPS=0) */
  tier1Enabled: boolean;
  tier1Settle: number;
  /** Tier 2: radio restart (AT+CFUN=4, AT+CFUN=1) */
  tier2Enabled: boolean;
  tier2Settle: number;
  cfunDelay: number;
  cfunMaxAttempts: number;
  /** Tier 3: SIM slot switch (AT^SWITCH_SLOT) */
  tier3Enabled: boolean;
  tier3Settle: number;
  simRevert: SimRevertPolicy;
  simRevertAfter: number;
  /** Tier 4: reboot */
  tier4Enabled: boolean;
  maxRecoveriesPerHour: number;
  maxRebootsPerDay: number;
}

export const WATCHDOG_DEFAULTS: WatchdogConfig = {
  enabled: false,
  targets: "1.1.1.1,8.8.8.8",
  failCount: 3,
  checkInterval: 10,
  pingTimeoutSec: 5,
  bootGrace: 600,
  recoveryCooldown: 120,
  tier1Enabled: true,
  tier1Settle: 30,
  tier2Enabled: true,
  tier2Settle: 60,
  cfunDelay: 5,
  cfunMaxAttempts: 1,
  tier3Enabled: false,
  tier3Settle: 120,
  simRevert: "timer",
  simRevertAfter: 3600,
  tier4Enabled: true,
  maxRecoveriesPerHour: 6,
  maxRebootsPerDay: 3,
};

/** One line of /tmp/connection-watchdog.events. */
export interface WatchdogEvent {
  /** Unix seconds */
  ts: number;
  /** 1-4, 0 for events of the whole ladder */
  tier: number;
  /** offline, reregister, radio_restart, sim_switch, reboot, restored,
   *  no_effect, rate_limit, exhausted, sim_revert */
  event: string;
  /** ok, done, failed, skipped, warning */
  result: string;
  detail: string;
}

export interface WatchdogRuntime {
  /** Modem clock, Unix seconds */
  now: number;
  status: {
    /** online, offline, recovering, reverting, paused, disabled, stopped */
    state: string;
    tier: number;
    failStreak: number;
    updated: number;
    note: string;
  };
  limits: {
    recoveriesLastHour: number;
    maxRecoveriesPerHour: number;
    rebootsLastDay: number;
    maxRebootsPerDay: number;
  };
  simFailover: {
    active: boolean;
    originalSlot?: number;
    backupSlot?: number;
    since?: number;
  };
  events: WatchdogEvent[];
}

export interface SaveResult {
  ok: boolean;
  message?: string;
}

const LOG_LINES = 160;
const LOG_REFRESH_MS = 3000;
const EVENTS_LIMIT = 50;
const EVENTS_REFRESH_MS = 5000;

/** An error as the CGI wrote it, or our own text translated at render. */
type ErrorText = string | Msg | null;

const errorText = (t: TFunction, error: ErrorText): string | null =>
  error === null ? null : typeof error === "string" ? error : translate(t, error);

const num = (value: unknown, fallback: number) => {
  const n = Number(value);
  return value !== null && value !== "" && Number.isFinite(n) ? n : fallback;
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

function parseConfig(json: Record<string, unknown>): WatchdogConfig {
  const d = WATCHDOG_DEFAULTS;
  return {
    enabled: bool(json.enabled, d.enabled),
    targets: typeof json.targets === "string" && json.targets ? json.targets : d.targets,
    failCount: num(json.failCount, d.failCount),
    checkInterval: num(json.checkInterval, d.checkInterval),
    pingTimeoutSec: num(json.pingTimeoutSec, d.pingTimeoutSec),
    bootGrace: num(json.bootGrace, d.bootGrace),
    recoveryCooldown: num(json.recoveryCooldown, d.recoveryCooldown),
    tier1Enabled: bool(json.tier1Enabled, d.tier1Enabled),
    tier1Settle: num(json.tier1Settle, d.tier1Settle),
    tier2Enabled: bool(json.tier2Enabled, d.tier2Enabled),
    tier2Settle: num(json.tier2Settle, d.tier2Settle),
    cfunDelay: num(json.cfunDelay, d.cfunDelay),
    cfunMaxAttempts: num(json.cfunMaxAttempts, d.cfunMaxAttempts),
    tier3Enabled: bool(json.tier3Enabled, d.tier3Enabled),
    tier3Settle: num(json.tier3Settle, d.tier3Settle),
    simRevert: json.simRevert === "never" ? "never" : "timer",
    simRevertAfter: num(json.simRevertAfter, d.simRevertAfter),
    tier4Enabled: bool(json.tier4Enabled, d.tier4Enabled),
    maxRecoveriesPerHour: num(json.maxRecoveriesPerHour, d.maxRecoveriesPerHour),
    maxRebootsPerDay: num(json.maxRebootsPerDay, d.maxRebootsPerDay),
  };
}

export function useWatchdog() {
  const { t } = useTranslation("monitoring");
  const [config, setConfig] = useState<WatchdogConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ErrorText>(null);
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
      if (!json.success) throw new Error(json.message);
      setConfig(parseConfig(json));
      setError(null);
    } catch {
      if (mounted.current) setError(msg("monitoring:errors.config_read_failed"));
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const save = useCallback(async (next: WatchdogConfig): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const resp = await authFetch("/cgi-bin/connection_watchdog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success) {
        return { ok: false, message: json.message || `HTTP ${resp.status}` };
      }
      if (mounted.current) setConfig(parseConfig(json));
      return { ok: true };
    } catch {
      return { ok: false, message: t("common:at.unreachable") };
    } finally {
      if (mounted.current) setIsSaving(false);
    }
  }, [t]);

  return { config, isLoading, isSaving, error: errorText(t, error), save, reload: load };
}

/** Recovery activity and live state, refreshed while `active`. */
export function useWatchdogEvents(active: boolean) {
  const { t } = useTranslation("monitoring");
  const [runtime, setRuntime] = useState<WatchdogRuntime | null>(null);
  const [error, setError] = useState<ErrorText>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const resp = await authFetch(`/cgi-bin/watchdog_events?limit=${EVENTS_LIMIT}`, {
        cache: "no-store",
      });
      const json = await resp.json();
      if (!mounted.current) return;
      if (!json.success) throw new Error(json.message || `HTTP ${resp.status}`);
      setRuntime(json as WatchdogRuntime);
      setError(null);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : msg("monitoring:errors.activity_read_failed"));
      }
    } finally {
      if (mounted.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    // First read right away, then on the polling cadence.
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, EVENTS_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, refresh]);

  return { runtime, error: errorText(t, error), isRefreshing, refresh };
}

/** Tail of the watchdog log, refreshed while `active`. */
export function useWatchdogLog(active: boolean) {
  const { t } = useTranslation("monitoring");
  const [text, setText] = useState("");
  const [error, setError] = useState<ErrorText>(null);

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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : msg("monitoring:errors.log_read_failed"));
        }
      }
    };
    tick();
    const id = setInterval(tick, LOG_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return { text, error: errorText(t, error) };
}

export interface ConnectionChecks {
  /** Comma-separated hosts system_bridge pings */
  pingTargets: string;
  /** Comma-separated server:domain DNS lookups */
  dnsTests: string;
  /** Captive portal probe: an http:// URL answering 204; empty disables it */
  httpProbe: string;
  /** Seconds the probe may take, 1 to 9 */
  httpProbeTimeout: number;
  /** Seconds between the checks while no page is open (pings only), 10 to
   *  600 in steps of 10; also the step of the 24 h latency history */
  bgCheckInterval: number;
}

/**
 * The checks behind the dashboard's internet status (system_bridge reads
 * them from simpleadmin.conf): get_connection_config / set_connection_config.
 */
export function useConnectionChecks() {
  const { t } = useTranslation("monitoring");
  const [checks, setChecks] = useState<ConnectionChecks | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch("/cgi-bin/get_connection_config", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.status === "success") {
          setChecks({
            pingTargets: json.pingTargets || "",
            dnsTests: json.dnsTests || "",
            httpProbe: typeof json.httpProbe === "string" ? json.httpProbe : "",
            httpProbeTimeout: Number(json.httpProbeTimeout) || 5,
            bgCheckInterval: Number(json.bgCheckInterval) || 60,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: ConnectionChecks): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const resp = await authFetch("/cgi-bin/set_connection_config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await resp.json();
      if (json.status !== "success") {
        return { ok: false, message: json.message || t("errors.save_failed") };
      }
      setChecks(next);
      return { ok: true };
    } catch {
      return { ok: false, message: t("common:at.unreachable") };
    } finally {
      setIsSaving(false);
    }
  }, [t]);

  return { checks, isSaving, save };
}
