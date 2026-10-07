"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

// =============================================================================
// useEsim — eSIM profiles through the euicc-client LPA service
// =============================================================================
// cgi-bin/esim_config gives {enabled, base_url}; the REST API of euicc-client
// lives at base_url (/eid, /profiles, /notifications, /profile/*, /download).
// A base_url on localhost is the modem itself: the browser reaches it at the
// page's own host, same port.
// =============================================================================

export interface EsimProfile {
  iccid: string;
  enabled: boolean;
  profile_nickname?: string;
  service_provider_name?: string;
  profile_name?: string;
}

export interface EsimNotification {
  iccid: string;
  sequence_number: number;
  operation_name?: string;
  address?: string;
}

export interface EsimServerConfig {
  imei: string;
  slot: 1 | 2;
  refresh: boolean;
}

export interface DownloadRequest {
  smdp: string;
  matching_id: string;
  confirmation_code?: string;
  auto_confirm: boolean;
}

function browserBaseUrl(configured: string): string {
  const clean = configured.replace(/\/+$/, "");
  try {
    const url = new URL(clean);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = window.location.hostname;
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    // not a URL: used as is
  }
  return clean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useEsim() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [clientInstalled, setClientInstalled] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [eid, setEid] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<EsimProfile[]>([]);
  const [notifications, setNotifications] = useState<EsimNotification[]>([]);
  const [serverConfig, setServerConfig] = useState<EsimServerConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const baseRef = useRef("");

  const api = useCallback(async (path: string, body?: unknown) => {
    const resp = await fetch(`${baseRef.current}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!resp.ok) throw new Error((await resp.text()) || `Request failed (${resp.status})`);
    return resp.json();
  }, []);

  const loadLists = useCallback(async () => {
    const p = await api("/profiles");
    setProfiles(p?.data?.profiles ?? []);
    // euicc-client serializes card access: give it a moment between calls.
    await sleep(500);
    const n = await api("/notifications");
    setNotifications(n?.data?.notifications ?? []);
  }, [api]);

  const bootstrap = useCallback(async () => {
    try {
      const resp = await authFetch("/cgi-bin/esim_config", { cache: "no-store" });
      const json = await resp.json();
      const on = json.success === true && Number(json.data?.enabled) === 1;
      setEnabled(on);
      setClientInstalled(json.data?.client_installed !== false);
      if (!on) return;
      baseRef.current = browserBaseUrl(json.data?.base_url ?? "");
      setBaseUrl(baseRef.current);
    } catch {
      setEnabled(false);
      return;
    }
    try {
      const cfg = await (await authFetch("/cgi-bin/get_esim_server_config", { cache: "no-store" })).json();
      if (cfg.ok) {
        setServerConfig({
          imei: cfg.data.imei || "",
          slot: Number(cfg.data.slot) === 1 ? 1 : 2,
          refresh: cfg.data.refresh === true || cfg.data.refresh === "true",
        });
      }
    } catch {
      // optional
    }
    try {
      const e = await api("/eid");
      setEid(e?.data?.eid ?? null);
      setHealthy(Boolean(e?.data?.eid));
      await loadLists();
    } catch {
      setHealthy(false);
    }
  }, [api, loadLists]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  /** Runs an LPA call with the busy flag, returning an error message or null. */
  const run = useCallback(
    async (key: string, action: () => Promise<void>): Promise<string | null> => {
      setBusy(key);
      try {
        await action();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Request failed";
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const enableProfile = (iccid: string) =>
    run(`enable-${iccid}`, async () => {
      await api("/profile/enable", { iccid });
      // The card needs a few seconds to switch profiles.
      await sleep(3000);
      await loadLists();
    });

  const disableProfile = (iccid: string) =>
    run(`disable-${iccid}`, async () => {
      await api("/profile/disable", { iccid });
      await sleep(500);
      await loadLists();
    });

  const deleteProfile = (iccid: string) =>
    run(`delete-${iccid}`, async () => {
      await api("/profile/delete", { iccid });
      await loadLists();
    });

  const setNickname = (iccid: string, nickname: string) =>
    run(`nickname-${iccid}`, async () => {
      await api("/profile/nickname", { iccid, nickname });
      await loadLists();
    });

  const download = (req: DownloadRequest) =>
    run("download", async () => {
      const body: Partial<DownloadRequest> = { ...req };
      if (!body.confirmation_code) delete body.confirmation_code;
      await api("/download", body);
      await loadLists();
    });

  const processNotification = (iccid: string, seq: number, remove: boolean) =>
    run(`notif-${iccid}-${seq}`, async () => {
      await api("/notifications/process", { iccid, sequence_number: seq, process_all: false });
      if (remove) await api("/notifications/remove", { iccid, sequence_number: seq });
      await loadLists();
    });

  const removeNotification = (iccid: string, seq: number) =>
    run(`notif-${iccid}-${seq}`, async () => {
      await api("/notifications/remove", { iccid, sequence_number: seq });
      await loadLists();
    });

  const processAll = () =>
    run("notif-all", async () => {
      const iccids = [...new Set(notifications.map((n) => n.iccid).filter(Boolean))];
      for (const iccid of iccids) await api("/notifications/process", { iccid, process_all: true });
      await loadLists();
    });

  const removeAll = () =>
    run("notif-all", async () => {
      await api("/notifications/remove", { remove_all: true });
      await loadLists();
    });

  /** Rewrites the euicc-client configuration and restarts the service. */
  const saveServerConfig = (cfg: EsimServerConfig) =>
    run("server", async () => {
      const resp = await authFetch("/cgi-bin/esim_server_config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || "Unable to save");
      setServerConfig(cfg);
      await sleep(2000);
      await bootstrap();
    });

  return {
    enabled,
    clientInstalled,
    baseUrl,
    healthy,
    eid,
    profiles,
    notifications,
    serverConfig,
    busy,
    refresh: loadLists,
    enableProfile,
    disableProfile,
    deleteProfile,
    setNickname,
    download,
    processNotification,
    removeNotification,
    processAll,
    removeAll,
    saveServerConfig,
  };
}
