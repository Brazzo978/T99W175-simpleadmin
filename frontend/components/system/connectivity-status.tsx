"use client";

import type { TFunction } from "i18next";
import { TriangleAlertIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
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

// Labels are keys of the monitoring namespace.
const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "connectivity.badge.online", cls: "bg-success/15 text-success border-success/30" },
  warning: { label: "connectivity.badge.degraded", cls: "bg-warning/15 text-warning border-warning/30" },
  error: {
    label: "connectivity.badge.offline",
    cls: "bg-destructive/15 text-destructive border-destructive/30",
  },
  pending: { label: "connectivity.badge.checking", cls: "bg-muted text-muted-foreground" },
};

/** Failure reasons the bridge reports; any other is shown as it came. */
const REASONS = new Set(["dns", "connect", "timeout", "malformed", "url"]);

function probeText(t: TFunction, p: HttpProbe): string {
  switch (p.status) {
    case "ok":
      return t("connectivity.probe.ok", { code: p.code, time: p.time });
    case "portal":
      return t("connectivity.probe.portal", { code: p.code });
    case "failed": {
      const reason = REASONS.has(p.reason ?? "")
        ? t(`connectivity.reason.${p.reason}`)
        : (p.reason ?? t("connectivity.reason.unknown"));
      return t("connectivity.probe.failed", { reason });
    }
    default:
      return t("connectivity.pending");
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
  const { t } = useTranslation("monitoring");
  const p = conn.http;
  if (!conn.portal || !p) return null;
  return (
    <Alert className="border-warning/30 bg-warning/10 text-warning">
      <TriangleAlertIcon />
      <AlertTitle>{t("connectivity.portal_alert.title")}</AlertTitle>
      <AlertDescription className="text-foreground/80">
        <p>
          {p.location ? (
            <Trans
              t={t}
              i18nKey="connectivity.portal_alert.body_redirect"
              values={{ url: p.url, code: p.code, location: p.location }}
              components={{ location: <span className="break-all font-mono" /> }}
            />
          ) : (
            t("connectivity.portal_alert.body", { url: p.url, code: p.code })
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export default function ConnectivityStatusCard() {
  const { t } = useTranslation("monitoring");
  const { system } = useBridgeState();
  const conn = system?.conn;
  const status = conn ? STATUS[conn.status] ?? STATUS.pending : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectivity.title")}</CardTitle>
        <CardDescription>{t("connectivity.description")}</CardDescription>
        {status && (
          <CardAction>
            <Badge variant="outline" className={status.cls}>
              {conn?.portal ? t("connectivity.badge.portal") : t(status.label)}
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
                  label={t("connectivity.ping", { host: r.host })}
                  value={
                    r.status === "ok"
                      ? `${Math.round(r.time ?? 0)} ms`
                      : r.status === "failed"
                        ? t("connectivity.no_answer")
                        : t("connectivity.pending")
                  }
                  tone={r.status === "failed" ? "bad" : undefined}
                />
              ))}
              {(conn.dns?.results ?? []).map((r) => (
                <Row
                  key={`dns-${r.server}-${r.domain}`}
                  label={t("connectivity.dns", { domain: r.domain, server: r.server })}
                  value={
                    r.status === "ok"
                      ? t("connectivity.resolved")
                      : r.status === "failed"
                        ? t("connectivity.failed")
                        : t("connectivity.pending")
                  }
                  tone={r.status === "failed" ? "bad" : undefined}
                />
              ))}
              <Row
                label={
                  conn.http
                    ? t("connectivity.http", { url: conn.http.url })
                    : t("connectivity.http_probe")
                }
                value={conn.http ? probeText(t, conn.http) : t("connectivity.disabled")}
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
