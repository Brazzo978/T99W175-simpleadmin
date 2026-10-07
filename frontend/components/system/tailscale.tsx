"use client";

import { useCallback, useEffect, useState } from "react";
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

async function request(action: string, extra: Record<string, string> = {}) {
  const resp = await authFetch(
    `/cgi-bin/tailscale?${new URLSearchParams({ action, ...extra })}`,
    { cache: "no-store" },
  );
  const json = await resp.json();
  if (!resp.ok || json.status !== "ok") {
    throw new Error(json.message || `Request failed (${resp.status})`);
  }
  return json;
}

export default function TailscaleComponent() {
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [authKey, setAuthKey] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

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
      toast.error(err instanceof Error ? err.message : "Unable to read the Tailscale status");
    }
  }, []);

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
      toast.error(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const installed = status?.installed ?? false;

  return (
    <PageShell
      title="Tailscale VPN"
      description="Reach this modem and its LAN from your tailnet, without opening ports on the mobile network."
    >
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Status</CardTitle>
              <CardDescription>{status?.statusLine || "Checking…"}</CardDescription>
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
                {!status.installed ? "Not installed" : status.connected ? "Online" : "Offline"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!status ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {status.rawStatus || "No status output."}
            </pre>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refresh()} disabled={busy !== null}>
            <RefreshCwIcon />
            Refresh
          </Button>
          {installed && (
            <>
              <Button
                variant="outline"
                onClick={() => run("up", "Tailscale started")}
                disabled={busy !== null || status?.connected}
              >
                <PlayIcon />
                Start
              </Button>
              <Button
                variant="outline"
                onClick={() => run("down", "Tailscale stopped")}
                disabled={busy !== null || !status?.connected}
              >
                <SquareIcon />
                Stop
              </Button>
              <Button variant="outline" onClick={() => run("update", "Tailscale updated")} disabled={busy !== null}>
                <DownloadIcon />
                Update
              </Button>
              <Button variant="destructive" onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
                <Trash2Icon />
                Remove
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{installed ? "Log In" : "Install"}</CardTitle>
          <CardDescription>
            {installed
              ? "Log in again with a new auth key from the Tailscale admin console."
              : "Downloads Tailscale to the modem and logs in with an auth key from the Tailscale admin console."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="ts-key">Auth key</Label>
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
                ? run("login", "Logged in", { authkey: authKey.trim() })
                : run("install", "Tailscale installed", { authkey: authKey.trim() })
            }
          >
            {installed ? <LogInIcon /> : <DownloadIcon />}
            {busy === "install" ? "Installing…" : installed ? "Log In" : "Install"}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Tailscale?</AlertDialogTitle>
            <AlertDialogDescription>
              Tailscale is uninstalled from the modem. If you are connected
              through Tailscale you lose access to this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmRemove(false);
                run("remove", "Tailscale removed");
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
