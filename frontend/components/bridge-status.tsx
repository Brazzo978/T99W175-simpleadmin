"use client";

import { useMemo, useState } from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBridgeStatePassive, useNow } from "@/hooks/use-bridge";
import { DIAG_STALE_MS, SYSTEM_STALE_MS, pickRadio } from "@/lib/bridge/radio";
import { holdConnections, type LinkState } from "@/lib/bridge/store";
import { cn } from "@/lib/utils";

// =============================================================================
// BridgeStatus — header badges for diag_bridge and system_bridge
// =============================================================================
// Passive: it reads the shared bridge store without connecting, so it never
// makes the bridges poll the modem by itself. On pages that use live data it
// shows the real link state; elsewhere the links are idle ("standby"), and
// "Check now" connects both for a few seconds.
// =============================================================================

const CHECK_MS = 8000;

type Health = "ok" | "stale" | "connecting" | "down" | "standby";

const DOT: Record<Health, string> = {
  ok: "bg-success",
  stale: "bg-warning",
  connecting: "bg-warning animate-pulse",
  down: "bg-destructive",
  standby: "bg-muted-foreground/50",
};

const LABEL: Record<Health, string> = {
  ok: "Connected",
  stale: "Connected, no recent data",
  connecting: "Connecting…",
  down: "Unreachable",
  standby: "Standby: not needed on this page",
};

function health(link: LinkState, lastAt: number, now: number, staleMs: number): Health {
  if (link === "idle") return "standby";
  if (link === "connecting") return "connecting";
  if (link === "disconnected") return "down";
  return lastAt && now - lastAt < staleMs ? "ok" : "stale";
}

function age(lastAt: number, now: number): string {
  if (!lastAt) return "never";
  const s = Math.max(0, Math.round((now - lastAt) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

function Row({
  name,
  port,
  role,
  state,
  lastAt,
  now,
}: {
  name: string;
  port: number;
  role: string;
  state: Health;
  lastAt: number;
  now: number;
}) {
  return (
    <div className="grid gap-0.5 rounded-md border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">port {port}</span>
      </div>
      <span className="text-xs text-muted-foreground">{role}</span>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className={cn("size-2 rounded-full", DOT[state])} />
        {LABEL[state]}
      </div>
      <span className="text-xs text-muted-foreground">Last message: {age(lastAt, now)}</span>
    </div>
  );
}

export function BridgeStatus() {
  const state = useBridgeStatePassive();
  const now = useNow();
  const [checking, setChecking] = useState(false);

  const diag = health(state.diagLink, state.diagAt, now, DIAG_STALE_MS);
  const system = health(state.systemLink, state.systemAt, now, SYSTEM_STALE_MS);
  const { source } = useMemo(() => pickRadio(state, now), [state, now]);

  const check = () => {
    setChecking(true);
    holdConnections(CHECK_MS);
    setTimeout(() => setChecking(false), CHECK_MS);
  };

  const badge = (label: string, h: Health) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", DOT[h])} />
      {label}
    </span>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-3 font-mono text-xs"
          aria-label={`diag_bridge: ${LABEL[diag]}; system_bridge: ${LABEL[system]}`}
        >
          {badge("DIAG", diag)}
          {badge("SYS", system)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Live data bridges</PopoverTitle>
          <PopoverDescription>
            Radio source now:{" "}
            {diag === "standby" && system === "standby"
              ? "— (not connected)"
              : source === "diag"
                ? "DIAG"
                : source === "qmi"
                  ? "QMI (diag_bridge not available)"
                  : "none"}
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 grid gap-2">
          <Row
            name="diag_bridge"
            port={9001}
            role="Radio: cells, signal, per-antenna values (Qualcomm DIAG)"
            state={diag}
            lastAt={state.diagAt}
            now={now}
          />
          <Row
            name="system_bridge"
            port={9002}
            role="QMI identity and radio, system stats, connectivity checks"
            state={system}
            lastAt={state.systemAt}
            now={now}
          />
        </div>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={check} disabled={checking}>
          {checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          {checking ? "Checking…" : "Check now"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
