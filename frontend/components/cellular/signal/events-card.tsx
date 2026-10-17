"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftRightIcon,
  BellIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  LayersIcon,
  RadioTowerIcon,
  Trash2Icon,
  XCircleIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RadioEvent } from "@/lib/bridge/store";
import { clearRadioEvents } from "@/lib/bridge/store";
import { cn } from "@/lib/utils";
import type { RrcInfo } from "@/types/bridge";

// --- Classification ----------------------------------------------------------

type Category = "failure" | "mobility" | "rrc" | "rach" | "ca" | "paging" | "other";

const CATEGORIES: Record<Category, { label: string; icon: LucideIcon }> = {
  failure: { label: "Failure", icon: XCircleIcon },
  mobility: { label: "Mobility", icon: ArrowLeftRightIcon },
  rrc: { label: "RRC state", icon: RadioTowerIcon },
  rach: { label: "RACH", icon: ZapIcon },
  ca: { label: "Carrier agg.", icon: LayersIcon },
  paging: { label: "Paging", icon: BellIcon },
  other: { label: "Other", icon: CircleDotIcon },
};

const FILTERS: { value: "all" | Category; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failure", label: "Failures" },
  { value: "mobility", label: "Mobility" },
  { value: "rrc", label: "RRC" },
  { value: "rach", label: "RACH" },
  { value: "ca", label: "CA" },
];

function categoryOf(name: string): Category {
  const n = name.toUpperCase();
  if (/FAIL|RLF|RADIO_LINK|OUT_OF_SERVICE|_OOS/.test(n)) return "failure";
  if (/HANDOVER|_HO_|_HO$|NEW_CELL|RESELECT|REDIRECT/.test(n)) return "mobility";
  if (/RACH|RANDOM_ACCESS/.test(n)) return "rach";
  if (/SCELL|_CA_|SCG_ADD|SCG_CONFIG/.test(n)) return "ca";
  if (/PAGING/.test(n)) return "paging";
  if (/STATE|CONNECTION|RRC/.test(n)) return "rrc";
  return "other";
}

/** A good outcome inside a category (handover or RACH success). */
function succeeded(e: RadioEvent): boolean {
  if (/SUCCESS/i.test(e.name)) return true;
  return Object.entries(e.f ?? {}).some(
    ([k, v]) => /result|status/i.test(k) && /^success/i.test(String(v)),
  );
}

const ACRONYMS = new Set([
  "SCG", "MCG", "RLF", "HO", "RACH", "PCI", "TA", "PHR", "EPHR", "BSR", "OOS",
  "IRAT", "MIB", "SIB", "PDCP", "RLC", "MAC", "RRC", "CA", "NR", "LTE", "UE",
  "DRX", "ML1", "LL1", "NAS", "EMM", "ESM", "SR", "CSI", "CQI", "TDD", "FDD",
]);

/** EVENT_NR5G_RRC_SCG_FAILURE -> { rat: "5G", layer: "RRC", title: "SCG failure" } */
function describe(name: string): { rat: "LTE" | "5G" | null; layer: string | null; title: string } {
  let parts = name.replace(/^EVENT_/, "").split("_").filter(Boolean);
  let rat: "LTE" | "5G" | null = null;
  if (parts[0] === "LTE") {
    rat = "LTE";
    parts = parts.slice(1);
  } else if (parts[0] === "NR5G" || parts[0] === "NR") {
    rat = "5G";
    parts = parts.slice(1);
  }
  let layer: string | null = null;
  if (parts.length > 1 && ["RRC", "ML1", "LL1", "MAC", "NAS", "EMM", "PDCP", "RLC"].includes(parts[0])) {
    layer = parts[0];
    parts = parts.slice(1);
  }
  const words = parts.map((w, i) => {
    if (w === "IND") return "indication";
    if (w === "SCELL") return "SCell";
    if (/^V\d+$/.test(w)) return w.toLowerCase();
    if (ACRONYMS.has(w)) return w;
    const lower = w.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  });
  return { rat, layer, title: words.join(" ") || name };
}

// --- Pieces ------------------------------------------------------------------

function CategoryBadge({ category, ok }: { category: Category; ok: boolean }) {
  const { label, icon: Icon } = CATEGORIES[category];
  const tint =
    category === "failure"
      ? "border-destructive/30 bg-destructive/15 text-destructive"
      : ok
        ? "border-success/30 bg-success/15 text-success"
        : category === "mobility"
          ? "border-info/30 bg-info/15 text-info"
          : "border-muted-foreground/30 bg-muted/50 text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("w-28 justify-start", tint)}>
      {ok && category !== "failure" ? <CheckCircle2Icon className="size-3" /> : <Icon className="size-3" />}
      {label}
    </Badge>
  );
}

function RatBadge({ rat }: { rat: "LTE" | "5G" | null }) {
  if (!rat) return <span className="w-12" />;
  return (
    <Badge variant="outline" className="w-12 justify-center gap-1.5 font-medium">
      <span className={cn("size-2 rounded-full", rat === "LTE" ? "bg-chart-lte" : "bg-chart-nr")} aria-hidden />
      {rat}
    </Badge>
  );
}

function Fields({ f }: { f?: Record<string, string | number> }) {
  const entries = Object.entries(f ?? {});
  if (entries.length === 0) return null;
  if (entries.length === 1 && entries[0][0] === "raw") {
    return (
      <span className="truncate font-mono text-[11px] text-muted-foreground" title={String(entries[0][1])}>
        raw {String(entries[0][1])}
      </span>
    );
  }
  // Frame timing (SFN, subframe) is bookkeeping: kept, but last and quiet.
  const timing = (k: string) => /frame|sysfn|subfn|\bsfn\b/i.test(k);
  const main = entries.filter(([k]) => !timing(k));
  const quiet = entries.filter(([k]) => timing(k));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {main.map(([k, v]) => (
        <Badge key={k} variant="secondary" className="font-normal">
          <span className="text-muted-foreground">{k}</span> {String(v)}
        </Badge>
      ))}
      {quiet.length > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {quiet.map(([k, v]) => `${k} ${v}`).join(" · ")}
        </span>
      )}
    </div>
  );
}

function duration(s: number): string {
  if (s < 120) return `${s} s`;
  if (s < 7200) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

function StateBadge({ rrc }: { rrc?: RrcInfo }) {
  const state = rrc?.lte_state;
  if (!state) {
    return (
      <Badge variant="outline" className="border-muted-foreground/30 bg-muted/50 text-muted-foreground">
        <RadioTowerIcon className="size-3" />
        LTE RRC unknown
      </Badge>
    );
  }
  const tint =
    state === "Connected"
      ? "border-success/30 bg-success/15 text-success"
      : /Idle Camped|Connecting|Suspended|IRAT/.test(state)
        ? "border-info/30 bg-info/15 text-info"
        : "border-warning/30 bg-warning/15 text-warning";
  return (
    <Badge variant="outline" className={tint}>
      <RadioTowerIcon className="size-3" />
      LTE RRC {state}
      {typeof rrc?.lte_state_age_s === "number" && (
        <span className="font-normal opacity-80">· {duration(rrc.lte_state_age_s)}</span>
      )}
    </Badge>
  );
}

const COUNTERS: { key: string; label: string; failure: boolean }[] = [
  { key: "lte_rlf", label: "LTE radio link failures", failure: true },
  { key: "lte_oos", label: "LTE out of service", failure: true },
  { key: "lte_ho_fail", label: "LTE handover failures", failure: true },
  { key: "nr_ho", label: "5G handovers", failure: false },
  { key: "nr_ho_fail", label: "5G handover failures", failure: true },
  { key: "nr_scg_fail", label: "5G SCG failures", failure: true },
  { key: "nr_mcg_fail", label: "5G MCG failures", failure: true },
];

// --- Card --------------------------------------------------------------------

/** Scrolling log of the DIAG events seen while the page is open. */
export function RadioEventsCard({
  events,
  rrc,
  live,
}: {
  events: RadioEvent[];
  rrc?: RrcInfo;
  live: boolean;
}) {
  const [filter, setFilter] = useState<"all" | Category>("all");
  const rows = useMemo(
    () =>
      events.map((e) => ({ e, category: categoryOf(e.name), ok: succeeded(e), d: describe(e.name) })),
    [events],
  );
  const shown = filter === "all" ? rows : rows.filter((r) => r.category === filter);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  const counters = rrc?.counters ?? {};

  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>Radio events</CardTitle>
        <CardDescription>
          DIAG events, newest first: the bridge&apos;s last 20 when the page opens, then every
          one while it stays open. State changes, handovers, failures, RACH and carrier
          aggregation come only when something happens.
        </CardDescription>
        <CardAction>
          <StateBadge rrc={rrc} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 @md/card:grid-cols-4 @3xl/card:grid-cols-7">
          {COUNTERS.map((c) => {
            const v = counters[c.key];
            const bad = c.failure && typeof v === "number" && v > 0;
            return (
              <div
                key={c.key}
                className={cn(
                  "grid gap-0.5 rounded-lg border p-2.5",
                  bad ? "border-destructive/30 bg-destructive/5" : "bg-muted/30",
                )}
              >
                <span className="text-[11px] leading-tight text-muted-foreground">{c.label}</span>
                <span className={cn("text-lg font-semibold tabular-nums", bad && "text-destructive")}>
                  {typeof v === "number" ? v : "—"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="-mt-2 text-[11px] text-muted-foreground">
          Counters since diag_bridge started; they reset when it restarts.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filter}
            onValueChange={(v) => v && setFilter(v as "all" | Category)}
            aria-label="Event category"
            className="flex-wrap"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="px-2.5">
                {f.label}
                <span className="ml-1 text-muted-foreground tabular-nums">
                  {f.value === "all" ? rows.length : (counts[f.value] ?? 0)}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={clearRadioEvents}
            disabled={events.length === 0}
          >
            <Trash2Icon />
            Clear
          </Button>
        </div>

        <div
          className="h-96 overflow-y-auto rounded-lg border"
          role="log"
          aria-live="polite"
          aria-label="Radio events"
        >
          {shown.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {!live
                ? "Needs diag_bridge: QMI does not report events."
                : events.length === 0
                  ? "No radio event since this page opened. A stable cell can stay quiet for a long time."
                  : "No event of this category yet."}
            </div>
          ) : (
            <ul className="divide-y">
              <AnimatePresence initial={false}>
                {shown.map(({ e, category, ok, d }) => (
                  <motion.li
                    key={e.key}
                    layout="position"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(
                      "grid gap-1.5 px-3 py-2.5 @md/card:grid-cols-[4.5rem_auto_1fr] @md/card:items-start @md/card:gap-3",
                      category === "failure" && "bg-destructive/5",
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground tabular-nums @md/card:pt-1">
                      {clock(e.ts)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <RatBadge rat={d.rat} />
                      <CategoryBadge category={category} ok={ok} />
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium">{d.title}</span>
                        {d.layer && <span className="text-[11px] text-muted-foreground">{d.layer}</span>}
                        <span className="font-mono text-[11px] text-muted-foreground" title={e.name}>
                          #{e.id}
                        </span>
                      </div>
                      <Fields f={e.f} />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
