"use client";

import {
  CheckCircle2Icon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApplyState, ApplyStepStatus } from "@/hooks/use-sim-profiles";
import { cn } from "@/lib/utils";

// =============================================================================
// ApplyProgressDialog — the profile apply pipeline, step by step (DESIGN.md)
// =============================================================================
// Cannot be dismissed until the run reaches complete, partial or failed.
// Before the modem's first status line for this run it shows one honest
// "Preparing…" row, not a made-up step list.
// =============================================================================

const STEP_ICONS: Record<ApplyStepStatus, React.ReactNode> = {
  pending: <ClockIcon className="text-muted-foreground size-4" />,
  running: <Loader2Icon className="text-info size-4 animate-spin" />,
  done: <CircleCheckIcon className="text-success size-4" />,
  failed: <CircleXIcon className="text-destructive size-4" />,
  // Already as the profile wants it: nothing to do.
  skipped: <CircleCheckIcon className="text-muted-foreground size-4" />,
};

const STEP_LABELS: Record<string, string> = {
  apn: "APN",
  ttl: "TTL / Hop Limit",
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "complete":
      return (
        <Badge variant="outline" className="bg-success/15 text-success hover:bg-success/20 border-success/30">
          <CheckCircle2Icon className="size-3" />
          Complete
        </Badge>
      );
    case "partial":
      return (
        <Badge variant="outline" className="bg-warning/15 text-warning hover:bg-warning/20 border-warning/30">
          <TriangleAlertIcon className="size-3" />
          Partial
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="outline"
          className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30"
        >
          <XCircleIcon className="size-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-info/15 text-info hover:bg-info/20 border-info/30">
          <Loader2Icon className="size-3 animate-spin" />
          Applying…
        </Badge>
      );
  }
}

export function ApplyProgressDialog({
  open,
  state,
  error,
  onClose,
  onRetry,
}: {
  open: boolean;
  state: ApplyState | null;
  /** The start request failed: no run to follow */
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const terminal = !!state && state.status !== "applying";
  const closable = terminal || (!!error && !state);
  const steps = state?.steps ?? [];
  const apnRunning = steps.some((s) => s.name === "apn" && s.status === "running") &&
    /radio restarts/.test(steps.find((s) => s.name === "apn")?.detail ?? "");
  const canRetry = !!onRetry && (state?.status === "partial" || state?.status === "failed");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closable && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={closable}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Applying Profile
            {(state || !error) && <StatusBadge status={state?.status ?? "applying"} />}
          </DialogTitle>
          {state && (
            <DialogDescription className="flex items-center gap-2">
              <span>{state.name}</span>
              {state.status === "applying" && state.currentStep > 0 && (
                <>
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                  <span className="text-xs tabular-nums">
                    Step {state.currentStep} of {state.totalSteps}
                  </span>
                </>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {steps.length > 0 ? (
          <div className="space-y-1 py-2" role="status" aria-live="polite">
            {steps.map((step) => (
              <div
                key={step.name}
                className={cn(
                  "flex items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  step.status === "running" && "bg-info/5",
                )}
              >
                <div className="mt-0.5 shrink-0">{STEP_ICONS[step.status]}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{STEP_LABELS[step.name] ?? step.name}</div>
                  {step.detail ? (
                    <div className="text-muted-foreground truncate text-xs" title={step.detail}>
                      {step.detail}
                    </div>
                  ) : step.status === "skipped" ? (
                    <div className="text-muted-foreground text-xs">Unchanged</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : open && !error ? (
          <div className="space-y-1 py-2" role="status" aria-live="polite">
            <div className="bg-info/5 flex items-start gap-3 rounded-md px-3 py-2 text-sm">
              <div className="mt-0.5 shrink-0">
                <Loader2Icon className="text-info size-4 animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Preparing…</div>
                <div className="text-muted-foreground text-xs">Starting the profile apply</div>
              </div>
            </div>
          </div>
        ) : null}

        {apnRunning && (
          <div className="border-info/30 bg-info/15 text-info flex items-start gap-2 rounded-md border p-3 text-sm">
            <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin" />
            <div className="flex-1">
              <div>The radio is restarting to attach with the new APN.</div>
              <div className="text-info/80 mt-0.5 text-xs">
                The connection drops for about 10 to 20 seconds; this page reconnects by itself.
              </div>
            </div>
          </div>
        )}

        {error && !state && (
          <div className="border-destructive/30 bg-destructive/15 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
            <XCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {state?.status === "partial" && state.error && (
          <div className="border-warning/30 bg-warning/15 text-warning flex items-start gap-2 rounded-md border p-3 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}
        {state?.status === "failed" && state.error && (
          <div className="border-destructive/30 bg-destructive/15 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
            <XCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        {closable && (
          <div className="flex justify-end gap-2 pt-2">
            {canRetry && (
              <Button variant="outline" onClick={onRetry}>
                Retry
              </Button>
            )}
            <Button variant={canRetry ? "default" : "outline"} onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
