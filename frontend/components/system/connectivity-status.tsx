"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBridgeState } from "@/hooks/use-bridge";
import type { HttpProbe, SystemSnapshot } from "@/types/bridge";

// =============================================================================
// ConnectivityStatusCard — system_bridge's last check round, live
// =============================================================================
// Each ping target, DNS lookup and the captive portal probe, with the
// overall status the dashboard shows. A probe answered with a redirect or a
// page (anything but 204) means a captive, billing or activation page sits
// on the path: the card says so in plain words.
// =============================================================================

type Conn = SystemSnapshot["conn"];

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "Online", cls: "bg-success/15 text-success border-success/30" },
  warning: { label: "Degraded", cls: "bg-warning/15 text-warning border-warning/30" },
  error: { label: "Offline", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  pending: { label: "Checking", cls: "bg-muted text-muted-foreground" },
};

const REASONS: Record<string, string> = {
  dns: "name not resolved",
  connect: "no connection",
  timeout: "no answer in time",
  malformed: "not an HTTP answer",
  url: "the URL is not http://",
};

function probeText(p: HttpProbe): string {
  switch (p.status) {
    case "ok":
      return `HTTP ${p.code} in ${p.time} ms`;
    case "portal":
      return `HTTP ${p.code} instead of 204`;
    case "failed":
      return `Failed: ${REASONS[p.reason ?? ""] ?? p.reason ?? "unknown"}`;
    default:
      return "Pending";
  }
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span
        className={`shrink-0 font-medium tabular-nums ${
          tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PortalAlert({ conn }: { conn: Conn }) {
  const p = conn.http;
  if (!conn.portal || !p) return null;
  return (
    <Alert className="border-warning/30 bg-warning/10 text-warning">
      <TriangleAlertIcon />
      <AlertTitle>Captive portal detected</AlertTitle>
      <AlertDescription className="text-foreground/80">
        <p>
          {p.url} answered with HTTP {p.code}
          {p.location ? <> and a redirect to <span className="break-all font-mono">{p.location}</span></> : null}
          {" "}instead of 204 No Content: the network is intercepting web traffic
          with a login, billing or activation page. Open any http:// site from a
          device on the LAN to see it; until it is accepted, data may be blocked
          or limited.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export default function ConnectivityStatusCard() {
  const { system } = useBridgeState();
  const conn = system?.conn;
  const status = conn ? STATUS[conn.status] ?? STATUS.pending : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectivity Status</CardTitle>
        <CardDescription>
          The last round of checks; system_bridge runs one every 10 seconds
          while a page is open (only the pings otherwise).
        </CardDescription>
        {status && (
          <CardAction>
            <Badge variant="outline" className={status.cls}>
              {conn?.portal ? "Captive portal" : status.label}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {!conn ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <PortalAlert conn={conn} />
            <div className="grid divide-y divide-border border-y border-border">
              {(conn.ping?.results ?? []).map((r) => (
                <Row
                  key={`ping-${r.host}`}
                  label={`Ping ${r.host}`}
                  value={
                    r.status === "ok"
                      ? `${Math.round(r.time ?? 0)} ms`
                      : r.status === "failed"
                        ? "No answer"
                        : "Pending"
                  }
                  tone={r.status === "failed" ? "bad" : undefined}
                />
              ))}
              {(conn.dns?.results ?? []).map((r) => (
                <Row
                  key={`dns-${r.server}-${r.domain}`}
                  label={`DNS ${r.domain} via ${r.server}`}
                  value={
                    r.status === "ok" ? "Resolved" : r.status === "failed" ? "Failed" : "Pending"
                  }
                  tone={r.status === "failed" ? "bad" : undefined}
                />
              ))}
              <Row
                label={conn.http ? `HTTP ${conn.http.url}` : "Captive portal probe"}
                value={conn.http ? probeText(conn.http) : "Disabled"}
                tone={
                  conn.http?.status === "portal"
                    ? "warn"
                    : conn.http?.status === "failed"
                      ? "bad"
                      : undefined
                }
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
