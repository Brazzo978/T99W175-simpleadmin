"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  PencilIcon,
  PowerIcon,
  QrCodeIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import jsQR from "jsqr";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useEsim, type EsimServerConfig } from "@/hooks/use-esim";

/** A QR code failure: `key` is under download.qr_errors. */
class QrError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

/** "LPA:1$smdp$matching-id[$confirmation-code]" */
function parseLpa(text: string) {
  const match = text.trim().match(/^LPA:1\$([^$]+)\$([^$]+)(?:\$([^$]+))?$/);
  if (!match) throw new QrError("not_lpa");
  return { smdp: match[1], matching_id: match[2], confirmation_code: match[3] ?? "" };
}

function readQr(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new QrError("canvas"));
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code) resolve(code.data);
      else reject(new QrError("no_qr"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new QrError("load_image"));
    };
    img.src = url;
  });
}

const report = (error: string | null, success: string) =>
  error ? toast.error(error) : toast.success(success);

export default function EsimComponent() {
  const { t } = useTranslation("esim");
  const esim = useEsim();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ smdp: "", matching_id: "", confirmation_code: "", auto_confirm: true });
  const [nickname, setNickname] = useState<{ iccid: string; value: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [serverDraft, setServerDraft] = useState<EsimServerConfig | null>(null);

  if (esim.enabled === false || !esim.clientInstalled) {
    const missing = !esim.clientInstalled;
    return (
      <PageShell title={t("page.title")} description={t("page.description_off")}>
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>
              {missing ? t("off.missing_title") : t("off.disabled_title")}
            </CardTitle>
            <CardDescription>
              {missing ? t("off.missing_description") : t("off.disabled_description")}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline">
              <a href="/system/settings/">{t("off.open_system")}</a>
            </Button>
          </CardFooter>
        </Card>
      </PageShell>
    );
  }

  const busy = esim.busy !== null;
  const server = serverDraft ?? esim.serverConfig;

  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
    >
      <Card className="col-span-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{t("profiles.title")}</CardTitle>
              <CardDescription>{t("profiles.eid", { eid: esim.eid ?? "—" })}</CardDescription>
            </div>
            {esim.healthy !== null && (
              <Badge
                variant="outline"
                className={
                  esim.healthy
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-destructive/15 text-destructive border-destructive/30"
                }
              >
                {esim.healthy ? t("profiles.online") : t("profiles.offline")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {esim.enabled === null || esim.healthy === null ? (
            <Skeleton className="h-32 w-full" />
          ) : !esim.healthy ? (
            <p className="text-sm text-muted-foreground">
              {t("profiles.no_answer", { url: esim.baseUrl })}
            </p>
          ) : esim.profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("profiles.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("profiles.col_profile")}</TableHead>
                  <TableHead>ICCID</TableHead>
                  <TableHead>{t("profiles.col_state")}</TableHead>
                  <TableHead className="text-right">{t("profiles.col_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {esim.profiles.map((p) => (
                  <TableRow key={p.iccid}>
                    <TableCell>
                      <div className="font-medium">{p.profile_nickname || p.profile_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.service_provider_name}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.iccid}</TableCell>
                    <TableCell>
                      <Badge variant={p.enabled ? "default" : "secondary"}>
                        {p.enabled ? t("profiles.enabled") : t("profiles.disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={async () =>
                            report(
                              p.enabled ? await esim.disableProfile(p.iccid) : await esim.enableProfile(p.iccid),
                              p.enabled ? t("profiles.toast_disabled") : t("profiles.toast_enabled"),
                            )
                          }
                        >
                          <PowerIcon />
                          {p.enabled ? t("profiles.disable") : t("profiles.enable")}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("profiles.rename_aria")}
                          disabled={busy}
                          onClick={() => setNickname({ iccid: p.iccid, value: p.profile_nickname ?? "" })}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("profiles.delete_aria")}
                          disabled={busy || p.enabled}
                          onClick={() => setToDelete(p.iccid)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" disabled={busy || !esim.healthy} onClick={() => esim.refresh().catch(() => {})}>
            <RefreshCwIcon />
            {t("profiles.refresh")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("download.title")}</CardTitle>
          <CardDescription>{t("download.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="smdp">{t("download.smdp")}</Label>
            <Input id="smdp" value={form.smdp} onChange={(e) => setForm({ ...form, smdp: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="matching">{t("download.matching_id")}</Label>
            <Input id="matching" value={form.matching_id} onChange={(e) => setForm({ ...form, matching_id: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ccode">{t("download.confirmation_code")}</Label>
            <Input id="ccode" value={form.confirmation_code} onChange={(e) => setForm({ ...form, confirmation_code: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="autoconfirm"
              checked={form.auto_confirm}
              onCheckedChange={(v) => setForm({ ...form, auto_confirm: v === true })}
            />
            <Label htmlFor="autoconfirm">{t("download.auto_confirm")}</Label>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setForm({ ...form, ...parseLpa(await readQr(file)) });
                toast.success(t("download.toast_qr_read"));
              } catch (err) {
                toast.error(
                  err instanceof QrError
                    ? t(`download.qr_errors.${err.key}`)
                    : err instanceof Error
                      ? err.message
                      : t("download.qr_errors.failed"),
                );
              }
            }}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !esim.healthy || !form.smdp.trim() || !form.matching_id.trim()}
            onClick={async () => {
              const error = await esim.download({
                smdp: form.smdp.trim(),
                matching_id: form.matching_id.trim(),
                confirmation_code: form.confirmation_code.trim(),
                auto_confirm: form.auto_confirm,
              });
              report(error, t("download.toast_downloaded"));
              if (!error) setForm({ ...form, confirmation_code: "" });
            }}
          >
            <DownloadIcon />
            {esim.busy === "download" ? t("download.downloading") : t("download.button")}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <QrCodeIcon />
            {t("download.read_qr")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notifications.title")}</CardTitle>
          <CardDescription>{t("notifications.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {esim.notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
          ) : (
            <div className="grid gap-2">
              {esim.notifications.map((n) => (
                <div
                  key={`${n.iccid}-${n.sequence_number}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="grid gap-0.5 text-sm">
                    <span className="font-medium">
                      #{n.sequence_number} {n.operation_name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{n.iccid}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () =>
                        report(
                          await esim.processNotification(n.iccid, n.sequence_number, true),
                          t("notifications.toast_sent"),
                        )
                      }
                    >
                      {t("notifications.send")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () =>
                        report(
                          await esim.removeNotification(n.iccid, n.sequence_number),
                          t("notifications.toast_removed"),
                        )
                      }
                    >
                      {t("notifications.remove")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        {esim.notifications.length > 0 && (
          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => report(await esim.processAll(), t("notifications.toast_all_sent"))}
            >
              {t("notifications.send_all")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => report(await esim.removeAll(), t("notifications.toast_all_removed"))}
            >
              {t("notifications.remove_all")}
            </Button>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("server.title")}</CardTitle>
          <CardDescription>{t("server.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!server ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="esim-imei">IMEI</Label>
                <Input
                  id="esim-imei"
                  inputMode="numeric"
                  maxLength={15}
                  value={server.imei}
                  onChange={(e) => setServerDraft({ ...server, imei: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("server.slot")}</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="justify-start"
                  value={String(server.slot)}
                  onValueChange={(v) => v && setServerDraft({ ...server, slot: v === "1" ? 1 : 2 })}
                >
                  <ToggleGroupItem value="1" className="px-4">SIM 1</ToggleGroupItem>
                  <ToggleGroupItem value="2" className="px-4">SIM 2</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="esim-refresh"
                  checked={server.refresh}
                  onCheckedChange={(v) => setServerDraft({ ...server, refresh: v === true })}
                />
                <Label htmlFor="esim-refresh">{t("server.refresh")}</Label>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            disabled={busy || !serverDraft || !/^\d{15}$/.test(serverDraft.imei)}
            onClick={async () => {
              if (!serverDraft) return;
              const error = await esim.saveServerConfig(serverDraft);
              report(error, t("server.toast_saved"));
              if (!error) setServerDraft(null);
            }}
          >
            {t("common:actions.save")}
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={nickname !== null} onOpenChange={(open) => !open && setNickname(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("nickname.title")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nickname?.value ?? ""}
            onChange={(e) => nickname && setNickname({ ...nickname, value: e.target.value })}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNickname(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!nickname) return;
                const error = await esim.setNickname(nickname.iccid, nickname.value.trim());
                report(error, t("nickname.toast_saved"));
                if (!error) setNickname(null);
              }}
            >
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete_dialog.description", { iccid: toDelete })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const iccid = toDelete;
                setToDelete(null);
                if (iccid) report(await esim.deleteProfile(iccid), t("delete_dialog.toast_deleted"));
              }}
            >
              {t("delete_dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
