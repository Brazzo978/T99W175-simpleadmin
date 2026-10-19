"use client";

import { useState } from "react";
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

const TIER_NAMES: Record<number, string> = {
  1: "Re-registration",
  2: "Radio restart",
  3: "SIM switch",
  4: "Reboot",
};

const EVENT_LABELS: Record<string, string> = {
  offline: "Connection lost",
  reregister: "Re-registration",
  radio_restart: "Radio restart",
  sim_switch: "SIM switch",
  reboot: "Reboot",
  restored: "Connection restored",
  no_effect: "No effect",
  rate_limit: "Recovery limit",
  exhausted: "Ladder exhausted",
  sim_revert: "Original SIM",
};

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
  switch (result) {
    case "ok":
      return <StatusBadge tone="success" icon={<CheckCircle2Icon className="size-3" />} label="Restored" />;
    case "done":
      return <StatusBadge tone="info" icon={<CheckCircle2Icon className="size-3" />} label="Done" />;
    case "failed":
      return <StatusBadge tone="destructive" icon={<XCircleIcon className="size-3" />} label="Failed" />;
    case "warning":
      return <StatusBadge tone="warning" icon={<TriangleAlertIcon className="size-3" />} label="Offline" />;
    default:
      return <StatusBadge tone="muted" icon={<MinusCircleIcon className="size-3" />} label="Skipped" />;
  }
}

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const formatDateTime = (ts: number) => {
  const d = new Date(ts * 1000);
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
};

function stateBadge(config: WatchdogConfig | null, runtime: WatchdogRuntime | null) {
  if (!config || !runtime) return null;
  const { state, tier, failStreak } = runtime.status;
  if (!config.enabled) {
    return <StatusBadge tone="muted" icon={<MinusCircleIcon className="size-3" />} label="Disabled" />;
  }
  switch (state) {
    case "online":
      return <StatusBadge tone="success" icon={<CheckCircle2Icon className="size-3" />} label="Online" />;
    case "offline":
      return (
        <StatusBadge
          tone="warning"
          icon={<TriangleAlertIcon className="size-3" />}
          label={`${failStreak} failed check${failStreak === 1 ? "" : "s"}`}
        />
      );
    case "recovering":
      return (
        <StatusBadge
          tone="info"
          icon={<Loader2Icon className="size-3 animate-spin" />}
          label={`Tier ${tier}: ${TIER_NAMES[tier] ?? "recovery"}`}
        />
      );
    case "reverting":
      return (
        <StatusBadge tone="info" icon={<Loader2Icon className="size-3 animate-spin" />} label="Trying the original SIM" />
      );
    case "paused":
      return <StatusBadge tone="muted" icon={<MinusCircleIcon className="size-3" />} label="Paused" />;
    default:
      return <StatusBadge tone="destructive" icon={<AlertCircleIcon className="size-3" />} label="Not running" />;
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
  const failover = runtime?.simFailover;
  const revertAt =
    failover?.active && failover.since && config?.simRevert === "timer"
      ? failover.since + config.simRevertAfter
      : null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Watchdog Status</CardTitle>
        <CardDescription>What the watchdog is doing now, refreshed every 5 seconds.</CardDescription>
        <CardAction>{stateBadge(config, runtime)}</CardAction>
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
            <Row label="Connection checks">
              {runtime.status.failStreak > 0
                ? `${runtime.status.failStreak} failed in a row (acts at ${config.failCount})`
                : "Passing"}
            </Row>
            <Row label="Recovery">
              {runtime.status.state === "recovering"
                ? `Tier ${runtime.status.tier}, waiting for the connection`
                : runtime.status.state === "reverting"
                  ? `Back on SIM ${failover?.originalSlot ?? "?"}, checking`
                  : "Idle"}
            </Row>
            <Row label="Actions in the last hour">
              {runtime.limits.recoveriesLastHour} of {runtime.limits.maxRecoveriesPerHour}
            </Row>
            <Row label="Reboots in 24 hours">
              {runtime.limits.rebootsLastDay} of {runtime.limits.maxRebootsPerDay}
            </Row>
            <Row label="SIM failover">
              {failover?.active ? (
                <span className="text-warning">
                  On SIM {failover.backupSlot}
                  {failover.since ? ` since ${formatTime(failover.since)}` : ""}
                  {revertAt ? `, SIM ${failover.originalSlot} again at ${formatTime(revertAt)}` : ""}
                </span>
              ) : (
                "None"
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
  const [page, setPage] = useState(0);
  const events: WatchdogEvent[] = runtime?.events ?? [];
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = events.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Recovery Activity</CardTitle>
        <CardDescription>
          Every step the watchdog took, newest first (kept in memory until the next reboot).
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh recovery activity"
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
                  <TableHead>Event</TableHead>
                  <TableHead className="hidden @md/card:table-cell">Detail</TableHead>
                  <TableHead className="text-right">Time</TableHead>
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
                        <p className="text-sm font-medium">No recovery activity yet</p>
                        <p className="text-muted-foreground max-w-sm text-xs whitespace-normal">
                          Recovery steps appear here when the watchdog acts on an outage.
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
                              {EVENT_LABELS[e.event] ?? e.event}
                              {e.tier > 0 && (
                                <span className="text-muted-foreground font-normal"> · tier {e.tier}</span>
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
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
