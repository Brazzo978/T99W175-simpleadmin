"use client";

import { useState } from "react";
import { RotateCcwIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRadioSettings } from "@/hooks/use-radio-settings";
import {
  NETWORK_MODE_BITS,
  NR5G_MODE_LABELS,
  PDP_TYPES,
  describeNetworkMode,
  isValidApn,
  type Nr5gMode,
  type PdpType,
} from "@/lib/radio-at";

const RAT_OPTIONS = [
  { key: "threeG", label: "3G" },
  { key: "fourG", label: "4G" },
  { key: "fiveG", label: "5G" },
] as const;

type Confirm = null | "apn" | "apn-reset" | "sim";

export default function CellularSettingsComponent() {
  const radio = useRadioSettings();
  const { data, isLoading, isBusy } = radio;

  // Local edits; null means "as on the modem".
  const [modeBits, setModeBits] = useState<number | null>(null);
  const [apn, setApn] = useState<string | null>(null);
  const [pdpType, setPdpType] = useState<PdpType | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pendingSim, setPendingSim] = useState<1 | 2 | null>(null);

  const currentMode = data?.networkMode ?? null;
  const shownBits = modeBits ?? (currentMode === 0 ? 7 : currentMode ?? 0);
  const primary = data?.contexts.find((c) => c.cid === 1) ?? data?.contexts[0];
  const shownApn = apn ?? primary?.apn ?? "";
  const shownType: PdpType =
    pdpType ??
    ((PDP_TYPES as readonly string[]).includes(primary?.type ?? "")
      ? (primary!.type as PdpType)
      : "IPV4V6");

  const saveMode = async (value: number) => {
    const result = await radio.setNetworkMode(value);
    if (result.ok) {
      toast.success(`Network mode: ${describeNetworkMode(value)}`);
      setModeBits(null);
    } else toast.error(result.message);
  };

  const saveNr5g = async (value: string) => {
    if (!value) return;
    const mode = Number(value) as Nr5gMode;
    const result = await radio.setNr5gMode(mode);
    if (result.ok) toast.success(`5G mode: ${NR5G_MODE_LABELS[mode]}`);
    else toast.error(result.message);
  };

  const runConfirmed = async () => {
    const action = confirm;
    setConfirm(null);
    if (action === "apn") {
      const name = shownApn.trim();
      const result = await radio.setApn(name, shownType);
      if (result.ok) {
        toast.success(`APN set to ${name}`);
        setApn(null);
        setPdpType(null);
      } else toast.error(result.message);
    } else if (action === "apn-reset") {
      const result = await radio.resetApn();
      if (result.ok) {
        sessionStorage.setItem("qm_rebooting", "1");
        window.location.href = "/reboot/";
      } else toast.error(result.message);
    } else if (action === "sim" && pendingSim) {
      const result = await radio.switchSim(pendingSim);
      if (result.ok) toast.success(`SIM ${pendingSim} active`);
      else toast.error(result.message);
      setPendingSim(null);
    }
  };

  const apnChanged =
    shownApn.trim() !== (primary?.apn ?? "") || shownType !== (primary?.type ?? "");

  return (
    <PageShell
      title="Cellular Settings"
      description="Network technologies, SIM slot and the APN of the data connection."
    >
      <Card>
        <CardHeader>
          <CardTitle>Network Mode</CardTitle>
          <CardDescription>
            Technologies the modem may register on. Current:{" "}
            {isLoading ? "…" : describeNetworkMode(currentMode)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <div className="flex flex-wrap gap-6">
              {RAT_OPTIONS.map((rat) => {
                const bit = NETWORK_MODE_BITS[rat.key];
                return (
                  <div key={rat.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`rat-${rat.key}`}
                      checked={(shownBits & bit) !== 0}
                      disabled={isBusy}
                      onCheckedChange={(checked) =>
                        setModeBits((checked ? shownBits | bit : shownBits & ~bit) || 0)
                      }
                    />
                    <Label htmlFor={`rat-${rat.key}`}>{rat.label}</Label>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            onClick={() => saveMode(shownBits)}
            disabled={isBusy || isLoading || shownBits === 0 || modeBits === null}
          >
            Apply
          </Button>
          <Button
            variant="outline"
            onClick={() => saveMode(0)}
            disabled={isBusy || isLoading || currentMode === 0}
          >
            Automatic
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5G Mode</CardTitle>
          <CardDescription>
            Whether 5G is used with an LTE anchor (NSA), standalone (SA), or
            either.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <ToggleGroup
              type="single"
              variant="outline"
              value={data?.nr5gMode != null ? String(data.nr5gMode) : ""}
              onValueChange={saveNr5g}
              disabled={isBusy}
            >
              {(Object.keys(NR5G_MODE_LABELS) as unknown as Nr5gMode[]).map((mode) => (
                <ToggleGroupItem key={mode} value={String(mode)} className="px-4">
                  {NR5G_MODE_LABELS[mode]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>SIM Slot</CardTitle>
              <CardDescription>
                SIM 2 is also the eSIM. Switching restarts the registration.
              </CardDescription>
            </div>
            {data && (
              <Badge
                variant="outline"
                className={
                  data.simReady
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-warning/15 text-warning border-warning/30"
                }
              >
                {data.simReady ? "SIM ready" : "SIM not ready"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <ToggleGroup
              type="single"
              variant="outline"
              value={data?.simSlot ? String(data.simSlot) : ""}
              onValueChange={(value) => {
                const slot = Number(value) as 1 | 2;
                if (!value || slot === data?.simSlot) return;
                setPendingSim(slot);
                setConfirm("sim");
              }}
              disabled={isBusy}
            >
              <ToggleGroupItem value="1" className="px-4">SIM 1</ToggleGroupItem>
              <ToggleGroupItem value="2" className="px-4">SIM 2 / eSIM</ToggleGroupItem>
            </ToggleGroup>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>APN</CardTitle>
          <CardDescription>
            Profile 1 carries the data connection. Saving removes the other
            profiles and restarts the radio.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid gap-4 @md/main:grid-cols-[2fr_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="apn">APN</Label>
                <Input
                  id="apn"
                  value={shownApn}
                  onChange={(e) => setApn(e.target.value)}
                  aria-invalid={shownApn !== "" && !isValidApn(shownApn.trim())}
                />
              </div>
              <div className="grid gap-2">
                <Label>PDP type</Label>
                <Select value={shownType} onValueChange={(v) => setPdpType(v as PdpType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PDP_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === "IP" ? "IPv4" : type === "IPV6" ? "IPv6" : "IPv4v6"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            onClick={() => setConfirm("apn")}
            disabled={isBusy || isLoading || !apnChanged || !isValidApn(shownApn.trim())}
          >
            Save APN
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirm("apn-reset")}
            disabled={isBusy || isLoading}
          >
            <RotateCcwIcon />
            Reset APN Profiles
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "apn"
                ? "Change the APN?"
                : confirm === "apn-reset"
                  ? "Reset every APN profile?"
                  : `Switch to SIM ${pendingSim}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "apn"
                ? "The radio restarts to attach with the new APN: the connection drops for a few seconds."
                : confirm === "apn-reset"
                  ? "Every APN profile is deleted and the modem reboots; the operator defaults apply afterwards."
                  : "The modem registers again with the other SIM: the connection drops until it is done."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSim(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "apn-reset" ? "destructive" : "default"}
              onClick={runConfirmed}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
