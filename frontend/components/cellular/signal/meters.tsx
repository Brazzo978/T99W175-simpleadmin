"use client";

import { cn } from "@/lib/utils";
import { qualityFill, type Quality } from "./metrics";

/** Discrete 0..max meter (CQI): one segment per step, filled up to value. */
export function SegmentMeter({
  value,
  max,
  quality,
  label,
}: {
  value: number | null | undefined;
  max: number;
  quality: Quality;
  label: string;
}) {
  const filled = typeof value === "number" ? Math.round(value) : 0;
  return (
    <div
      className="flex h-2 gap-0.5"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={typeof value === "number" ? value : undefined}
    >
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[2px] transition-colors duration-200",
            i < filled ? qualityFill(quality) : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

/** Continuous meter over [min, max], with an optional marker (e.g. Pcmax). */
export function RangeMeter({
  value,
  min,
  max,
  quality,
  label,
  marker,
}: {
  value: number | null | undefined;
  min: number;
  max: number;
  quality: Quality;
  label: string;
  marker?: number | null;
}) {
  const at = (v: number) =>
    Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const has = typeof value === "number";
  return (
    <div
      className="relative h-2 rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={has ? value : undefined}
    >
      {has && (
        <div
          className={cn(
            "h-full origin-left rounded-full transition-transform duration-200",
            qualityFill(quality),
          )}
          style={{ transform: `scaleX(${at(value) / 100})` }}
        />
      )}
      {typeof marker === "number" && (
        <div
          className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground/60"
          style={{ left: `calc(${at(marker)}% - 1px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

/** Rank as four slots, the used layers filled. */
export function RankDots({
  rank,
  label,
}: {
  rank: number | null | undefined;
  label: string;
}) {
  const r = typeof rank === "number" ? Math.round(rank) : 0;
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "size-2.5 rounded-full transition-colors duration-200",
            i <= r ? "bg-foreground/70" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
