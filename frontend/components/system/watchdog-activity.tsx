"use client";

import { useState } from "react";
import type { TFunction } from "i18next";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  Loader2Icon,
  MinusCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WatchdogConfig, WatchdogEvent, WatchdogRuntime } from "@/hooks/use-watchdog";
import { cn } from "@/lib/utils";

// =============================================================================
// Watchdog status and recovery activity (cgi-bin/watchdog_events)
// =============================================================================

// Tiers and events with a label in the monitoring namespace (tier.N,
// event.<name>); any other event is shown by its name.
const TIERS = new Set([1, 2, 3, 4]);

const EVENTS = new Set([
  "offline",
  "reregister",
  "radio_restart",
  "sim_switch",
  "reboot",
  "restored",
  "no_effect",
  "rate_limit",
  "exhausted",
  "sim_revert",
]);

const BADGE = {
  success: "bg-success/15 text-success hover:bg-success/20 border-success/30",
  info: "bg-info/15 text-info hover:bg-info/20 border-info/30",
  warning: "bg-warning/15 text-warning hover:bg-warning/20 border-warning/30",
  destructive: "bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30",
  muted: "bg-muted/50 text-muted-foreground border-muted-foreground/30",
} as const;

function StatusBadge({ tone, icon, label }: { tone: keyof typeof BADGE; icon: React.ReactNode; label: string }) {
  return (
    <Badge variant="outline" className={BADGE[tone]}>
      {icon}
      {label}
    </Badge>
  );
}

function ResultBadge({ result }: { result: string }) {
  const { t } = useTranslation("monitoring");
  switch (result) {
    case "ok":
      return (
        <StatusBadge tone="success" icon={<CheckCircle2Icon className="size-3" />} label={t("result.ok")} />
      );
    case "done":
      return <StatusBadge tone="info" icon={<CheckCircle2Icon className="size-3" />} label={t("result.done")} />;
    case "failed":
      return (
        <StatusBadge tone="destructive" icon={<XCircleIcon className="size-3" />} label={t("result.failed")} />
      );
    case "warning":
      return (
        <StatusBadge tone="warning" icon={<TriangleAlertIcon className="size-3" />} label={t("result.warning")} />
      );
    default:
      return (
        <StatusBadge tone="muted" icon={<MinusCircleIcon className="size-3" />} label={t("result.skipped")} />
      );
  }
}

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const formatDateTime = (ts: number) => {
  const d = new Date(ts * 1000);
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
};

function stateBadge(t: TFunction, config: WatchdogConfig | null, runtime: WatchdogRuntime | null) {
  if (!config || !runtime) return null;
  const { state, tier, failStreak } = runtime.status;
  if (!config.enabled) {
    return (
      <StatusBadge tone="muted" icon={<MinusCircleIcon className="size-3" />} label={t("state.disabled")} />
    );
  }
  switch (state) {
    case "online":
      return (
        <StatusBadge tone="success" icon={<CheckCircle2Icon className="size-3" />} label={t("state.online")} />
      );
    case "offline":
      return (
        <StatusBadge
          tone="warning"
          icon={<TriangleAlertIcon className="size-3" />}
          label={t("state.failed_checks", { count: failStreak })}
        />
      );
    case "recovering":
      return (
        <StatusBadge
          tone="info"
          icon={<Loader2Icon className="size-3 animate-spin" />}
          label={t("state.recovering", {
            tier,
            name: TIERS.has(tier) ? t(`tier.${tier}`) : t("tier.fallback"),
          })}
        />
      );
    case "reverting":
      return (
        <StatusBadge
          tone="info"
          icon={<Loader2Icon className="size-3 animate-spin" />}
          label={t("state.reverting")}
        />
      );
    case "paused":
      return (
        <StatusBadge tone="muted" icon={<MinusCircleIcon className="size-3" />} label={t("state.paused")} />
      );
    default:
      return (
        <StatusBadge
          tone="destructive"
          icon={<AlertCircleIcon className="size-3" />}
          label={t("state.not_running")}
        />
      );
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

export function WatchdogStatusCard({
  config,
  runtime,
  error,
}: {
  config: WatchdogConfig | null;
  runtime: WatchdogRuntime | null;
  error: string | null;
}) {
  const { t } = useTranslation("monitoring");
  const failover = runtime?.simFailover;
  const revertAt =
    failover?.active && failover.since && config?.simRevert === "timer"
      ? failover.since + config.simRevertAfter
      : null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("status.title")}</CardTitle>
        <CardDescription>{t("status.description")}</CardDescription>
        <CardAction>{stateBadge(t, config, runtime)}</CardAction>
      </CardHeader>
      <CardContent>
        {error && !runtime ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <AlertCircleIcon className="size-4 shrink-0" />
            {error}
          </div>
        ) : !runtime || !config ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y rounded-lg border px-4" role="status" aria-live="polite">
            <Row label={t("status.checks")}>
              {runtime.status.failStreak > 0
                ? t("status.failed_in_row", {
                    count: runtime.status.failStreak,
                    threshold: config.failCount,
                  })
                : t("status.passing")}
            </Row>
            <Row label={t("status.recovery")}>
              {runtime.status.state === "recovering"
                ? t("status.recovering", { tier: runtime.status.tier })
                : runtime.status.state === "reverting"
                  ? t("status.reverting", { slot: failover?.originalSlot ?? "?" })
                  : t("status.idle")}
            </Row>
            <Row label={t("status.actions_hour")}>
              {t("status.used_of_max", {
                used: runtime.limits.recoveriesLastHour,
                max: runtime.limits.maxRecoveriesPerHour,
              })}
            </Row>
            <Row label={t("status.reboots_day")}>
              {t("status.used_of_max", {
                used: runtime.limits.rebootsLastDay,
                max: runtime.limits.maxRebootsPerDay,
              })}
            </Row>
            <Row label={t("status.failover")}>
              {failover?.active ? (
                <span className="text-warning">
                  {!failover.since
                    ? t("status.failover_on", { slot: failover.backupSlot ?? "" })
                    : revertAt
                      ? t("status.failover_revert", {
                          slot: failover.backupSlot ?? "",
                          since: formatTime(failover.since),
                          original: failover.originalSlot ?? "",
                          at: formatTime(revertAt),
                        })
                      : t("status.failover_since", {
                          slot: failover.backupSlot ?? "",
                          since: formatTime(failover.since),
                        })}
                </span>
              ) : (
                t("status.none")
              )}
            </Row>
            {runtime.status.note && (
              <p className="text-muted-foreground py-2 text-xs">{runtime.status.note}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PAGE_SIZE = 8;

export function WatchdogActivityCard({
  runtime,
  error,
  isRefreshing,
  onRefresh,
}: {
  runtime: WatchdogRuntime | null;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("monitoring");
  const [page, setPage] = useState(0);
  const events: WatchdogEvent[] = runtime?.events ?? [];
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = events.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("activity.title")}</CardTitle>
        <CardDescription>{t("activity.description")}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t("activity.refresh")}
          >
            <RefreshCwIcon className={cn("size-4", isRefreshing && "animate-spin motion-reduce:animate-none")} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error && !runtime ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <AlertCircleIcon className="size-4 shrink-0" />
            {error}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("activity.event")}</TableHead>
                  <TableHead className="hidden @md/card:table-cell">{t("activity.detail")}</TableHead>
                  <TableHead className="text-right">{t("activity.time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!runtime ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="hidden @md/card:table-cell">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-4 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="py-10">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <HistoryIcon className="text-muted-foreground size-8" />
                        <p className="text-sm font-medium">{t("activity.empty_title")}</p>
                        <p className="text-muted-foreground max-w-sm text-xs whitespace-normal">
                          {t("activity.empty_description")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((e, i) => {
                    const { date, time } = formatDateTime(e.ts);
                    return (
                      <TableRow key={`${e.ts}-${e.event}-${safePage}-${i}`}>
                        <TableCell className="align-top">
                          <div className="flex flex-col items-start gap-1">
                            <ResultBadge result={e.result} />
                            <span className="text-sm font-medium">
                              {EVENTS.has(e.event) ? t(`event.${e.event}`) : e.event}
                              {e.tier > 0 && (
                                <span className="text-muted-foreground font-normal">
                                  {" · "}
                                  {t("activity.tier", { tier: e.tier })}
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground text-xs whitespace-normal break-words @md/card:hidden">
                              {e.detail}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden align-top text-xs whitespace-normal break-words @md/card:table-cell">
                          {e.detail}
                        </TableCell>
                        <TableCell className="align-top text-right whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <span className="font-mono text-xs tabular-nums">{time}</span>
                            <span className="text-muted-foreground font-mono text-xs tabular-nums">{date}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {events.length > PAGE_SIZE && (
        <CardFooter className="justify-between gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("activity.page", { page: safePage + 1, count: pageCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              aria-label={t("activity.previous_page")}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label={t("activity.next_page")}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
