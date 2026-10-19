"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangleIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
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
import { Switch } from "@/components/ui/switch";
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
import { useBridgeState } from "@/hooks/use-bridge";
import { atMessage, sendAt } from "@/lib/at";
import { authFetch } from "@/lib/auth-fetch";
import { translate } from "@/lib/i18n/message";
import { imeiNvPayload, validateImei } from "@/lib/imei-utils";
import { rebootModem } from "@/lib/modem-actions";
import {
  DEFAULT_REBOOT_FORM,
  INTERVAL_HOURS,
  WEEKDAYS,
  buildSchedule,
  describeSchedule,
  parseSchedule,
  validateSchedule,
  weekdayKey,
  type RebootForm,
} from "@/lib/reboot-schedule";

const goToRebootPage = () => {
  sessionStorage.setItem("qm_rebooting", "1");
  window.location.href = "/reboot/";
};

// --- Scheduled reboot --------------------------------------------------------

function ScheduledRebootCard() {
  const { t } = useTranslation("system-settings");
  const [saved, setSaved] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [form, setForm] = useState<RebootForm>(DEFAULT_REBOOT_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authFetch("/cgi-bin/reboot_schedule", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const line = json.schedule || "";
        setSaved(line);
        setEnabled(Boolean(line));
        setForm(parseSchedule(line) ?? DEFAULT_REBOOT_FORM);
      })
      .catch(() => setSaved(""));
  }, []);

  const post = async (body: Record<string, string>) => {
    setBusy(true);
    try {
      const resp = await authFetch("/cgi-bin/reboot_schedule", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
      });
      return resp.ok;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!enabled) {
      if (await post({ action: "delete" })) {
        setSaved("");
        toast.success(t("reboot.toast.removed"));
      } else toast.error(t("reboot.toast.remove_failed"));
      return;
    }
    const problem = validateSchedule(form);
    if (problem) {
      toast.error(translate(t, problem));
      return;
    }
    const line = buildSchedule(form);
    if (await post({ schedule: line })) {
      setSaved(line);
      toast.success(t("reboot.toast.saved", { schedule: translate(t, describeSchedule(form)) }));
    } else toast.error(t("reboot.toast.save_failed"));
  };

  const current = saved ? parseSchedule(saved) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reboot.title")}</CardTitle>
        <CardDescription>
          {saved === null
            ? t("common:state.loading")
            : current
              ? t("reboot.active", { schedule: translate(t, describeSchedule(current)) })
              : t("reboot.none")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {saved === null ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="reboot-enabled">{t("enabled")}</Label>
              <Switch id="reboot-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            {enabled && (
              <>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={form.mode}
                  onValueChange={(v) => v && setForm({ ...form, mode: v as RebootForm["mode"] })}
                  className="justify-start"
                >
                  <ToggleGroupItem value="interval" className="px-4">{t("reboot.mode_interval")}</ToggleGroupItem>
                  <ToggleGroupItem value="schedule" className="px-4">{t("reboot.mode_schedule")}</ToggleGroupItem>
                </ToggleGroup>
                {form.mode === "interval" ? (
                  <div className="grid gap-2">
                    <Label>{t("reboot.hours_between")}</Label>
                    <Select
                      value={String(form.intervalHours)}
                      onValueChange={(v) => setForm({ ...form, intervalHours: Number(v) })}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INTERVAL_HOURS.map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {h === 24 ? t("reboot.interval_daily") : String(h)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid gap-4 @md/main:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>{t("reboot.frequency")}</Label>
                      <Select
                        value={form.frequency}
                        onValueChange={(v) => setForm({ ...form, frequency: v as RebootForm["frequency"] })}
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">{t("reboot.frequencies.daily")}</SelectItem>
                          <SelectItem value="weekly">{t("reboot.frequencies.weekly")}</SelectItem>
                          <SelectItem value="monthly">{t("reboot.frequencies.monthly")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.frequency === "weekly" && (
                      <div className="grid gap-2">
                        <Label>{t("reboot.day")}</Label>
                        <Select
                          value={String(form.dayOfWeek)}
                          onValueChange={(v) => setForm({ ...form, dayOfWeek: Number(v) })}
                        >
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WEEKDAYS.map((day, i) => (
                              <SelectItem key={day} value={String(i)}>{t(weekdayKey(i))}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {form.frequency === "monthly" && (
                      <div className="grid gap-2">
                        <Label htmlFor="reboot-dom">{t("reboot.day_of_month")}</Label>
                        <Input
                          id="reboot-dom"
                          inputMode="numeric"
                          value={Number.isNaN(form.dayOfMonth) ? "" : String(form.dayOfMonth)}
                          onChange={(e) => setForm({ ...form, dayOfMonth: Number.parseInt(e.target.value, 10) })}
                        />
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="reboot-time">{t("reboot.time")}</Label>
                      <Input
                        id="reboot-time"
                        type="time"
                        value={form.time}
                        onChange={(e) => setForm({ ...form, time: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={busy || saved === null}>
          <SaveIcon />
          {t("common:actions.save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- IMEI ----------------------------------------------------------------------

function ImeiCard() {
  const { t } = useTranslation("system-settings");
  const { system } = useBridgeState();
  const current = system?.modem.imei ?? "";
  const [value, setValue] = useState("");
  const [step, setStep] = useState<null | "warning" | "confirm" | "reboot">(null);
  const [busy, setBusy] = useState(false);

  const digits = value.trim();
  const luhnOk = validateImei(digits);
  const writable = luhnOk && digits !== current;

  const write = async () => {
    // Checked again here: the NV item is cleared first, so a bad value must
    // never reach that point.
    if (!validateImei(digits) || digits === current) {
      toast.error(t("imei.invalid"));
      return;
    }
    setBusy(true);
    try {
      const clear = await sendAt("AT^NV=550,0");
      if (!clear.ok) {
        toast.error(atMessage(t, clear) || t("imei.clear_failed"));
        return;
      }
      // The modem needs a moment between the two NV writes.
      await new Promise((r) => setTimeout(r, 3000));
      const payload = imeiNvPayload(digits);
      const set = await sendAt(`AT^NV=550,${payload.split(",").length},"${payload}"`);
      if (!set.ok) {
        toast.error(atMessage(t, set) || t("imei.write_failed"));
        return;
      }
      setStep("reboot");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>IMEI</CardTitle>
        <CardDescription>{t("imei.current", { imei: current || "…" })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Label htmlFor="imei">{t("imei.new")}</Label>
        <Input
          id="imei"
          inputMode="numeric"
          maxLength={15}
          value={value}
          aria-invalid={digits !== "" && !/^\d{15}$/.test(digits)}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        />
        {digits.length === 15 && !luhnOk && (
          <p className="text-sm text-destructive">{t("imei.luhn_mismatch")}</p>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" disabled={!writable || busy} onClick={() => setStep("warning")}>
          {t("imei.change")}
        </Button>
      </CardFooter>

      <AlertDialog open={step !== null} onOpenChange={(open) => !open && !busy && setStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {step === "warning"
                ? t("imei.dialog.warning_title")
                : step === "confirm"
                  ? t("imei.dialog.confirm_title", { imei: digits })
                  : t("imei.dialog.written_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {step === "warning"
                ? t("imei.dialog.warning_description")
                : step === "confirm"
                  ? t("imei.dialog.confirm_description")
                  : t("imei.dialog.written_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {step === "reboot" ? t("imei.dialog.later") : t("common:actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (step === "warning") setStep("confirm");
                else if (step === "confirm") await write();
                else {
                  const r = await rebootModem();
                  if (r.ok) goToRebootPage();
                  else toast.error(atMessage(t, r) || t("imei.restart_refused"));
                }
              }}
            >
              {step === "warning"
                ? t("imei.dialog.understand")
                : step === "confirm"
                  ? t("imei.dialog.write")
                  : t("imei.dialog.restart")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// --- eSIM manager ----------------------------------------------------------------

function EsimToggleCard() {
  const { t } = useTranslation("system-settings");
  const [state, setState] = useState<{
    enabled: boolean;
    clientInstalled: boolean;
    clientPath: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authFetch("/cgi-bin/esim_config", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) =>
        setState({
          enabled: json.success === true && Number(json.data?.enabled) === 1,
          // Older CGIs do not report it: assume present, the toggle still checks.
          clientInstalled: json.data?.client_installed !== false,
          clientPath: json.data?.client_path || "/home/root/euicc-sd-client",
        }),
      )
      .catch(() => setState({ enabled: false, clientInstalled: true, clientPath: "" }));
  }, []);

  const toggle = async (value: boolean) => {
    if (!state) return;
    setBusy(true);
    try {
      const resp = await authFetch("/cgi-bin/toggle_esim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value ? 1 : 0 }),
      });
      const json = await resp.json();
      if (json.code === "client_missing") {
        setState({ ...state, clientInstalled: false });
      }
      if (!json.ok) throw new Error(json.message);
      setState({ ...state, enabled: value });
      toast.success(value ? t("esim.toast.enabled") : t("esim.toast.disabled"));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("esim.toast.failed"));
    } finally {
      setBusy(false);
    }
  };

  // Without the client it can only be switched off, never on.
  const missing = state !== null && !state.clientInstalled;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("esim.title")}</CardTitle>
        <CardDescription>{t("esim.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="esim-enabled">{t("enabled")}</Label>
          <Switch
            id="esim-enabled"
            checked={state?.enabled ?? false}
            disabled={state === null || busy || (missing && !state.enabled)}
            onCheckedChange={toggle}
          />
        </div>
        {missing && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{t("esim.client_missing", { path: state.clientPath })}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Factory reset ---------------------------------------------------------------

function FactoryResetCard() {
  const { t } = useTranslation("system-settings");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      const resp = await authFetch("/cgi-bin/factory_reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await resp.json();
      if (json.status !== "success") throw new Error(json.message);
      goToRebootPage();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("factory_reset.failed"));
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>{t("factory_reset.title")}</CardTitle>
        <CardDescription>{t("factory_reset.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="destructive" onClick={() => setConfirm(true)} disabled={busy}>
          <RotateCcwIcon />
          {t("factory_reset.button")}
        </Button>
      </CardFooter>
      <AlertDialog open={confirm} onOpenChange={(open) => !busy && setConfirm(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-destructive" />
              {t("factory_reset.dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("factory_reset.dialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                reset();
              }}
            >
              {t("factory_reset.dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function SystemSettingsComponent() {
  const { t } = useTranslation("system-settings");
  return (
    <PageShell title={t("page.title")} description={t("page.description")}>
      <ScheduledRebootCard />
      <ImeiCard />
      <EsimToggleCard />
      <FactoryResetCard />
    </PageShell>
  );
}
