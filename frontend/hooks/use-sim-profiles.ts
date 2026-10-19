"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { authFetch } from "@/lib/auth-fetch";
import { msg, translate, type Msg } from "@/lib/i18n/message";
import type { PdpType } from "@/lib/radio-at";

// =============================================================================
// useSimProfiles / useProfileApply — per-SIM profiles (cgi-bin/sim_profiles)
// =============================================================================
// GET                the profiles, the active SIM with its settings, last apply
// GET ?status=1      progress of the running or last apply
// POST {action}      save | delete | apply (apply runs in the background on the
//                    modem: /opt/scripts/sim-profiles/sim-profiles apply)
// =============================================================================

const ENDPOINT = "/cgi-bin/sim_profiles";
const POLL_MS = 1000;

export interface SimProfile {
  /** Digits only, the key of the profile */
  iccid: string;
  name: string;
  /** Empty: the APN is left as it is */
  apn: string;
  pdpType: PdpType;
  /** "" leaves the TTL as it is, "0" turns the override off */
  ttl: string;
  /** Unix seconds */
  updated: number;
}

export interface ActiveSim {
  iccid: string;
  slot: number;
  simReady: boolean;
}

export interface CurrentSettings {
  apn: string;
  pdpType: string;
  ttl: number;
}

export type ApplyStepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type ApplyStatus = "idle" | "applying" | "complete" | "partial" | "failed";

export interface ApplyState {
  id: string;
  status: ApplyStatus;
  iccid: string;
  name: string;
  /** manual, sim_change, watchdog */
  trigger: string;
  started: number;
  finished: number;
  currentStep: number;
  totalSteps: number;
  steps: { name: string; status: ApplyStepStatus; detail: string }[];
  error: string | null;
}

export interface SimProfilesData {
  installed: boolean;
  active: ActiveSim | null;
  current: CurrentSettings | null;
  profiles: SimProfile[];
  lastApply: ApplyState | null;
}

export interface ProfileResult {
  ok: boolean;
  message?: string;
}

/** An error as the CGI wrote it, or our own text translated at render. */
type ErrorText = string | Msg | null;

const errorText = (t: TFunction, error: ErrorText): string | null =>
  error === null ? null : typeof error === "string" ? error : translate(t, error);

async function post(
  body: Record<string, string>,
): Promise<ProfileResult & { msg?: Msg; json?: Record<string, unknown> }> {
  try {
    const resp = await authFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.success) {
      return { ok: false, message: json.message || `HTTP ${resp.status}`, json };
    }
    return { ok: true, json };
  } catch {
    return { ok: false, message: "Modem unreachable", msg: msg("common:at.unreachable") };
  }
}

export function useSimProfiles() {
  const { t } = useTranslation("sim-profiles");
  const [data, setData] = useState<SimProfilesData | null>(null);
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
      const resp = await authFetch(ENDPOINT, { cache: "no-store" });
      const json = await resp.json();
      if (!mounted.current) return;
      if (!json.success) throw new Error(json.message || `HTTP ${resp.status}`);
      setData({
        installed: Boolean(json.installed),
        active: json.active ?? null,
        current: json.current ?? null,
        profiles: Array.isArray(json.profiles) ? json.profiles : [],
        lastApply: json.lastApply?.id ? json.lastApply : null,
      });
      setError(null);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : msg("sim-profiles:errors.read_failed"));
      }
    } finally {
      if (mounted.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(refresh, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const save = useCallback(
    async (profile: Omit<SimProfile, "updated">, previousIccid?: string): Promise<ProfileResult> => {
      const result = await post({
        action: "save",
        iccid: profile.iccid,
        previousIccid: previousIccid ?? "",
        name: profile.name,
        apn: profile.apn,
        pdpType: profile.pdpType,
        ttl: profile.ttl,
      });
      if (result.ok) await refresh();
      return { ok: result.ok, message: result.msg ? translate(t, result.msg) : result.message };
    },
    [refresh, t],
  );

  const remove = useCallback(
    async (iccid: string): Promise<ProfileResult> => {
      const result = await post({ action: "delete", iccid });
      if (result.ok) await refresh();
      return { ok: result.ok, message: result.msg ? translate(t, result.msg) : result.message };
    },
    [refresh, t],
  );

  return { data, error: errorText(t, error), isRefreshing, refresh, save, remove };
}

/**
 * Starts an apply and follows it until it ends. The modem answers the id of
 * the run; status lines of an earlier run are not shown as this one.
 */
export function useProfileApply(onFinished?: () => void) {
  const { t } = useTranslation("sim-profiles");
  const [state, setState] = useState<ApplyState | null>(null);
  const [error, setError] = useState<ErrorText>(null);
  const [open, setOpen] = useState(false);
  const runId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finished = useRef(onFinished);

  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const poll = useCallback(async () => {
    try {
      const resp = await authFetch(`${ENDPOINT}?status=1`, { cache: "no-store" });
      const json = (await resp.json()) as ApplyState;
      if (!json.id || json.id !== runId.current) return;
      setState(json);
      if (json.status !== "applying") {
        stop();
        finished.current?.();
      }
    } catch {
      // The radio restart can drop a poll; the next one catches up.
    }
  }, [stop]);

  const apply = useCallback(
    async (iccid: string) => {
      stop();
      setState(null);
      setError(null);
      setOpen(true);
      runId.current = null;
      const result = await post({ action: "apply", iccid });
      const id = result.json?.id;
      if (!result.ok || typeof id !== "string") {
        setError(result.msg ?? (result.message || msg("sim-profiles:errors.apply_start_failed")));
        return;
      }
      runId.current = id;
      timer.current = setInterval(poll, POLL_MS);
      poll();
    },
    [poll, stop],
  );

  const close = useCallback(() => {
    stop();
    setOpen(false);
  }, [stop]);

  return { state, error: errorText(t, error), open, apply, close };
}
