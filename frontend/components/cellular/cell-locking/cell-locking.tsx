"use client";

import { useState } from "react";
import {
  CrosshairIcon,
  LockIcon,
  LockOpenIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
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
  return locked ? (
    <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
      <LockIcon className="size-3" />
      Locked
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
      <LockOpenIcon className="size-3" />
      Not locked
    </Badge>
  );
}

export default function CellLockingComponent() {
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
      toast.error("No LTE serving cell right now");
      return;
    }
    setRows([{ pci: String(lte.pci), earfcn: String(lte.earfcn) }]);
  };

  const fillServingNr = () => {
    const n = status?.nr;
    if (n?.pci == null || n.arfcn == null) {
      toast.error("No 5G serving cell right now");
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
        toast.error("Each row needs a PCI (0-503) and an EARFCN");
        return;
      }
      cells.push({ pci, earfcn });
    }
    if (cells.length === 0) {
      toast.error("Enter at least one cell");
      return;
    }
    const result = await radio.lockLte(cells);
    if (result.ok) toast.success(`LTE locked to ${cells.length} cell(s)`);
    else toast.error(result.message);
  };

  const applyNr = async () => {
    const band = toInt(nr.band);
    const scs = toInt(nr.scs);
    const arfcn = toInt(nr.arfcn);
    const pci = toInt(nr.pci);
    if (band === null || scs === null || arfcn === null || pci === null || pci > 1007) {
      toast.error("Band, SCS, NR-ARFCN and PCI (0-1007) are all required");
      return;
    }
    const result = await radio.lockNr({ band, scs, arfcn, pci });
    if (result.ok) toast.success("5G SA cell lock applied");
    else toast.error(result.message);
  };

  const unlock = async (which: "lte" | "nr") => {
    const result = which === "lte" ? await radio.unlockLte() : await radio.unlockNr();
    if (result.ok) toast.success("Cell lock removed");
    else toast.error(result.message);
  };

  return (
    <PageShell
      title="Cell Locking"
      description="Keep the modem on specific cells. A wrong lock leaves it without service: remove the lock to get back to normal selection."
    >
      <Card className="@container/card">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>LTE Cell Lock</CardTitle>
              <CardDescription>
                Up to {MAX_LTE_CELLS} cells, each a PCI and an EARFCN.
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
                      aria-label="Remove row"
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
            Lock LTE
          </Button>
          <Button
            variant="outline"
            onClick={() => setRows((prev) => [...prev, { pci: "", earfcn: "" }])}
            disabled={rows.length >= MAX_LTE_CELLS}
          >
            <PlusIcon />
            Add Cell
          </Button>
          <Button variant="outline" onClick={fillServingLte}>
            <CrosshairIcon />
            Use Serving Cell
          </Button>
          <Button
            variant="outline"
            onClick={() => unlock("lte")}
            disabled={isBusy || !lteLocked}
          >
            <LockOpenIcon />
            Unlock
          </Button>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>5G SA Cell Lock</CardTitle>
              <CardDescription>
                One standalone 5G cell: band, subcarrier spacing, NR-ARFCN and PCI.
              </CardDescription>
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
                  <Label htmlFor="nr-band">Band (n…)</Label>
                  <Input
                    id="nr-band"
                    inputMode="numeric"
                    value={nr.band}
                    onChange={(e) => setNr({ ...nr, band: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Subcarrier spacing</Label>
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
            Lock 5G SA
          </Button>
          <Button variant="outline" onClick={fillServingNr}>
            <CrosshairIcon />
            Use Serving Cell
          </Button>
          <Button
            variant="outline"
            onClick={() => unlock("nr")}
            disabled={isBusy || !nrLocked}
          >
            <LockOpenIcon />
            Unlock
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}
