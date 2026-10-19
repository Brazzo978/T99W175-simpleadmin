"use client";

import { CheckCircle2Icon, ClockIcon, MinusCircleIcon } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("signal");
  const rows = (snapshot.lte_neighbors ?? []).slice().sort((a, b) => b.rsrp - a.rsrp);
  const serving = snapshot.lte.filter((c) => c.measured !== false && typeof c.rsrp === "number");
  const pcell = serving.find((c) => !c.is_scell);
  const ref = (earfcn: number) =>
    (serving.find((c) => c.earfcn === earfcn) ?? pcell)?.rsrp ?? null;
  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>{t("neighbours.title")}</CardTitle>
        <CardDescription>{t("neighbours.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("neighbours.head.earfcn")}</TableHead>
              <TableHead>{t("neighbours.head.band")}</TableHead>
              <TableHead className={NUM}>{t("neighbours.head.pci")}</TableHead>
              <TableHead className={NUM}>{t("neighbours.head.rsrp")}</TableHead>
              <TableHead className={NUM}>{t("neighbours.head.rsrq")}</TableHead>
              <TableHead className={NUM}>{t("neighbours.head.rssi")}</TableHead>
              <TableHead className={NUM}>{t("neighbours.head.delta_rsrp")}</TableHead>
              <TableHead className={NUM}>{t("neighbours.head.age")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  {live ? t("neighbours.empty_live") : t("neighbours.empty_qmi")}
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
                    <TableCell className={cn(NUM, "text-muted-foreground")}>
                      {t("neighbours.age", { age: n.age_s })}
                    </TableCell>
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

/** What each subscribed log is (its Qualcomm name) and which JSON keys it
 *  fills (a key under diag_logs.feeds). */
const LOG_INFO: Record<string, { name: string; feeds: string }> = {
  "0xB17F": { name: "LTE ML1 serving cell meas & eval", feeds: "0xB17F" },
  "0xB193": { name: "LTE ML1 serving cell meas response", feeds: "0xB193" },
  "0xB197": { name: "LTE ML1 serving cell info", feeds: "0xB197" },
  "0xB0C2": { name: "LTE RRC serving cell info", feeds: "0xB0C2" },
  "0xB0C0": { name: "LTE RRC OTA message", feeds: "0xB0C0" },
  "0xB173": { name: "LTE PDSCH stat indication", feeds: "0xB173" },
  "0xB063": { name: "LTE MAC DL transport block", feeds: "0xB063" },
  "0xB139": { name: "LTE PUSCH TX report", feeds: "0xB139" },
  "0xB823": { name: "NR RRC serving cell info", feeds: "0xB823" },
  "0xB97F": { name: "NR ML1 measurement database", feeds: "0xB97F" },
  "0xB88F": { name: "NR ML1 DL demapper config", feeds: "0xB88F" },
  "0xB888": { name: "NR MAC PDSCH stats", feeds: "0xB888" },
  "0xB881": { name: "NR MAC UL TB stats", feeds: "0xB881" },
  "0xB887": { name: "NR MAC PDSCH status", feeds: "0xB887" },
  "0xB8A7": { name: "NR MAC CSF report", feeds: "0xB8A7" },
  "0xB14D": { name: "LTE LL1 PUCCH CSF", feeds: "0xB14D" },
  "0xB16D": { name: "LTE ML1 GM TX report", feeds: "0xB16D" },
  "0xB184": { name: "LTE ML1 CA metrics", feeds: "0xB184" },
  "0xB168": { name: "LTE ML1 RAR (Msg2)", feeds: "0xB168" },
  "0xB88A": { name: "NR MAC RACH attempt", feeds: "0xB88A" },
  "0xB825": { name: "NR RRC configuration info", feeds: "0xB825" },
  "0xB0C1": { name: "LTE RRC MIB message", feeds: "0xB0C1" },
  "0xB8D8": { name: "NR LL1 serving SNR", feeds: "0xB8D8" },
  "0xB884": { name: "NR MAC UL power control", feeds: "0xB884" },
  "0xB180": { name: "LTE ML1 neighbour measurements", feeds: "0xB180" },
  "0xB14E": { name: "LTE PDSCH demapper config", feeds: "not_decoded" },
  "0xB187": { name: "LTE ML1 intra-freq neighbour meas req", feeds: "not_decoded" },
  "0xB897": { name: "NR ML1 PDSCH demapper config", feeds: "not_decoded" },
  "0xB8A1": { name: "NR ML1 PDSCH decode result", feeds: "debug_only" },
  "0xB9CD": { name: "NR MAC DL TB stats", feeds: "not_decoded" },
};

/** Receiving within the last 10 s, seen earlier, or never. */
function LogState({ stat }: { stat: DiagLogStat }) {
  const { t } = useTranslation("signal");
  if (stat.n > 0 && stat.age_s >= 0 && stat.age_s <= 10) {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/15 text-success hover:bg-success/20">
        <CheckCircle2Icon className="size-3" />
        {t("diag_logs.state.receiving")}
      </Badge>
    );
  }
  if (stat.n > 0) {
    return (
      <Badge variant="outline" className="border-info/30 bg-info/15 text-info hover:bg-info/20">
        <ClockIcon className="size-3" />
        {t("diag_logs.state.seen")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/30 bg-muted/50 text-muted-foreground">
      <MinusCircleIcon className="size-3" />
      {t("diag_logs.state.never")}
    </Badge>
  );
}

function ago(t: TFunction, s: number): string {
  if (s < 0) return "—";
  if (s < 120) return t("diag_logs.ago.seconds", { value: s });
  if (s < 7200) return t("diag_logs.ago.minutes", { value: Math.round(s / 60) });
  return t("diag_logs.ago.hours", { value: (s / 3600).toFixed(1) });
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
  const { t } = useTranslation("signal");
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
        <CardTitle>{t("diag_logs.title")}</CardTitle>
        <CardDescription>
          {logs.length
            ? t("diag_logs.description", { seen, total: logs.length })
            : live
              ? t("diag_logs.no_stats")
              : t("diag_logs.needs_bridge")}
        </CardDescription>
      </CardHeader>
      {logs.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("diag_logs.head.code")}</TableHead>
                <TableHead>{t("diag_logs.head.log")}</TableHead>
                <TableHead>{t("diag_logs.head.feeds")}</TableHead>
                <TableHead>{t("diag_logs.head.state")}</TableHead>
                <TableHead className={NUM}>{t("diag_logs.head.received")}</TableHead>
                <TableHead className={NUM}>{t("diag_logs.head.per_min")}</TableHead>
                <TableHead className={NUM}>{t("diag_logs.head.last")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => {
                const info = LOG_INFO[l.code];
                return (
                  <TableRow key={l.code}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell className="whitespace-normal">{info?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {info ? t(`diag_logs.feeds.${info.feeds}`) : "—"}
                    </TableCell>
                    <TableCell>
                      <LogState stat={l} />
                    </TableCell>
                    <TableCell className={NUM}>{l.n.toLocaleString("en-US")}</TableCell>
                    <TableCell className={NUM}>{l.n > 0 ? rate(l) : "—"}</TableCell>
                    <TableCell className={cn(NUM, "text-muted-foreground")}>{ago(t, l.age_s)}</TableCell>
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
