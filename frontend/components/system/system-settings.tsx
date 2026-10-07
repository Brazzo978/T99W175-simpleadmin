"use client";

import { useEffect, useState } from "react";
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
import { sendAt } from "@/lib/at";
import { authFetch } from "@/lib/auth-fetch";
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
  type RebootForm,
} from "@/lib/reboot-schedule";

const goToRebootPage = () => {
  sessionStorage.setItem("qm_rebooting", "1");
  window.location.href = "/reboot/";
};

// --- Scheduled reboot --------------------------------------------------------

function ScheduledRebootCard() {
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
        toast.success("Scheduled reboot removed");
      } else toast.error("Unable to remove the schedule");
      return;
    }
    const problem = validateSchedule(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    const line = buildSchedule(form);
    if (await post({ schedule: line })) {
      setSaved(line);
      toast.success(`Reboot scheduled: ${describeSchedule(form)}`);
    } else toast.error("Unable to save the schedule");
  };

  const current = saved ? parseSchedule(saved) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled Reboot</CardTitle>
        <CardDescription>
          {saved === null
            ? "Loading…"
            : current
              ? `Active: ${describeSchedule(current)}`
              : "No reboot scheduled."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {saved === null ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="reboot-enabled">Enabled</Label>
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
                  <ToggleGroupItem value="interval" className="px-4">Every N hours</ToggleGroupItem>
                  <ToggleGroupItem value="schedule" className="px-4">At a set time</ToggleGroupItem>
                </ToggleGroup>
                {form.mode === "interval" ? (
                  <div className="grid gap-2">
                    <Label>Hours between reboots</Label>
                    <Select
                      value={String(form.intervalHours)}
                      onValueChange={(v) => setForm({ ...form, intervalHours: Number(v) })}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INTERVAL_HOURS.map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {h === 24 ? "24 (daily, at midnight)" : String(h)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid gap-4 @md/main:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Frequency</Label>
                      <Select
                        value={form.frequency}
                        onValueChange={(v) => setForm({ ...form, frequency: v as RebootForm["frequency"] })}
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.frequency === "weekly" && (
                      <div className="grid gap-2">
                        <Label>Day</Label>
                        <Select
                          value={String(form.dayOfWeek)}
                          onValueChange={(v) => setForm({ ...form, dayOfWeek: Number(v) })}
                        >
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WEEKDAYS.map((day, i) => (
                              <SelectItem key={day} value={String(i)}>{day}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {form.frequency === "monthly" && (
                      <div className="grid gap-2">
                        <Label htmlFor="reboot-dom">Day of month</Label>
                        <Input
                          id="reboot-dom"
                          inputMode="numeric"
                          value={Number.isNaN(form.dayOfMonth) ? "" : String(form.dayOfMonth)}
                          onChange={(e) => setForm({ ...form, dayOfMonth: Number.parseInt(e.target.value, 10) })}
                        />
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="reboot-time">Time</Label>
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
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- IMEI ----------------------------------------------------------------------

function ImeiCard() {
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
      toast.error("The IMEI must be 15 digits with a valid check digit");
      return;
    }
    setBusy(true);
    try {
      const clear = await sendAt("AT^NV=550,0");
      if (!clear.ok) {
        toast.error(clear.message || "Unable to clear the IMEI");
        return;
      }
      // The modem needs a moment between the two NV writes.
      await new Promise((r) => setTimeout(r, 3000));
      const payload = imeiNvPayload(digits);
      const set = await sendAt(`AT^NV=550,${payload.split(",").length},"${payload}"`);
      if (!set.ok) {
        toast.error(set.message || "Unable to write the IMEI");
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
        <CardDescription>Current: {current || "…"}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Label htmlFor="imei">New IMEI</Label>
        <Input
          id="imei"
          inputMode="numeric"
          maxLength={15}
          value={value}
          aria-invalid={digits !== "" && !/^\d{15}$/.test(digits)}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        />
        {digits.length === 15 && !luhnOk && (
          <p className="text-sm text-destructive">
            The check digit does not match (Luhn): this is not a valid IMEI.
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" disabled={!writable || busy} onClick={() => setStep("warning")}>
          Change IMEI
        </Button>
      </CardFooter>

      <AlertDialog open={step !== null} onOpenChange={(open) => !open && !busy && setStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {step === "warning" ? "Legal warning" : step === "confirm" ? `Write IMEI ${digits}?` : "IMEI written"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {step === "warning"
                ? "Changing the IMEI is illegal in many countries. Only restore the original IMEI of this device; you are responsible for its use."
                : step === "confirm"
                  ? "The modem identity changes after the next restart. Note the current IMEI before continuing."
                  : "Restart the modem now to use the new IMEI?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{step === "reboot" ? "Later" : "Cancel"}</AlertDialogCancel>
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
                  else toast.error(r.message || "Restart refused");
                }
              }}
            >
              {step === "warning" ? "I understand" : step === "confirm" ? "Write" : "Restart"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// --- eSIM manager ----------------------------------------------------------------

function EsimToggleCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authFetch("/cgi-bin/esim_config", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setEnabled(json.success === true && Number(json.data?.enabled) === 1))
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      const resp = await authFetch("/cgi-bin/toggle_esim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value ? 1 : 0 }),
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message);
      setEnabled(value);
      toast.success(value ? "eSIM manager enabled" : "eSIM manager disabled");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Unable to change the eSIM manager");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>eSIM Manager</CardTitle>
        <CardDescription>
          Runs the local euicc-client service behind the eSIM page (profiles on SIM 2).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Label htmlFor="esim-enabled">Enabled</Label>
          <Switch
            id="esim-enabled"
            checked={enabled ?? false}
            disabled={enabled === null || busy}
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// --- Factory reset ---------------------------------------------------------------

function FactoryResetCard() {
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
      toast.error(err instanceof Error && err.message ? err.message : "Factory reset failed");
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Factory Reset</CardTitle>
        <CardDescription>
          Removes band and cell locks, sets automatic network mode, restores the
          LAN, firewall and IPA configuration, the system and web passwords and
          simpleadmin.conf, then reboots.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="destructive" onClick={() => setConfirm(true)} disabled={busy}>
          <RotateCcwIcon />
          Factory Reset
        </Button>
      </CardFooter>
      <AlertDialog open={confirm} onOpenChange={(open) => !busy && setConfirm(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-destructive" />
              Reset to factory defaults?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every setting listed above is lost and the modem reboots. Afterwards
              it answers at 192.168.225.1 with the default credentials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                reset();
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function SystemSettingsComponent() {
  return (
    <PageShell
      title="System"
      description="Scheduled reboot, modem identity, optional services and factory reset."
    >
      <ScheduledRebootCard />
      <ImeiCard />
      <EsimToggleCard />
      <FactoryResetCard />
    </PageShell>
  );
}
