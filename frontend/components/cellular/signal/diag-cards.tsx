"use client";

import { CheckCircle2Icon, ClockIcon, MinusCircleIcon } from "lucide-react";
import { getValueColorClass } from "@/components/dashboard/signal-card-utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DiagLogStat, DiagSnapshot } from "@/types/bridge";
import { RSRP_THRESHOLDS, RSRQ_THRESHOLDS } from "@/types/modem-status";
import { fmt, quality } from "./metrics";

const NUM = "text-right tabular-nums";

/** LTE neighbour cells (0xB180), strongest first, against the serving cell. */
export function NeighbourCard({ snapshot, live }: { snapshot: DiagSnapshot; live: boolean }) {
  const rows = (snapshot.lte_neighbors ?? []).slice().sort((a, b) => b.rsrp - a.rsrp);
  const serving = snapshot.lte.filter((c) => c.measured !== false && typeof c.rsrp === "number");
  const pcell = serving.find((c) => !c.is_scell);
  const ref = (earfcn: number) =>
    (serving.find((c) => c.earfcn === earfcn) ?? pcell)?.rsrp ?? null;
  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>LTE neighbour cells</CardTitle>
        <CardDescription>
          Cells the modem measured in the last 10 s (0xB180), strongest first. Δ is against
          the serving cell on the same EARFCN, else the PCell.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>EARFCN</TableHead>
              <TableHead>Band</TableHead>
              <TableHead className={NUM}>PCI</TableHead>
              <TableHead className={NUM}>RSRP</TableHead>
              <TableHead className={NUM}>RSRQ</TableHead>
              <TableHead className={NUM}>RSSI</TableHead>
              <TableHead className={NUM}>Δ RSRP</TableHead>
              <TableHead className={NUM}>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  {live
                    ? "No neighbour measurement in the last 10 s."
                    : "Needs diag_bridge: QMI does not report neighbour cells."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((n) => {
                const r = ref(n.earfcn);
                const delta = r === null ? null : n.rsrp - r;
                return (
                  <TableRow key={`${n.earfcn}-${n.pci}`}>
                    <TableCell className="tabular-nums">{n.earfcn}</TableCell>
                    <TableCell className="font-medium">{n.band ? `B${n.band}` : "—"}</TableCell>
                    <TableCell className={NUM}>{n.pci}</TableCell>
                    <TableCell className={cn(NUM, getValueColorClass(quality(n.rsrp, RSRP_THRESHOLDS)))}>
                      {fmt(n.rsrp)}
                    </TableCell>
                    <TableCell className={cn(NUM, getValueColorClass(quality(n.rsrq, RSRQ_THRESHOLDS)))}>
                      {fmt(n.rsrq)}
                    </TableCell>
                    <TableCell className={NUM}>{fmt(n.rssi)}</TableCell>
                    <TableCell className={NUM}>
                      {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                    </TableCell>
                    <TableCell className={cn(NUM, "text-muted-foreground")}>{n.age_s} s</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** What each subscribed log is and which JSON keys it fills. */
const LOG_INFO: Record<string, { name: string; feeds: string }> = {
  "0xB17F": { name: "LTE ML1 serving cell meas & eval", feeds: "LTE serving measurements" },
  "0xB193": { name: "LTE ML1 serving cell meas response", feeds: "LTE RSRP/RSRQ/RSSI, per-chain RSRP/SINR" },
  "0xB197": { name: "LTE ML1 serving cell info", feeds: "LTE bandwidth" },
  "0xB0C2": { name: "LTE RRC serving cell info", feeds: "LTE cell ID, TAC, bandwidth" },
  "0xB0C0": { name: "LTE RRC OTA message", feeds: "SCells, cell identity, NR bandwidth" },
  "0xB173": { name: "LTE PDSCH stat indication", feeds: "LTE DL rate, BLER, modulation, MCS" },
  "0xB063": { name: "LTE MAC DL transport block", feeds: "LTE DL transport blocks" },
  "0xB139": { name: "LTE PUSCH TX report", feeds: "LTE UL rate, UL RB, UL modulation" },
  "0xB823": { name: "NR RRC serving cell info", feeds: "NR band, cell identity" },
  "0xB97F": { name: "NR ML1 measurement database", feeds: "NR RSRP/RSRQ, SSB, beams, neighbours" },
  "0xB88F": { name: "NR ML1 DL demapper config", feeds: "NR modulation" },
  "0xB888": { name: "NR MAC PDSCH stats", feeds: "NR DL rate, BLER" },
  "0xB881": { name: "NR MAC UL TB stats", feeds: "NR UL rate, MCS, PRB, PHR, Pcmax" },
  "0xB887": { name: "NR MAC PDSCH status", feeds: "NR DL MCS, RB, layers" },
  "0xB8A7": { name: "NR MAC CSF report", feeds: "NR CQI, rank" },
  "0xB14D": { name: "LTE LL1 PUCCH CSF", feeds: "LTE CQI, rank" },
  "0xB16D": { name: "LTE ML1 GM TX report", feeds: "LTE TX power" },
  "0xB184": { name: "LTE ML1 CA metrics", feeds: "bandwidths, SCells after a restart" },
  "0xB168": { name: "LTE ML1 RAR (Msg2)", feeds: "LTE timing advance" },
  "0xB88A": { name: "NR MAC RACH attempt", feeds: "NR timing advance" },
  "0xB825": { name: "NR RRC configuration info", feeds: "NR bandwidths, SCS" },
  "0xB0C1": { name: "LTE RRC MIB message", feeds: "LTE bandwidth" },
  "0xB8D8": { name: "NR LL1 serving SNR", feeds: "NR SNR per chain" },
  "0xB884": { name: "NR MAC UL power control", feeds: "NR TX power, path loss" },
  "0xB180": { name: "LTE ML1 neighbour measurements", feeds: "LTE neighbour cells" },
  "0xB14E": { name: "LTE PDSCH demapper config", feeds: "— (not decoded)" },
  "0xB187": { name: "LTE ML1 intra-freq neighbour meas req", feeds: "— (not decoded)" },
  "0xB897": { name: "NR ML1 PDSCH demapper config", feeds: "— (not decoded)" },
  "0xB8A1": { name: "NR ML1 PDSCH decode result", feeds: "— (debug output only)" },
  "0xB9CD": { name: "NR MAC DL TB stats", feeds: "— (not decoded)" },
};

/** Receiving within the last 10 s, seen earlier, or never. */
function LogState({ stat }: { stat: DiagLogStat }) {
  if (stat.n > 0 && stat.age_s >= 0 && stat.age_s <= 10) {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/15 text-success hover:bg-success/20">
        <CheckCircle2Icon className="size-3" />
        Receiving
      </Badge>
    );
  }
  if (stat.n > 0) {
    return (
      <Badge variant="outline" className="border-info/30 bg-info/15 text-info hover:bg-info/20">
        <ClockIcon className="size-3" />
        Seen
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 bg-muted/50 text-muted-foreground">
      <MinusCircleIcon className="size-3" />
      Never
    </Badge>
  );
}

function ago(s: number): string {
  if (s < 0) return "—";
  if (s < 120) return `${s} s ago`;
  if (s < 7200) return `${Math.round(s / 60)} min ago`;
  return `${(s / 3600).toFixed(1)} h ago`;
}

/** Which subscribed DIAG logs this firmware emits, and how often. */
export function DiagLogsCard({
  snapshot,
  live,
  now,
  base,
}: {
  snapshot: DiagSnapshot;
  live: boolean;
  now: number;
  /** First sighting of each counter in this page session (bridge store) */
  base: Record<string, { t: number; n: number }>;
}) {
  const logs = snapshot.diag_logs ?? [];
  const seen = logs.filter((l) => l.n > 0).length;
  const rate = (l: DiagLogStat): string => {
    const f = base[l.code];
    if (!f || now - f.t < 10_000) return "…";
    return ((l.n - f.n) / ((now - f.t) / 60_000)).toFixed(l.n - f.n < 10 ? 1 : 0);
  };
  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>DIAG log coverage</CardTitle>
        <CardDescription>
          {logs.length
            ? `${seen} of ${logs.length} subscribed logs received since diag_bridge started. Event-driven ones (RACH, MIB, RRC configuration) only come at attach, handover or reconfiguration.`
            : live
              ? "This diag_bridge does not publish log statistics."
              : "Needs diag_bridge."}
        </CardDescription>
      </CardHeader>
      {logs.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Code</TableHead>
                <TableHead>Log</TableHead>
                <TableHead>Feeds</TableHead>
                <TableHead>State</TableHead>
                <TableHead className={NUM}>Received</TableHead>
                <TableHead className={NUM}>Per min</TableHead>
                <TableHead className={NUM}>Last</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => {
                const info = LOG_INFO[l.code];
                return (
                  <TableRow key={l.code}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell className="whitespace-normal">{info?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{info?.feeds ?? "—"}</TableCell>
                    <TableCell>
                      <LogState stat={l} />
                    </TableCell>
                    <TableCell className={NUM}>{l.n.toLocaleString("en-US")}</TableCell>
                    <TableCell className={NUM}>{l.n > 0 ? rate(l) : "—"}</TableCell>
                    <TableCell className={cn(NUM, "text-muted-foreground")}>{ago(l.age_s)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
