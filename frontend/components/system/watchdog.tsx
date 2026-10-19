"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
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
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";
import { Skeleton } from "@/components/ui/skeleton";
import { WatchdogActivityCard, WatchdogStatusCard } from "@/components/system/watchdog-activity";
import { WatchdogSettingsCard } from "@/components/system/watchdog-settings-card";
import {
  useConnectionChecks,
  useWatchdog,
  useWatchdogEvents,
  useWatchdogLog,
  type ConnectionChecks,
} from "@/hooks/use-watchdog";
import ConnectivityStatusCard from "./connectivity-status";
import LatencyHistoryCard from "./latency-history";

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  description,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  description?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {suffix && <span className="text-muted-foreground font-normal">({suffix})</span>}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        className="tabular-nums"
        value={Number.isNaN(value) ? "" : String(value)}
        aria-describedby={description ? `${id}-desc` : undefined}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
      />
      {description && (
        <p id={`${id}-desc`} className="text-muted-foreground text-sm">
          {description}
        </p>
      )}
    </div>
  );
}

/** Same rule as cgi-bin/set_connection_config. */
const PROBE_URL = /^http:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/?=%-]*)?$/;

/** The first problem in the form, as a key of the monitoring namespace. */
function validateChecks(c: ConnectionChecks): string | null {
  const url = c.httpProbe.trim();
  if (url && !PROBE_URL.test(url)) return "checks.errors.http_probe";
  if (!Number.isInteger(c.httpProbeTimeout) || c.httpProbeTimeout < 1 || c.httpProbeTimeout > 9)
    return "checks.errors.probe_timeout";
  const bg = c.bgCheckInterval;
  if (!Number.isInteger(bg) || bg < 10 || bg > 600 || bg % 10) return "checks.errors.bg_interval";
  return null;
}

function ConnectionChecksCard() {
  const { t } = useTranslation("monitoring");
  const { checks, isSaving, save } = useConnectionChecks();
  const [draft, setDraft] = useState<ConnectionChecks | null>(null);
  const { saved, markSaved } = useSaveFlash();
  const form = draft ?? checks;

  const handleSave = async () => {
    if (!form) return;
    const problem = validateChecks(form);
    if (problem) {
      toast.error(t(problem));
      return;
    }
    const result = await save({ ...form, httpProbe: form.httpProbe.trim() });
    if (result.ok) {
      markSaved();
      toast.success(t("checks.saved"));
      setDraft(null);
    } else toast.error(result.message);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("checks.title")}</CardTitle>
        <CardDescription>{t("checks.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!form ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="chk-ping">{t("checks.ping_targets")}</Label>
              <Input
                id="chk-ping"
                value={form.pingTargets}
                onChange={(e) => setDraft({ ...form, pingTargets: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chk-dns">{t("checks.dns_tests")}</Label>
              <Input
                id="chk-dns"
                value={form.dnsTests}
                onChange={(e) => setDraft({ ...form, dnsTests: e.target.value })}
              />
            </div>
            <div className="grid gap-4 @md/main:grid-cols-[1fr_10rem]">
              <div className="grid gap-2">
                <Label htmlFor="chk-http">{t("checks.http_probe")}</Label>
                <Input
                  id="chk-http"
                  placeholder={t("checks.http_probe_placeholder")}
                  value={form.httpProbe}
                  onChange={(e) => setDraft({ ...form, httpProbe: e.target.value })}
                />
              </div>
              <NumberField
                id="chk-http-timeout"
                label={t("checks.probe_timeout")}
                suffix="s"
                value={form.httpProbeTimeout}
                onChange={(v) => setDraft({ ...form, httpProbeTimeout: v })}
              />
            </div>
            <NumberField
              id="chk-bg-interval"
              label={t("checks.bg_interval")}
              suffix="s"
              description={t("checks.bg_interval_hint")}
              value={form.bgCheckInterval}
              onChange={(v) => setDraft({ ...form, bgCheckInterval: v })}
            />
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end">
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

export default function WatchdogComponent() {
  const { t } = useTranslation("monitoring");
  const wd = useWatchdog();
  const activity = useWatchdogEvents(true);
  const log = useWatchdogLog(true);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.text]);

  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
    >
      <ConnectivityStatusCard />

      <ConnectionChecksCard />
      <WatchdogStatusCard config={wd.config} runtime={activity.runtime} error={activity.error} />

      <LatencyHistoryCard />
      <WatchdogSettingsCard
        config={wd.config}
        isLoading={wd.isLoading}
        isSaving={wd.isSaving}
        onSave={async (next) => {
          const result = await wd.save(next);
          if (result.ok) activity.refresh();
          return result;
        }}
      />
      <WatchdogActivityCard
        runtime={activity.runtime}
        error={activity.error}
        isRefreshing={activity.isRefreshing}
        onRefresh={activity.refresh}
      />

      <Card className="@3xl/main:col-span-2">
        <CardHeader>
          <CardTitle>{t("log.title")}</CardTitle>
          <CardDescription>{t("log.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {log.error ? (
            <p className="text-destructive text-sm">{log.error}</p>
          ) : (
            <pre
              ref={logRef}
              className="bg-muted h-[28rem] overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {log.text || t("log.empty")}
            </pre>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
