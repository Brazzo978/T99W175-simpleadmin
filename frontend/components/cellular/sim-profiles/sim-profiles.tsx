"use client";

import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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

/** Why the last apply ran: keys under last_apply.triggers */
const TRIGGERS = new Set(["manual", "sim_change", "watchdog"]);

const PDP_LABELS: Record<string, string> = { IP: "IPv4", IPV6: "IPv6", IPV4V6: "IPv4v6" };

const ttlText = (t: TFunction, ttl: string | number) =>
  ttl === "" ? t("values.unchanged") : String(ttl) === "0" ? t("values.off") : String(ttl);

const apnText = (t: TFunction, apn: string, pdp: string) =>
  apn ? `${apn} (${PDP_LABELS[pdp] ?? pdp})` : t("values.unchanged");

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
  const { t } = useTranslation("sim-profiles");
  if (state.status === "complete") {
    return (
      <Badge variant="outline" className={BADGE.success}>
        <CheckCircle2Icon className="size-3" />
        {t("status.applied")}
      </Badge>
    );
  }
  if (state.status === "partial") {
    return (
      <Badge variant="outline" className={BADGE.warning}>
        <TriangleAlertIcon className="size-3" />
        {t("status.partial")}
      </Badge>
    );
  }
  if (state.status === "failed") {
    return (
      <Badge variant="outline" className={BADGE.destructive}>
        <XCircleIcon className="size-3" />
        {t("status.failed")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-info/15 text-info hover:bg-info/20 border-info/30">
      {t("status.applying")}
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
  const { t } = useTranslation("sim-profiles");
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
    if (result.ok) toast.success(t("toast.deleted", { name: target.name }));
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
      title={t("page.title")}
      description={t("page.description")}
    >
      {data && !data.installed && (
        <Card className="@3xl/main:col-span-2">
          <CardHeader>
            <CardTitle>{t("not_installed.title")}</CardTitle>
            <CardDescription>{t("not_installed.description")}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>{t("active.title")}</CardTitle>
          <CardDescription>{t("active.description")}</CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => sp.refresh()}
              disabled={sp.isRefreshing}
              aria-label={t("active.refresh_aria")}
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
                {activeIccid || (data.installed ? t("active.no_sim_ready") : t("values.unknown"))}
              </Row>
              <Row label={t("active.slot")}>
                {active?.slot ? (active.slot === 2 ? "SIM 2 / eSIM" : "SIM 1") : t("values.unknown")}
              </Row>
              <Row label={t("active.profile")}>
                {activeProfile ? (
                  <Badge variant="outline" className={BADGE.success}>
                    <CheckCircle2Icon className="size-3" />
                    {activeProfile.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className={BADGE.muted}>
                    <MinusCircleIcon className="size-3" />
                    {t("active.no_profile")}
                  </Badge>
                )}
              </Row>
              <Row label={t("active.apn_now")}>
                {data.current ? apnText(t, data.current.apn, data.current.pdpType) : t("values.unknown")}
              </Row>
              <Row label={t("active.ttl_now")}>
                {data.current ? ttlText(t, data.current.ttl) : t("values.unknown")}
              </Row>
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
                {t("active.edit")}
              </Button>
              <Button onClick={() => setToApply(activeProfile)} disabled={busy || !data?.installed}>
                <PlayIcon />
                {t("active.apply_now")}
              </Button>
            </>
          ) : (
            <Button onClick={fromCurrent} disabled={!activeIccid}>
              <CopyPlusIcon />
              {t("active.create_from_current")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle>{t("last_apply.title")}</CardTitle>
          <CardDescription>{t("last_apply.description")}</CardDescription>
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
              <p className="text-sm font-medium">{t("last_apply.empty_title")}</p>
              <p className="text-muted-foreground max-w-xs text-xs">
                {t("last_apply.empty_description")}
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border px-4">
              <Row label={t("last_apply.profile")}>
                {last.name || "—"} <span className="text-muted-foreground font-mono text-xs">{shortIccid(last.iccid)}</span>
              </Row>
              <Row label={t("last_apply.why")}>
                {TRIGGERS.has(last.trigger) ? t(`last_apply.triggers.${last.trigger}`) : last.trigger}
              </Row>
              <Row label={t("last_apply.when")}>{last.started ? formatTime(last.started) : "—"}</Row>
              {last.steps.map((step) => (
                <Row key={step.name} label={step.name === "apn" ? "APN" : "TTL"}>
                  <span
                    className={cn(
                      step.status === "failed" && "text-destructive",
                      step.status === "skipped" && "text-muted-foreground",
                    )}
                    title={step.detail}
                  >
                    {step.detail ||
                      t(`last_apply.step_status.${step.status}`, { defaultValue: step.status })}
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
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>{t("list.description")}</CardDescription>
          <CardAction>
            <Button variant="outline" onClick={() => openForm(emptyDraft(activeProfile ? "" : activeIccid))}>
              <PlusIcon />
              {t("list.add")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("list.col_profile")}</TableHead>
                  <TableHead className="hidden @md/card:table-cell">APN</TableHead>
                  <TableHead className="hidden @md/card:table-cell">TTL</TableHead>
                  <TableHead className="text-right">{t("list.col_actions")}</TableHead>
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
                        <p className="text-sm font-medium">{t("list.empty_title")}</p>
                        <p className="text-muted-foreground max-w-sm text-xs whitespace-normal">
                          {t("list.empty_description")}
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
                              {t("list.active_badge")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground font-mono text-xs">{p.iccid}</div>
                        <div className="text-muted-foreground mt-1 text-xs @md/card:hidden">
                          APN {apnText(t, p.apn, p.pdpType)} · TTL {ttlText(t, p.ttl)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden align-top @md/card:table-cell">{apnText(t, p.apn, p.pdpType)}</TableCell>
                      <TableCell className="hidden align-top tabular-nums @md/card:table-cell">{ttlText(t, p.ttl)}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setToApply(p)}
                            disabled={busy || !data.installed}
                          >
                            <PlayIcon />
                            {t("common:actions.apply")}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t("list.edit_aria", { name: p.name })}
                            onClick={() => openForm({ ...p }, p.iccid)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t("list.delete_aria", { name: p.name })}
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
            if (result.ok) toast.success(t("toast.saved", { name: draft.name }));
            return result;
          }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_dialog.title", { name: toDelete?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_dialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {t("delete_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toApply} onOpenChange={(o) => !o && setToApply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apply_dialog.title", { name: toApply?.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {toApply && activeIccid && toApply.iccid !== activeIccid
                ? t("apply_dialog.other_sim", {
                    profile: shortIccid(toApply.iccid),
                    active: shortIccid(activeIccid),
                  })
                : ""}
              {t("apply_dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply}>{t("common:actions.apply")}</AlertDialogAction>
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
