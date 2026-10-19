"use client";

import { useState } from "react";
import { PowerIcon, RadioIcon, RefreshCwIcon, ArrowLeftRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SaveResult, SimRevertPolicy, WatchdogConfig } from "@/hooks/use-watchdog";
import { isValidIp } from "@/lib/ipv4";
import { cn } from "@/lib/utils";

// =============================================================================
// WatchdogSettingsCard — detection, recovery ladder and limits, one Save
// =============================================================================
// The CGI takes the whole configuration in one POST, so the Save in the
// footer commits every tab. A tab holding an invalid field carries a dot; a
// blocked Save opens the first such tab.
// =============================================================================

type Tab = "detection" | "recovery" | "limits";
type FieldKey = keyof WatchdogConfig;
type Errors = Partial<Record<FieldKey, string>>;

const FIELD_TAB: Partial<Record<FieldKey, Tab>> = {
  targets: "detection",
  failCount: "detection",
  checkInterval: "detection",
  pingTimeoutSec: "detection",
  bootGrace: "detection",
  tier1Enabled: "recovery",
  tier1Settle: "recovery",
  tier2Settle: "recovery",
  cfunDelay: "recovery",
  cfunMaxAttempts: "recovery",
  tier3Settle: "recovery",
  simRevertAfter: "recovery",
  recoveryCooldown: "limits",
  maxRecoveriesPerHour: "limits",
  maxRebootsPerDay: "limits",
};

const RANGES: [FieldKey, number, number, string][] = [
  ["failCount", 1, 120, "Failed checks before acting: 1 to 120."],
  ["checkInterval", 1, 60, "Check interval: 1 to 60 seconds."],
  ["pingTimeoutSec", 1, 60, "Ping timeout: 1 to 60 seconds."],
  ["bootGrace", 0, 3600, "Boot grace: 0 to 3600 seconds."],
  ["tier1Settle", 10, 600, "Settle time: 10 to 600 seconds."],
  ["tier2Settle", 10, 600, "Settle time: 10 to 600 seconds."],
  ["cfunDelay", 1, 120, "Radio off time: 1 to 120 seconds."],
  ["cfunMaxAttempts", 1, 120, "Radio restarts: 1 to 120."],
  ["tier3Settle", 30, 900, "Settle time: 30 to 900 seconds."],
  ["simRevertAfter", 300, 86400, "Switch back after 5 to 1440 minutes."],
  ["recoveryCooldown", 0, 3600, "Cooldown: 0 to 3600 seconds."],
  ["maxRecoveriesPerHour", 1, 60, "Actions per hour: 1 to 60."],
  ["maxRebootsPerDay", 1, 24, "Reboots per day: 1 to 24."],
];

function validate(c: WatchdogConfig): Errors {
  const errors: Errors = {};
  const targets = c.targets.split(",").map((t) => t.trim()).filter(Boolean);
  if (!targets.length || !targets.every(isValidIp)) {
    errors.targets = "Enter one or more IPv4 targets, comma separated.";
  }
  for (const [key, min, max, message] of RANGES) {
    const v = c[key] as number;
    if (!Number.isInteger(v) || v < min || v > max) errors[key] = message;
  }
  if (c.enabled && !c.tier1Enabled && !c.tier2Enabled && !c.tier3Enabled && !c.tier4Enabled) {
    errors.tier1Enabled = "Enable at least one recovery tier.";
  }
  return errors;
}

const parseIntField = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

function NumField({
  id,
  label,
  suffix,
  value,
  onChange,
  error,
  description,
  disabled,
  scale = 1,
}: {
  id: string;
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
  description?: string;
  disabled?: boolean;
  /** Shown value = stored value / scale (minutes for seconds: 60) */
  scale?: number;
}) {
  const shown = Number.isNaN(value) ? "" : String(value / scale);
  return (
    <Field data-invalid={!!error} data-disabled={disabled}>
      <FieldLabel htmlFor={id}>
        {label}
        {suffix && <span className="text-muted-foreground font-normal">({suffix})</span>}
      </FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        className="tabular-nums"
        value={shown}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : description ? `${id}-desc` : undefined}
        onChange={(e) => {
          const v = parseIntField(e.target.value);
          onChange(Number.isNaN(v) ? v : v * scale);
        }}
      />
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : description ? (
        <FieldDescription id={`${id}-desc`}>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}

function LadderStep({
  index,
  icon,
  name,
  description,
  command,
  enabled,
  onToggle,
  caution = false,
  isLast = false,
  children,
}: {
  index: number;
  icon: React.ReactNode;
  name: string;
  description: string;
  command: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  caution?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={cn("flex gap-3", !isLast && "pb-6")}>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
            enabled
              ? "bg-secondary text-secondary-foreground border-transparent"
              : "bg-muted/40 text-muted-foreground border-border",
          )}
        >
          {index}
        </span>
        {!isLast && (
          <span
            aria-hidden
            className={cn("mt-1.5 w-px flex-1 transition-colors", enabled ? "bg-secondary" : "bg-border")}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center",
                  enabled ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {icon}
              </span>
              <span className={cn("truncate text-sm font-semibold", !enabled && "text-muted-foreground")}>
                {name}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">{description}</p>
            <code
              className={cn(
                "mt-0.5 w-fit rounded border px-1.5 py-0.5 font-mono text-[11px] leading-tight",
                caution
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {command}
            </code>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} aria-label={`Tier ${index}: ${name}`} />
        </div>
        {enabled && children && (
          <div className="mt-3 grid grid-cols-1 gap-4 @sm/card:grid-cols-2">{children}</div>
        )}
      </div>
    </li>
  );
}

export function WatchdogSettingsCard({
  config,
  isLoading,
  isSaving,
  onSave,
}: {
  config: WatchdogConfig | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (next: WatchdogConfig) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState<WatchdogConfig | null>(null);
  const [tab, setTab] = useState<Tab>("detection");
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { saved, markSaved } = useSaveFlash();

  const form = draft ?? config;
  const update = (patch: Partial<WatchdogConfig>) => form && setDraft({ ...form, ...patch });
  const errors: Errors = form && showErrors ? validate(form) : {};
  const tabHasError = (t: Tab) =>
    (Object.keys(errors) as FieldKey[]).some((k) => FIELD_TAB[k] === t);

  const handleSave = async () => {
    if (!form) return;
    const found = validate(form);
    const first = (Object.keys(found) as FieldKey[])[0];
    if (first) {
      setShowErrors(true);
      setTab(FIELD_TAB[first] ?? "detection");
      return;
    }
    setSaveError(null);
    const normalized = {
      ...form,
      targets: form.targets.split(",").map((t) => t.trim()).filter(Boolean).join(","),
    };
    const result = await onSave(normalized);
    if (result.ok) {
      markSaved();
      toast.success(normalized.enabled ? "Watchdog saved and running" : "Watchdog saved and stopped");
      setDraft(null);
      setShowErrors(false);
    } else {
      setSaveError(result.message || "Save failed");
    }
  };

  const tabLabel = (t: Tab, label: string) => (
    <TabsTrigger value={t} className="gap-1.5">
      {label}
      {tabHasError(t) && <span aria-label="Has errors" className="bg-destructive size-1.5 rounded-full" />}
    </TabsTrigger>
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Watchdog Settings</CardTitle>
        <CardDescription>
          When the connection counts as lost, and the recovery ladder that follows: from the
          gentlest step to a reboot. Takes effect as soon as it is saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !form ? (
          <div className="grid gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              {tabLabel("detection", "Detection")}
              {tabLabel("recovery", "Recovery")}
              {tabLabel("limits", "Limits")}
            </TabsList>

            <TabsContent value="detection" className="mt-5 grid gap-5">
              <Field orientation="horizontal" className="justify-between">
                <FieldLabel htmlFor="wd-enabled">Watchdog enabled</FieldLabel>
                <Switch
                  id="wd-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) => update({ enabled: v })}
                />
              </Field>
              <Field data-invalid={!!errors.targets}>
                <FieldLabel htmlFor="wd-targets">Ping targets</FieldLabel>
                <Input
                  id="wd-targets"
                  value={form.targets}
                  aria-invalid={!!errors.targets}
                  onChange={(e) => update({ targets: e.target.value })}
                />
                {errors.targets ? (
                  <FieldError>{errors.targets}</FieldError>
                ) : (
                  <FieldDescription>
                    IPv4 addresses, comma separated: a check passes when any of them answers.
                  </FieldDescription>
                )}
              </Field>
              <div className="grid grid-cols-1 gap-4 @sm/card:grid-cols-2">
                <NumField
                  id="wd-fail"
                  label="Failed checks before acting"
                  value={form.failCount}
                  error={errors.failCount}
                  onChange={(v) => update({ failCount: v })}
                />
                <NumField
                  id="wd-interval"
                  label="Check interval"
                  suffix="s"
                  value={form.checkInterval}
                  error={errors.checkInterval}
                  onChange={(v) => update({ checkInterval: v })}
                />
                <NumField
                  id="wd-timeout"
                  label="Ping timeout"
                  suffix="s"
                  value={form.pingTimeoutSec}
                  error={errors.pingTimeoutSec}
                  onChange={(v) => update({ pingTimeoutSec: v })}
                />
                <NumField
                  id="wd-grace"
                  label="Boot grace"
                  suffix="s"
                  value={form.bootGrace}
                  error={errors.bootGrace}
                  description="No recovery in the first seconds after a boot."
                  onChange={(v) => update({ bootGrace: v })}
                />
              </div>
            </TabsContent>

            <TabsContent value="recovery" className="mt-5">
              <p className="text-muted-foreground mb-4 text-xs">
                Tried in order. Each step waits its settle time for the connection to come back
                before the next one runs; disabled steps are skipped.
              </p>
              {errors.tier1Enabled && <FieldError className="mb-4">{errors.tier1Enabled}</FieldError>}
              <ol>
                <LadderStep
                  index={1}
                  icon={<RefreshCwIcon className="size-4" />}
                  name="Re-register to the network"
                  description="Detach and attach again; a manually chosen operator is kept."
                  command="AT+COPS=2 → AT+COPS=0"
                  enabled={form.tier1Enabled}
                  onToggle={(v) => update({ tier1Enabled: v })}
                >
                  <NumField
                    id="wd-t1-settle"
                    label="Settle time"
                    suffix="s"
                    value={form.tier1Settle}
                    error={errors.tier1Settle}
                    onChange={(v) => update({ tier1Settle: v })}
                  />
                </LadderStep>
                <LadderStep
                  index={2}
                  icon={<RadioIcon className="size-4" />}
                  name="Restart the radio"
                  description="RF off, then on again. The SIM stays powered."
                  command="AT+CFUN=4 → AT+CFUN=1"
                  enabled={form.tier2Enabled}
                  onToggle={(v) => update({ tier2Enabled: v })}
                >
                  <NumField
                    id="wd-t2-settle"
                    label="Settle time"
                    suffix="s"
                    value={form.tier2Settle}
                    error={errors.tier2Settle}
                    onChange={(v) => update({ tier2Settle: v })}
                  />
                  <NumField
                    id="wd-t2-attempts"
                    label="Radio restarts"
                    value={form.cfunMaxAttempts}
                    error={errors.cfunMaxAttempts}
                    description="Before moving to the next step."
                    onChange={(v) => update({ cfunMaxAttempts: v })}
                  />
                  <NumField
                    id="wd-t2-delay"
                    label="Radio off for"
                    suffix="s"
                    value={form.cfunDelay}
                    error={errors.cfunDelay}
                    onChange={(v) => update({ cfunDelay: v })}
                  />
                </LadderStep>
                <LadderStep
                  index={3}
                  icon={<ArrowLeftRightIcon className="size-4" />}
                  name="Switch to the other SIM"
                  description="Kept only when the SIM in the other slot answers READY; an empty slot is left alone for 6 hours."
                  command="AT^SWITCH_SLOT=0|1"
                  enabled={form.tier3Enabled}
                  onToggle={(v) => update({ tier3Enabled: v })}
                >
                  <NumField
                    id="wd-t3-settle"
                    label="Settle time"
                    suffix="s"
                    value={form.tier3Settle}
                    error={errors.tier3Settle}
                    onChange={(v) => update({ tier3Settle: v })}
                  />
                  <Field>
                    <FieldLabel htmlFor="wd-t3-revert">Original SIM</FieldLabel>
                    <Select
                      value={form.simRevert}
                      onValueChange={(v) => update({ simRevert: v as SimRevertPolicy })}
                    >
                      <SelectTrigger id="wd-t3-revert" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="timer">Try it again later</SelectItem>
                        <SelectItem value="never">Stay on the other SIM</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {form.simRevert === "timer"
                        ? "Back to the original SIM after a while; if it is still offline, the other SIM returns."
                        : "Until you switch back in Cellular Settings."}
                    </FieldDescription>
                  </Field>
                  {form.simRevert === "timer" && (
                    <NumField
                      id="wd-t3-revert-after"
                      label="Try the original SIM after"
                      suffix="min"
                      scale={60}
                      value={form.simRevertAfter}
                      error={errors.simRevertAfter}
                      onChange={(v) => update({ simRevertAfter: v })}
                    />
                  )}
                </LadderStep>
                <LadderStep
                  index={4}
                  icon={<PowerIcon className="size-4" />}
                  name="Reboot the modem"
                  description="The last resort, within the daily reboot limit."
                  command="reboot"
                  caution
                  isLast
                  enabled={form.tier4Enabled}
                  onToggle={(v) => update({ tier4Enabled: v })}
                />
              </ol>
            </TabsContent>

            <TabsContent value="limits" className="mt-5 grid grid-cols-1 gap-4 @sm/card:grid-cols-2">
              <NumField
                id="wd-max-hour"
                label="Recovery actions per hour"
                value={form.maxRecoveriesPerHour}
                error={errors.maxRecoveriesPerHour}
                description="Every tier counts; beyond it the watchdog only watches."
                onChange={(v) => update({ maxRecoveriesPerHour: v })}
              />
              <NumField
                id="wd-max-day"
                label="Reboots per 24 hours"
                value={form.maxRebootsPerDay}
                error={errors.maxRebootsPerDay}
                description="Counted across reboots."
                onChange={(v) => update({ maxRebootsPerDay: v })}
              />
              <NumField
                id="wd-cooldown"
                label="Cooldown between ladders"
                suffix="s"
                value={form.recoveryCooldown}
                error={errors.recoveryCooldown}
                description="After a ladder ends, before another may start."
                onChange={(v) => update({ recoveryCooldown: v })}
              />
            </TabsContent>
          </Tabs>
        )}
        {saveError && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive mt-4 rounded-md border px-3 py-2 text-sm"
          >
            {saveError}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(null);
            setShowErrors(false);
            setSaveError(null);
          }}
          disabled={!draft || isSaving}
        >
          Discard
        </Button>
        <SaveButton
          label="Save"
          isSaving={isSaving}
          saved={saved}
          disabled={!draft || isSaving}
          onClick={handleSave}
        />
      </CardFooter>
    </Card>
  );
}
