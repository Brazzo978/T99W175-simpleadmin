"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function MetricBar({
  value,
  max = 100,
  warnAt,
  dangerAt,
  colorOverride,
}: {
  value: number;
  max?: number;
  warnAt: number;
  dangerAt: number;
  colorOverride?: "primary" | "warning" | "destructive";
}) {
  const pct = Math.min((value / max) * 100, 100);
  const colorClass = colorOverride
    ? `bg-${colorOverride}`
    : value >= dangerAt
      ? "bg-destructive"
      : value >= warnAt
        ? "bg-warning"
        : "bg-primary";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className={cn("h-full rounded-full", colorClass)}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        style={{ originX: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 24 }}
      />
    </div>
  );
}
