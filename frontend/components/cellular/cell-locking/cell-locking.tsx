"use client";

import { useState } from "react";
import {
  CrosshairIcon,
  LockIcon,
  LockOpenIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useModemStatus } from "@/hooks/use-modem-status";
import { useRadioSettings } from "@/hooks/use-radio-settings";
import { SCS_LABELS, type LteLock } from "@/lib/radio-at";

const MAX_LTE_CELLS = 10;

type Row = { pci: string; earfcn: string };

const toInt = (value: string) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

function LockBadge({ locked }: { locked: boolean }) {
  const { t } = useTranslation("cell-locking");
  return locked ? (
    <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
      <LockIcon className="size-3" />
      {t("badge.locked")}
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
      <LockOpenIcon className="size-3" />
      {t("badge.not_locked")}
    </Badge>
  );
}

export default function CellLockingComponent() {
  const { t } = useTranslation("cell-locking");
  const radio = useRadioSettings();
  const { data: status } = useModemStatus();
  const { data, isLoading, isBusy } = radio;

  const [rows, setRows] = useState<Row[]>([{ pci: "", earfcn: "" }]);
  const [nr, setNr] = useState({ band: "", scs: "1", arfcn: "", pci: "" });

  const lteLocked = (data?.lteLocks.length ?? 0) > 0;
  const nrLocked = (data?.nrLocks.length ?? 0) > 0;

  const fillServingLte = () => {
    const lte = status?.lte;
    if (lte?.pci == null || lte.earfcn == null) {
      toast.error(t("toast.no_lte_serving"));
      return;
    }
    setRows([{ pci: String(lte.pci), earfcn: String(lte.earfcn) }]);
  };

  const fillServingNr = () => {
    const n = status?.nr;
    if (n?.pci == null || n.arfcn == null) {
      toast.error(t("toast.no_nr_serving"));
      return;
    }
    setNr((prev) => ({
      ...prev,
      band: n.band.replace(/^N/i, ""),
      arfcn: String(n.arfcn),
      pci: String(n.pci),
    }));
  };

  const applyLte = async () => {
    const cells: LteLock[] = [];
    for (const row of rows) {
      if (!row.pci && !row.earfcn) continue;
      const pci = toInt(row.pci);
      const earfcn = toInt(row.earfcn);
      if (pci === null || pci > 503 || earfcn === null) {
        toast.error(t("toast.lte_row_invalid"));
        return;
      }
      cells.push({ pci, earfcn });
    }
    if (cells.length === 0) {
      toast.error(t("toast.lte_none"));
      return;
    }
    const result = await radio.lockLte(cells);
    if (result.ok) toast.success(t("toast.lte_locked", { count: cells.length }));
    else toast.error(result.message);
  };

  const applyNr = async () => {
    const band = toInt(nr.band);
    const scs = toInt(nr.scs);
    const arfcn = toInt(nr.arfcn);
    const pci = toInt(nr.pci);
    if (band === null || scs === null || arfcn === null || pci === null || pci > 1007) {
      toast.error(t("toast.nr_invalid"));
      return;
    }
    const result = await radio.lockNr({ band, scs, arfcn, pci });
    if (result.ok) toast.success(t("toast.nr_locked"));
    else toast.error(result.message);
  };

  const unlock = async (which: "lte" | "nr") => {
    const result = which === "lte" ? await radio.unlockLte() : await radio.unlockNr();
    if (result.ok) toast.success(t("toast.unlocked"));
    else toast.error(result.message);
  };

  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
    >
      <Card className="@container/card">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{t("lte.title")}</CardTitle>
              <CardDescription>
                {t("lte.description", { max: MAX_LTE_CELLS })}
              </CardDescription>
            </div>
            {!isLoading && <LockBadge locked={lteLocked} />}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {lteLocked && (
                <div className="flex flex-wrap gap-2">
                  {data!.lteLocks.map((lock) => (
                    <Badge key={`${lock.pci}-${lock.earfcn}`} variant="secondary">
                      PCI {lock.pci} · EARFCN {lock.earfcn}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid gap-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm text-muted-foreground">
                  <span>PCI</span>
                  <span>EARFCN</span>
                  <span className="w-9" />
                </div>
                {rows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      inputMode="numeric"
                      aria-label={`PCI ${index + 1}`}
                      value={row.pci}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, pci: e.target.value } : r)),
                        )
                      }
                    />
                    <Input
                      inputMode="numeric"
                      aria-label={`EARFCN ${index + 1}`}
                      value={row.earfcn}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, earfcn: e.target.value } : r)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("lte.remove_row_aria")}
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={applyLte} disabled={isBusy || isLoading}>
            <LockIcon />
            {t("lte.lock")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setRows((prev) => [...prev, { pci: "", earfcn: "" }])}
            disabled={rows.length >= MAX_LTE_CELLS}
          >
            <PlusIcon />
            {t("lte.add_cell")}
          </Button>
          <Button variant="outline" onClick={fillServingLte}>
            <CrosshairIcon />
            {t("use_serving")}
          </Button>
          <Button
            variant="outline"
            onClick={() => unlock("lte")}
            disabled={isBusy || !lteLocked}
          >
            <LockOpenIcon />
            {t("unlock")}
          </Button>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{t("nr.title")}</CardTitle>
              <CardDescription>{t("nr.description")}</CardDescription>
            </div>
            {!isLoading && <LockBadge locked={nrLocked} />}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {nrLocked && (
                <div className="flex flex-wrap gap-2">
                  {data!.nrLocks.map((lock) => (
                    <Badge key={`${lock.arfcn}-${lock.pci}`} variant="secondary">
                      N{lock.band} · {SCS_LABELS[lock.scs] ?? `SCS ${lock.scs}`} ·
                      ARFCN {lock.arfcn} · PCI {lock.pci}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nr-band">{t("nr.band_label")}</Label>
                  <Input
                    id="nr-band"
                    inputMode="numeric"
                    value={nr.band}
                    onChange={(e) => setNr({ ...nr, band: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("nr.scs_label")}</Label>
                  <Select value={nr.scs} onValueChange={(scs) => setNr({ ...nr, scs })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SCS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nr-arfcn">NR-ARFCN</Label>
                  <Input
                    id="nr-arfcn"
                    inputMode="numeric"
                    value={nr.arfcn}
                    onChange={(e) => setNr({ ...nr, arfcn: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nr-pci">PCI</Label>
                  <Input
                    id="nr-pci"
                    inputMode="numeric"
                    value={nr.pci}
                    onChange={(e) => setNr({ ...nr, pci: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={applyNr} disabled={isBusy || isLoading}>
            <LockIcon />
            {t("nr.lock")}
          </Button>
          <Button variant="outline" onClick={fillServingNr}>
            <CrosshairIcon />
            {t("use_serving")}
          </Button>
          <Button
            variant="outline"
            onClick={() => unlock("nr")}
            disabled={isBusy || !nrLocked}
          >
            <LockOpenIcon />
            {t("unlock")}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}
