"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
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
        value={Number.isNaN(value) ? "" : String(value)}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
      />
    </div>
  );
}

/** Same rule as cgi-bin/set_connection_config. */
const PROBE_URL = /^http:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/?=%-]*)?$/;

function validateChecks(c: ConnectionChecks): string | null {
  const url = c.httpProbe.trim();
  if (url && !PROBE_URL.test(url))
    return "Captive portal probe: an http:// URL (letters, digits and . _ ~ / ? = % - only), or empty to disable it.";
  if (!Number.isInteger(c.httpProbeTimeout) || c.httpProbeTimeout < 1 || c.httpProbeTimeout > 9)
    return "Probe timeout: 1 to 9 seconds.";
  return null;
}

function ConnectionChecksCard() {
  const { checks, isSaving, save } = useConnectionChecks();
  const [draft, setDraft] = useState<ConnectionChecks | null>(null);
  const { saved, markSaved } = useSaveFlash();
  const form = draft ?? checks;

  const handleSave = async () => {
    if (!form) return;
    const problem = validateChecks(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    const result = await save({ ...form, httpProbe: form.httpProbe.trim() });
    if (result.ok) {
      markSaved();
      toast.success("Connectivity checks saved");
      setDraft(null);
    } else toast.error(result.message);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectivity Checks</CardTitle>
        <CardDescription>
          What the dashboard&apos;s internet status tests: pings, DNS lookups
          written as server:domain, and an http:// URL that must answer 204
          No Content (anything else means a captive portal; empty disables it).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!form ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="chk-ping">Ping targets</Label>
              <Input
                id="chk-ping"
                value={form.pingTargets}
                onChange={(e) => setDraft({ ...form, pingTargets: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="chk-dns">DNS tests</Label>
              <Input
                id="chk-dns"
                value={form.dnsTests}
                onChange={(e) => setDraft({ ...form, dnsTests: e.target.value })}
              />
            </div>
            <div className="grid gap-4 @md/main:grid-cols-[1fr_10rem]">
              <div className="grid gap-2">
                <Label htmlFor="chk-http">Captive portal probe</Label>
                <Input
                  id="chk-http"
                  placeholder="Disabled"
                  value={form.httpProbe}
                  onChange={(e) => setDraft({ ...form, httpProbe: e.target.value })}
                />
              </div>
              <NumberField
                id="chk-http-timeout"
                label="Probe timeout"
                suffix="s"
                value={form.httpProbeTimeout}
                onChange={(v) => setDraft({ ...form, httpProbeTimeout: v })}
              />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end">
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

export default function WatchdogComponent() {
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
      title="Connection Monitoring"
      description="How the connection is tested, and how the watchdog brings it back: re-registration, radio restart, the other SIM, reboot."
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
          <CardTitle>Watchdog Log</CardTitle>
          <CardDescription>/tmp/connection-watchdog.log, refreshed every 3 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          {log.error ? (
            <p className="text-destructive text-sm">{log.error}</p>
          ) : (
            <pre
              ref={logRef}
              className="bg-muted h-[28rem] overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {log.text || "The log is empty."}
            </pre>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
