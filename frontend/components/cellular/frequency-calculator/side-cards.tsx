"use client";

import { HistoryIcon, RadioTowerIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDuplexMode,
  lteDLFrequency,
  lteULFrequency,
  nrArfcnToFrequency,
  nrULFrequency,
  parseBandNumber,
} from "@/lib/earfcn";
import type { CarrierRow } from "../signal/carriers";
import { timeTick } from "../signal/controls";
import { fmtMHz, type HistoryEntry } from "./calc";

function frequencies(row: CarrierRow): { dl: number | null; ul: number | null; tdd: boolean } {
  if (row.rat === "lte") {
    return {
      dl: lteDLFrequency(row.arfcn),
      ul: lteULFrequency(row.arfcn),
      tdd: getDuplexMode(row.band, "LTE") === "TDD",
    };
  }
  const band = parseBandNumber(row.band) ?? undefined;
  return {
    dl: nrArfcnToFrequency(row.arfcn),
    ul: nrULFrequency(row.arfcn, band),
    tdd: band !== undefined && getDuplexMode(`${band}`, "NR") === "TDD",
  };
}

/** Centre frequencies of the carriers the modem uses now. */
export function ServingCarriersCard({
  carriers,
  live,
}: {
  carriers: CarrierRow[];
  live: boolean;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Serving carriers</CardTitle>
        <CardDescription>
          Centre frequencies of every carrier in use, from the live radio data.
          Each spans half its bandwidth either side.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carriers.length === 0 ? (
          <Empty className="border bg-muted/30 p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RadioTowerIcon />
              </EmptyMedia>
              <EmptyTitle>{live ? "No serving cell" : "No live radio data"}</EmptyTitle>
              <EmptyDescription>
                {live
                  ? "The carriers appear while the modem is attached."
                  : "The carriers appear once diag_bridge or system_bridge sends radio data."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs">Carrier</TableHead>
                <TableHead className="h-8 text-right text-xs">Channel</TableHead>
                <TableHead className="h-8 text-right text-xs">Downlink</TableHead>
                <TableHead className="hidden h-8 text-right text-xs @sm/card:table-cell">Uplink</TableHead>
                <TableHead className="hidden h-8 text-right text-xs @md/card:table-cell">Width</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carriers.map((c) => {
                const rat = c.rat === "lte" ? "LTE" : "NR";
                const f = frequencies(c);
                return (
                  <TableRow key={c.key}>
                    <TableCell className="py-1.5 font-medium">{c.name}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{c.arfcn}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{fmtMHz(f.dl, rat)}</TableCell>
                    <TableCell className="hidden py-1.5 text-right tabular-nums @sm/card:table-cell">
                      {f.tdd ? <span className="text-muted-foreground">TDD</span> : fmtMHz(f.ul, rat)}
                    </TableCell>
                    <TableCell className="hidden py-1.5 text-right tabular-nums @md/card:table-cell">
                      {c.bandwidth_mhz ? `${c.bandwidth_mhz} MHz` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function HistoryCard({
  entries,
  onRecall,
  onRemove,
  onClear,
}: {
  entries: HistoryEntry[];
  onRecall: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>The last ten calculations, kept in this browser.</CardDescription>
        {entries.length > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onClear}>
              Clear
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <Empty className="border bg-muted/30 p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>No calculations yet</EmptyTitle>
              <EmptyDescription>Each result you calculate is listed here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-2">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-1 rounded-lg border">
                <button
                  type="button"
                  className="grid min-w-0 flex-1 gap-0.5 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => onRecall(e)}
                >
                  <span className="truncate text-sm font-medium tabular-nums">{e.summary}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{timeTick(e.ts)}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mr-1 shrink-0 text-muted-foreground"
                  aria-label={`Remove ${e.summary}`}
                  onClick={() => onRemove(e.id)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
