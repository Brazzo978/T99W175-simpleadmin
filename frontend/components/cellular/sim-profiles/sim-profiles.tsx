"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  CardSimIcon,
  CheckCircle2Icon,
  CopyPlusIcon,
  MinusCircleIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ApplyProgressDialog } from "@/components/cellular/sim-profiles/apply-progress-dialog";
import {
  ProfileFormDialog,
  type ProfileDraft,
} from "@/components/cellular/sim-profiles/profile-form-dialog";
import {
  useProfileApply,
  useSimProfiles,
  type ApplyState,
  type SimProfile,
} from "@/hooks/use-sim-profiles";
import { PDP_TYPES, type PdpType } from "@/lib/radio-at";
import { cn } from "@/lib/utils";

const TRIGGERS: Record<string, string> = {
  manual: "applied by hand",
  sim_change: "SIM change",
  watchdog: "watchdog SIM switch",
};

const PDP_LABELS: Record<string, string> = { IP: "IPv4", IPV6: "IPv6", IPV4V6: "IPv4v6" };

const ttlText = (ttl: string | number) =>
  ttl === "" ? "Unchanged" : String(ttl) === "0" ? "Off" : String(ttl);

const apnText = (apn: string, pdp: string) =>
  apn ? `${apn} (${PDP_LABELS[pdp] ?? pdp})` : "Unchanged";

const shortIccid = (iccid: string) => `…${iccid.slice(-4)}`;

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const BADGE = {
  success: "bg-success/15 text-success hover:bg-success/20 border-success/30",
  warning: "bg-warning/15 text-warning hover:bg-warning/20 border-warning/30",
  destructive: "bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30",
  muted: "bg-muted/50 text-muted-foreground border-muted-foreground/30",
} as const;

function ApplyBadge({ state }: { state: ApplyState }) {
  if (state.status === "complete") {
    return (
      <Badge variant="outline" className={BADGE.success}>
        <CheckCircle2Icon className="size-3" />
        Applied
      </Badge>
    );
  }
  if (state.status === "partial") {
    return (
      <Badge variant="outline" className={BADGE.warning}>
        <TriangleAlertIcon className="size-3" />
        Partial
      </Badge>
    );
  }
  if (state.status === "failed") {
    return (
      <Badge variant="outline" className={BADGE.destructive}>
        <XCircleIcon className="size-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-info/15 text-info hover:bg-info/20 border-info/30">
      Applying…
    </Badge>
  );
}

function Row({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("min-w-0 truncate text-right font-medium", mono && "font-mono text-xs")}>{children}</span>
    </div>
  );
}

const emptyDraft = (iccid = ""): ProfileDraft => ({
  iccid,
  name: "",
  apn: "",
  pdpType: "IPV4V6",
  ttl: "",
});

export default function SimProfilesComponent() {
  const sp = useSimProfiles();
  const applier = useProfileApply(() => sp.refresh());
  const [form, setForm] = useState<{ key: number; initial: ProfileDraft; editing?: string } | null>(null);
  const [toDelete, setToDelete] = useState<SimProfile | null>(null);
  const [toApply, setToApply] = useState<SimProfile | null>(null);

  const data = sp.data;
  const active = data?.active ?? null;
  const activeIccid = active?.simReady ? active.iccid : "";
  const activeProfile = data?.profiles.find((p) => p.iccid === activeIccid) ?? null;
  const last = data?.lastApply ?? null;
  const profiles = [...(data?.profiles ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const openForm = (initial: ProfileDraft, editing?: string) =>
    setForm({ key: Date.now(), initial, editing });

  const fromCurrent = () => {
    const cur = data?.current;
    const pdp = (PDP_TYPES as readonly string[]).includes(cur?.pdpType ?? "")
      ? (cur!.pdpType as PdpType)
      : "IPV4V6";
    openForm({
      ...emptyDraft(activeIccid),
      name: `SIM ${active?.slot || ""} ${activeIccid.slice(-4)}`.replace(/\s+/g, " ").trim(),
      apn: cur?.apn ?? "",
      pdpType: pdp,
      ttl: cur ? String(cur.ttl) : "",
    });
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    const result = await sp.remove(target.iccid);
    if (result.ok) toast.success(`Profile "${target.name}" deleted`);
    else toast.error(result.message);
  };

  const handleApply = () => {
    if (!toApply) return;
    const target = toApply;
    setToApply(null);
    applier.apply(target.iccid);
  };

  const busy = applier.open && (!applier.state || applier.state.status === "applying");

  return (
    <PageShell
      title="SIM Profiles"
      description="APN and TTL per SIM card, applied by themselves when the active SIM changes: a swapped card, a slot switch, a watchdog failover."
    >
      {data && !data.installed && (
        <Card className="@3xl/main:col-span-2">
          <CardHeader>
            <CardTitle>SIM profiles are not installed on the modem</CardTitle>
            <CardDescription>
              The web UI is newer than the system scripts: run ./install.sh without --onlywww to
              add sim-profiles and its timer. Profiles can be edited meanwhile, but nothing applies
              them.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Active SIM</CardTitle>
          <CardDescription>The SIM in use now and the settings the modem runs with.</CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => sp.refresh()}
              disabled={sp.isRefreshing}
              aria-label="Refresh"
            >
              <RefreshCwIcon className={cn("size-4", sp.isRefreshing && "animate-spin motion-reduce:animate-none")} />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {sp.error && !data ? (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <AlertCircleIcon className="size-4 shrink-0" />
              {sp.error}
            </div>
          ) : !data ? (
            <div className="grid gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <div className="divide-y rounded-lg border px-4">
              <Row label="ICCID" mono>
                {activeIccid || (data.installed ? "No SIM ready" : "Unknown")}
              </Row>
              <Row label="Slot">
                {active?.slot ? (active.slot === 2 ? "SIM 2 / eSIM" : "SIM 1") : "Unknown"}
              </Row>
              <Row label="Profile">
                {activeProfile ? (
                  <Badge variant="outline" className={BADGE.success}>
                    <CheckCircle2Icon className="size-3" />
                    {activeProfile.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className={BADGE.muted}>
                    <MinusCircleIcon className="size-3" />
                    No profile
                  </Badge>
                )}
              </Row>
              <Row label="APN now">{data.current ? apnText(data.current.apn, data.current.pdpType) : "Unknown"}</Row>
              <Row label="TTL now">{data.current ? ttlText(data.current.ttl) : "Unknown"}</Row>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          {activeProfile ? (
            <>
              <Button
                variant="outline"
                onClick={() => openForm({ ...activeProfile }, activeProfile.iccid)}
                disabled={!data}
              >
                <PencilIcon />
                Edit Profile
              </Button>
              <Button onClick={() => setToApply(activeProfile)} disabled={busy || !data?.installed}>
                <PlayIcon />
                Apply Now
              </Button>
            </>
          ) : (
            <Button onClick={fromCurrent} disabled={!activeIccid}>
              <CopyPlusIcon />
              Create from Current Settings
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Last Apply</CardTitle>
          <CardDescription>
            A new SIM gets its profile at the second check, about 30 seconds after it shows up; a
            watchdog switch applies it at once.
          </CardDescription>
          {last && (
            <CardAction>
              <ApplyBadge state={last} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : !last ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
              <CardSimIcon className="text-muted-foreground size-8" />
              <p className="text-sm font-medium">No profile applied since the last reboot</p>
              <p className="text-muted-foreground max-w-xs text-xs">
                Create a profile for each SIM; it applies when that SIM becomes the active one.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border px-4">
              <Row label="Profile">
                {last.name || "—"} <span className="text-muted-foreground font-mono text-xs">{shortIccid(last.iccid)}</span>
              </Row>
              <Row label="Why">{TRIGGERS[last.trigger] ?? last.trigger}</Row>
              <Row label="When">{last.started ? formatTime(last.started) : "—"}</Row>
              {last.steps.map((step) => (
                <Row key={step.name} label={step.name === "apn" ? "APN" : "TTL"}>
                  <span
                    className={cn(
                      step.status === "failed" && "text-destructive",
                      step.status === "skipped" && "text-muted-foreground",
                    )}
                    title={step.detail}
                  >
                    {step.detail || step.status}
                  </span>
                </Row>
              ))}
              {last.error && <p className="text-destructive py-2 text-xs">{last.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="@container/card @3xl/main:col-span-2">
        <CardHeader>
          <CardTitle>Profiles</CardTitle>
          <CardDescription>
            One per SIM, keyed by ICCID and kept in /data/simpleadmin/sim-profiles across updates.
          </CardDescription>
          <CardAction>
            <Button variant="outline" onClick={() => openForm(emptyDraft(activeProfile ? "" : activeIccid))}>
              <PlusIcon />
              Add Profile
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Profile</TableHead>
                  <TableHead className="hidden @md/card:table-cell">APN</TableHead>
                  <TableHead className="hidden @md/card:table-cell">TTL</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell className="hidden @md/card:table-cell">
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="hidden @md/card:table-cell">
                        <Skeleton className="h-4 w-10" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-8 w-24" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : profiles.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-10">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <CardSimIcon className="text-muted-foreground size-8" />
                        <p className="text-sm font-medium">No SIM profiles yet</p>
                        <p className="text-muted-foreground max-w-sm text-xs whitespace-normal">
                          Start from the active SIM with Create from Current Settings, or add one for
                          another SIM by its ICCID.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((p) => (
                    <TableRow key={p.iccid}>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.iccid === activeIccid && (
                            <Badge variant="outline" className={BADGE.success}>
                              <CheckCircle2Icon className="size-3" />
                              Active SIM
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground font-mono text-xs">{p.iccid}</div>
                        <div className="text-muted-foreground mt-1 text-xs @md/card:hidden">
                          APN {apnText(p.apn, p.pdpType)} · TTL {ttlText(p.ttl)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden align-top @md/card:table-cell">{apnText(p.apn, p.pdpType)}</TableCell>
                      <TableCell className="hidden align-top tabular-nums @md/card:table-cell">{ttlText(p.ttl)}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setToApply(p)}
                            disabled={busy || !data.installed}
                          >
                            <PlayIcon />
                            Apply
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${p.name}`}
                            onClick={() => openForm({ ...p }, p.iccid)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => setToDelete(p)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {form && (
        <ProfileFormDialog
          key={form.key}
          open
          onOpenChange={(o) => !o && setForm(null)}
          initial={form.initial}
          editing={form.editing}
          activeIccid={activeIccid || undefined}
          onSave={async (draft, previous) => {
            const result = await sp.save(draft, previous);
            if (result.ok) toast.success(`Profile "${draft.name}" saved`);
            return result;
          }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{toDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The modem keeps its current APN and TTL; the SIM simply gets no profile the next time
              it becomes active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toApply} onOpenChange={(o) => !o && setToApply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply &ldquo;{toApply?.name}&rdquo; now?</AlertDialogTitle>
            <AlertDialogDescription>
              {toApply && activeIccid && toApply.iccid !== activeIccid
                ? `This profile belongs to another SIM (${shortIccid(toApply.iccid)}): its settings go to the active one (${shortIccid(activeIccid)}). `
                : ""}
              When the APN changes, the radio restarts to attach with it and the connection drops for
              10 to 20 seconds. The TTL changes at once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApplyProgressDialog
        open={applier.open}
        state={applier.state}
        error={applier.error}
        onClose={applier.close}
        onRetry={applier.state ? () => applier.apply(applier.state!.iccid) : undefined}
      />
    </PageShell>
  );
}
