"use client";

import { useState } from "react";
import type { TFunction } from "i18next";
import { PowerIcon, RadioIcon, RefreshCwIcon, ArrowLeftRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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

// The message of each range is a key of the monitoring namespace.
const RANGES: [FieldKey, number, number, string][] = [
  ["failCount", 1, 120, "settings.errors.fail_count"],
  ["checkInterval", 1, 60, "settings.errors.check_interval"],
  ["pingTimeoutSec", 1, 60, "settings.errors.ping_timeout"],
  ["bootGrace", 0, 3600, "settings.errors.boot_grace"],
  ["tier1Settle", 10, 600, "settings.errors.settle_10_600"],
  ["tier2Settle", 10, 600, "settings.errors.settle_10_600"],
  ["cfunDelay", 1, 120, "settings.errors.cfun_delay"],
  ["cfunMaxAttempts", 1, 120, "settings.errors.cfun_attempts"],
  ["tier3Settle", 30, 900, "settings.errors.settle_30_900"],
  ["simRevertAfter", 300, 86400, "settings.errors.revert_after"],
  ["recoveryCooldown", 0, 3600, "settings.errors.cooldown"],
  ["maxRecoveriesPerHour", 1, 60, "settings.errors.max_hour"],
  ["maxRebootsPerDay", 1, 24, "settings.errors.max_day"],
];

function validate(c: WatchdogConfig, t: TFunction): Errors {
  const errors: Errors = {};
  const targets = c.targets.split(",").map((s) => s.trim()).filter(Boolean);
  if (!targets.length || !targets.every(isValidIp)) {
    errors.targets = t("settings.errors.targets");
  }
  for (const [key, min, max, message] of RANGES) {
    const v = c[key] as number;
    if (!Number.isInteger(v) || v < min || v > max) errors[key] = t(message);
  }
  if (c.enabled && !c.tier1Enabled && !c.tier2Enabled && !c.tier3Enabled && !c.tier4Enabled) {
    errors.tier1Enabled = t("settings.errors.no_tier");
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
  const { t } = useTranslation("monitoring");
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
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={t("settings.tier_aria", { index, name })}
          />
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
  const { t } = useTranslation("monitoring");
  const [draft, setDraft] = useState<WatchdogConfig | null>(null);
  const [tab, setTab] = useState<Tab>("detection");
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { saved, markSaved } = useSaveFlash();

  const form = draft ?? config;
  const update = (patch: Partial<WatchdogConfig>) => form && setDraft({ ...form, ...patch });
  const errors: Errors = form && showErrors ? validate(form, t) : {};
  const tabHasError = (tabId: Tab) =>
    (Object.keys(errors) as FieldKey[]).some((k) => FIELD_TAB[k] === tabId);

  const handleSave = async () => {
    if (!form) return;
    const found = validate(form, t);
    const first = (Object.keys(found) as FieldKey[])[0];
    if (first) {
      setShowErrors(true);
      setTab(FIELD_TAB[first] ?? "detection");
      return;
    }
    setSaveError(null);
    const normalized = {
      ...form,
      targets: form.targets.split(",").map((s) => s.trim()).filter(Boolean).join(","),
    };
    const result = await onSave(normalized);
    if (result.ok) {
      markSaved();
      toast.success(normalized.enabled ? t("settings.saved_running") : t("settings.saved_stopped"));
      setDraft(null);
      setShowErrors(false);
    } else {
      setSaveError(result.message || t("errors.save_failed"));
    }
  };

  const tabLabel = (tabId: Tab, label: string) => (
    <TabsTrigger value={tabId} className="gap-1.5">
      {label}
      {tabHasError(tabId) && (
        <span aria-label={t("settings.has_errors")} className="bg-destructive size-1.5 rounded-full" />
      )}
    </TabsTrigger>
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("settings.title")}</CardTitle>
        <CardDescription>{t("settings.description")}</CardDescription>
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
              {tabLabel("detection", t("settings.tabs.detection"))}
              {tabLabel("recovery", t("settings.tabs.recovery"))}
              {tabLabel("limits", t("settings.tabs.limits"))}
            </TabsList>

            <TabsContent value="detection" className="mt-5 grid gap-5">
              <Field orientation="horizontal" className="justify-between">
                <FieldLabel htmlFor="wd-enabled">{t("settings.enabled")}</FieldLabel>
                <Switch
                  id="wd-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) => update({ enabled: v })}
                />
              </Field>
              <Field data-invalid={!!errors.targets}>
                <FieldLabel htmlFor="wd-targets">{t("settings.targets")}</FieldLabel>
                <Input
                  id="wd-targets"
                  value={form.targets}
                  aria-invalid={!!errors.targets}
                  onChange={(e) => update({ targets: e.target.value })}
                />
                {errors.targets ? (
                  <FieldError>{errors.targets}</FieldError>
                ) : (
                  <FieldDescription>{t("settings.targets_hint")}</FieldDescription>
                )}
              </Field>
              <div className="grid grid-cols-1 gap-4 @sm/card:grid-cols-2">
                <NumField
                  id="wd-fail"
                  label={t("settings.fail_count")}
                  value={form.failCount}
                  error={errors.failCount}
                  onChange={(v) => update({ failCount: v })}
                />
                <NumField
                  id="wd-interval"
                  label={t("settings.check_interval")}
                  suffix="s"
                  value={form.checkInterval}
                  error={errors.checkInterval}
                  onChange={(v) => update({ checkInterval: v })}
                />
                <NumField
                  id="wd-timeout"
                  label={t("settings.ping_timeout")}
                  suffix="s"
                  value={form.pingTimeoutSec}
                  error={errors.pingTimeoutSec}
                  onChange={(v) => update({ pingTimeoutSec: v })}
                />
                <NumField
                  id="wd-grace"
                  label={t("settings.boot_grace")}
                  suffix="s"
                  value={form.bootGrace}
                  error={errors.bootGrace}
                  description={t("settings.boot_grace_hint")}
                  onChange={(v) => update({ bootGrace: v })}
                />
              </div>
            </TabsContent>

            <TabsContent value="recovery" className="mt-5">
              <p className="text-muted-foreground mb-4 text-xs">{t("settings.recovery_intro")}</p>
              {errors.tier1Enabled && <FieldError className="mb-4">{errors.tier1Enabled}</FieldError>}
              <ol>
                <LadderStep
                  index={1}
                  icon={<RefreshCwIcon className="size-4" />}
                  name={t("settings.tier1.name")}
                  description={t("settings.tier1.description")}
                  command="AT+COPS=2 → AT+COPS=0"
                  enabled={form.tier1Enabled}
                  onToggle={(v) => update({ tier1Enabled: v })}
                >
                  <NumField
                    id="wd-t1-settle"
                    label={t("settings.settle_time")}
                    suffix="s"
                    value={form.tier1Settle}
                    error={errors.tier1Settle}
                    onChange={(v) => update({ tier1Settle: v })}
                  />
                </LadderStep>
                <LadderStep
                  index={2}
                  icon={<RadioIcon className="size-4" />}
                  name={t("settings.tier2.name")}
                  description={t("settings.tier2.description")}
                  command="AT+CFUN=4 → AT+CFUN=1"
                  enabled={form.tier2Enabled}
                  onToggle={(v) => update({ tier2Enabled: v })}
                >
                  <NumField
                    id="wd-t2-settle"
                    label={t("settings.settle_time")}
                    suffix="s"
                    value={form.tier2Settle}
                    error={errors.tier2Settle}
                    onChange={(v) => update({ tier2Settle: v })}
                  />
                  <NumField
                    id="wd-t2-attempts"
                    label={t("settings.tier2.attempts")}
                    value={form.cfunMaxAttempts}
                    error={errors.cfunMaxAttempts}
                    description={t("settings.tier2.attempts_hint")}
                    onChange={(v) => update({ cfunMaxAttempts: v })}
                  />
                  <NumField
                    id="wd-t2-delay"
                    label={t("settings.tier2.delay")}
                    suffix="s"
                    value={form.cfunDelay}
                    error={errors.cfunDelay}
                    onChange={(v) => update({ cfunDelay: v })}
                  />
                </LadderStep>
                <LadderStep
                  index={3}
                  icon={<ArrowLeftRightIcon className="size-4" />}
                  name={t("settings.tier3.name")}
                  description={t("settings.tier3.description")}
                  command="AT^SWITCH_SLOT=0|1"
                  enabled={form.tier3Enabled}
                  onToggle={(v) => update({ tier3Enabled: v })}
                >
                  <NumField
                    id="wd-t3-settle"
                    label={t("settings.settle_time")}
                    suffix="s"
                    value={form.tier3Settle}
                    error={errors.tier3Settle}
                    onChange={(v) => update({ tier3Settle: v })}
                  />
                  <Field>
                    <FieldLabel htmlFor="wd-t3-revert">{t("settings.tier3.original_sim")}</FieldLabel>
                    <Select
                      value={form.simRevert}
                      onValueChange={(v) => update({ simRevert: v as SimRevertPolicy })}
                    >
                      <SelectTrigger id="wd-t3-revert" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="timer">{t("settings.tier3.revert_timer")}</SelectItem>
                        <SelectItem value="never">{t("settings.tier3.revert_never")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {form.simRevert === "timer"
                        ? t("settings.tier3.revert_timer_hint")
                        : t("settings.tier3.revert_never_hint")}
                    </FieldDescription>
                  </Field>
                  {form.simRevert === "timer" && (
                    <NumField
                      id="wd-t3-revert-after"
                      label={t("settings.tier3.revert_after")}
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
                  name={t("settings.tier4.name")}
                  description={t("settings.tier4.description")}
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
                label={t("settings.max_hour")}
                value={form.maxRecoveriesPerHour}
                error={errors.maxRecoveriesPerHour}
                description={t("settings.max_hour_hint")}
                onChange={(v) => update({ maxRecoveriesPerHour: v })}
              />
              <NumField
                id="wd-max-day"
                label={t("settings.max_day")}
                value={form.maxRebootsPerDay}
                error={errors.maxRebootsPerDay}
                description={t("settings.max_day_hint")}
                onChange={(v) => update({ maxRebootsPerDay: v })}
              />
              <NumField
                id="wd-cooldown"
                label={t("settings.cooldown")}
                suffix="s"
                value={form.recoveryCooldown}
                error={errors.recoveryCooldown}
                description={t("settings.cooldown_hint")}
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
          {t("settings.discard")}
        </Button>
        <SaveButton
          label={t("common:actions.save")}
          isSaving={isSaving}
          saved={saved}
          disabled={!draft || isSaving}
          onClick={handleSave}
        />
      </CardFooter>
    </Card>
  );
}
