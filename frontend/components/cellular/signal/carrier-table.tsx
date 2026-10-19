"use client";

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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DiagSnapshot } from "@/types/bridge";
import {
  RSRP_THRESHOLDS,
  RSRQ_THRESHOLDS,
  SINR_THRESHOLDS,
} from "@/types/modem-status";
import { carrierRows } from "./carriers";
import {
  CQI_THRESHOLDS,
  blerQuality,
  fmt,
  fmtMbps,
  pct,
  quality,
  txPowerQuality,
  type Quality,
} from "./metrics";
import { aggregateRates } from "@/lib/bridge/radio-history";

const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function Q({ q, children }: { q: Quality; children: React.ReactNode }) {
  return <span className={cn("transition-colors", getValueColorClass(q))}>{children}</span>;
}

const NUM = "text-right tabular-nums";

/** Every carrier side by side: the table twin of the charts below it. */
export function CarrierTableCard({
  snapshot,
  live,
}: {
  snapshot: DiagSnapshot;
  live: boolean;
}) {
  const { t } = useTranslation("signal");
  const rows = carrierRows(snapshot);
  const rates = live ? aggregateRates(snapshot) : null;
  const bandwidth = rows.reduce((s, r) => s + (r.bandwidth_mhz ?? 0), 0);
  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>{t("carriers.title")}</CardTitle>
        <CardDescription>{t("carriers.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("carriers.head.carrier")}</TableHead>
              <TableHead>{t("carriers.head.band")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.arfcn")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.pci")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.bw")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.rsrp")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.rsrq")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.sinr")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.cqi")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.rank")}</TableHead>
              <TableHead>{t("carriers.head.dl_mod")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.mcs")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.bler")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.dl_mbps")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.ul_mbps")}</TableHead>
              <TableHead className={NUM}>{t("carriers.head.tx_dbm")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        r.rat === "lte" ? "bg-chart-lte" : "bg-chart-nr",
                      )}
                      aria-hidden
                    />
                    <Badge variant="outline" className="font-medium">
                      {r.role}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{r.band}</TableCell>
                <TableCell className={NUM}>{r.arfcn}</TableCell>
                <TableCell className={NUM}>{r.pci}</TableCell>
                <TableCell className={NUM}>
                  {r.bandwidth_mhz ? `${r.bandwidth_mhz}${r.bandwidth_estimated ? "*" : ""}` : "—"}
                </TableCell>
                {r.measured ? (
                  <>
                    <TableCell className={NUM}>
                      <Q q={quality(r.rsrp, RSRP_THRESHOLDS)}>{fmt(r.rsrp)}</Q>
                    </TableCell>
                    <TableCell className={NUM}>
                      <Q q={quality(r.rsrq, RSRQ_THRESHOLDS)}>{fmt(r.rsrq)}</Q>
                    </TableCell>
                    <TableCell className={NUM}>
                      <Q q={quality(r.sinr, SINR_THRESHOLDS)}>{fmt(r.sinr)}</Q>
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                    {t("carriers.not_measured")}
                  </TableCell>
                )}
                <TableCell className={NUM}>
                  <Q q={quality(r.cqi, CQI_THRESHOLDS)}>{has(r.cqi) ? r.cqi : "—"}</Q>
                </TableCell>
                <TableCell className={NUM}>{has(r.rank) ? r.rank : "—"}</TableCell>
                <TableCell>{r.modulation ?? "—"}</TableCell>
                <TableCell className={NUM}>
                  {has(r.mcs) ? (Number.isInteger(r.mcs) ? r.mcs : r.mcs.toFixed(1)) : "—"}
                </TableCell>
                <TableCell className={NUM}>
                  <Q q={blerQuality(r.bler)}>{pct(r.bler)}</Q>
                </TableCell>
                <TableCell className={NUM}>{live ? fmtMbps(r.dl_mbps) : "—"}</TableCell>
                <TableCell className={NUM}>{live ? fmtMbps(r.ul_mbps) : "—"}</TableCell>
                <TableCell className={NUM}>
                  <Q q={txPowerQuality(r.tx_power)}>{fmt(r.tx_power, "", 0)}</Q>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="font-medium">
                {t("carriers.total", { count: rows.length })}
              </TableCell>
              <TableCell className={NUM}>{bandwidth || "—"}</TableCell>
              <TableCell colSpan={8} />
              <TableCell className={cn(NUM, "font-semibold")}>{rates ? fmtMbps(rates.dl) : "—"}</TableCell>
              <TableCell className={cn(NUM, "font-semibold")}>{rates ? fmtMbps(rates.ul) : "—"}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
        {rows.some((r) => r.bandwidth_estimated) && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("carriers.estimated_note")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
