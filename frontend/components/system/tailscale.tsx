"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  LogInIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authFetch } from "@/lib/auth-fetch";

// cgi-bin/tailscale?action=status|install|login|update|up|down|remove
// (install and login take authkey). The binaries are downloaded from the
// SimpleAdmin repository by cgi-bin/tailscale-helper.
interface TailscaleStatus {
  installed: boolean;
  connected: boolean;
  statusLine: string;
  rawStatus: string;
}

/** A request the CGI refused without a message of its own. */
class RequestFailed extends Error {
  constructor(public readonly status: number) {
    super(`Request failed (${status})`);
  }
}

async function request(action: string, extra: Record<string, string> = {}) {
  const resp = await authFetch(
    `/cgi-bin/tailscale?${new URLSearchParams({ action, ...extra })}`,
    { cache: "no-store" },
  );
  const json = await resp.json();
  if (!resp.ok || json.status !== "ok") {
    throw json.message ? new Error(json.message) : new RequestFailed(resp.status);
  }
  return json;
}

export default function TailscaleComponent() {
  const { t } = useTranslation("tailscale");
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [authKey, setAuthKey] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const errorText = useCallback(
    (err: unknown, fallback: string) =>
      err instanceof RequestFailed
        ? t("toast.request_failed", { status: err.status })
        : err instanceof Error
          ? err.message
          : fallback,
    [t],
  );

  const refresh = useCallback(async () => {
    try {
      const json = await request("status");
      setStatus({
        installed: Boolean(json.installed),
        connected: Boolean(json.connected),
        statusLine: json.statusLine || "",
        rawStatus: json.rawStatus || "",
      });
    } catch (err) {
      toast.error(errorText(err, t("toast.status_failed")));
    }
  }, [errorText, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (action: string, label: string, extra?: Record<string, string>) => {
    setBusy(action);
    try {
      await request(action, extra);
      toast.success(label);
      if (extra?.authkey) setAuthKey("");
    } catch (err) {
      toast.error(errorText(err, t("toast.action_failed", { action })));
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const installed = status?.installed ?? false;

  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
    >
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{t("status.title")}</CardTitle>
              <CardDescription>{status?.statusLine || t("status.checking")}</CardDescription>
            </div>
            {status && (
              <Badge
                variant="outline"
                className={
                  !status.installed
                    ? "bg-muted text-muted-foreground"
                    : status.connected
                      ? "bg-success/15 text-success border-success/30"
                      : "bg-warning/15 text-warning border-warning/30"
                }
              >
                {!status.installed
                  ? t("status.not_installed")
                  : status.connected
                    ? t("status.online")
                    : t("status.offline")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!status ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {status.rawStatus || t("status.no_output")}
            </pre>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refresh()} disabled={busy !== null}>
            <RefreshCwIcon />
            {t("actions.refresh")}
          </Button>
          {installed && (
            <>
              <Button
                variant="outline"
                onClick={() => run("up", t("toast.started"))}
                disabled={busy !== null || status?.connected}
              >
                <PlayIcon />
                {t("actions.start")}
              </Button>
              <Button
                variant="outline"
                onClick={() => run("down", t("toast.stopped"))}
                disabled={busy !== null || !status?.connected}
              >
                <SquareIcon />
                {t("actions.stop")}
              </Button>
              <Button
                variant="outline"
                onClick={() => run("update", t("toast.updated"))}
                disabled={busy !== null}
              >
                <DownloadIcon />
                {t("actions.update")}
              </Button>
              <Button variant="destructive" onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
                <Trash2Icon />
                {t("actions.remove")}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {installed ? t("login.title_installed") : t("login.title_install")}
          </CardTitle>
          <CardDescription>
            {installed
              ? t("login.description_installed")
              : t("login.description_install")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="ts-key">{t("login.auth_key")}</Label>
          <Input
            id="ts-key"
            type="password"
            autoComplete="off"
            placeholder="tskey-auth-…"
            value={authKey}
            onChange={(e) => setAuthKey(e.target.value)}
          />
        </CardContent>
        <CardFooter>
          <Button
            disabled={busy !== null || !authKey.trim() || !status}
            onClick={() =>
              installed
                ? run("login", t("toast.logged_in"), { authkey: authKey.trim() })
                : run("install", t("toast.installed"), { authkey: authKey.trim() })
            }
          >
            {installed ? <LogInIcon /> : <DownloadIcon />}
            {busy === "install"
              ? t("common:state.installing")
              : installed
                ? t("actions.log_in")
                : t("actions.install")}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("remove_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("remove_dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmRemove(false);
                run("remove", t("toast.removed"));
              }}
            >
              {t("remove_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
