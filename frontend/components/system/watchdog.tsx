"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, SaveIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useConnectionChecks,
  useWatchdog,
  useWatchdogLog,
  type ConnectionChecks,
  type WatchdogConfig,
} from "@/hooks/use-watchdog";
import { isValidIp } from "@/lib/ipv4";

function validate(c: WatchdogConfig): string | null {
  const targets = c.targets.split(",").map((t) => t.trim()).filter(Boolean);
  if (!targets.length || !targets.every(isValidIp)) return "Enter one or more IPv4 targets, comma separated.";
  const inRange = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  if (!inRange(c.failCount, 1, 120)) return "Failures before acting: 1 to 120.";
  if (!inRange(c.checkInterval, 1, 60)) return "Check interval: 1 to 60 seconds.";
  if (!inRange(c.pingTimeoutSec, 1, 60)) return "Ping timeout: 1 to 60 seconds.";
  if (c.action === "cfun" && !inRange(c.cfunMaxAttempts, 1, 120)) return "Radio restarts before rebooting: 1 to 120.";
  if (!inRange(c.bootGrace, 0, 3600)) return "Boot grace: 0 to 3600 seconds.";
  return null;
}

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

function ConnectionChecksCard() {
  const { checks, isSaving, save } = useConnectionChecks();
  const [draft, setDraft] = useState<ConnectionChecks | null>(null);
  const form = draft ?? checks;

  const handleSave = async () => {
    if (!form) return;
    const result = await save(form);
    if (result.ok) {
      toast.success("Connectivity checks saved");
      setDraft(null);
    } else toast.error(result.message);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectivity Checks</CardTitle>
        <CardDescription>
          What the dashboard&apos;s internet status tests: pings, and DNS lookups
          written as server:domain.
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
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={!draft || isSaving}>
          <SaveIcon />
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function WatchdogComponent() {
  const wd = useWatchdog();
  const log = useWatchdogLog(true);
  const [draft, setDraft] = useState<WatchdogConfig | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const form = draft ?? wd.config;
  const update = (patch: Partial<WatchdogConfig>) => form && setDraft({ ...form, ...patch });

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.text]);

  const handleSave = async () => {
    if (!form) return;
    const error = validate(form);
    setProblem(error);
    if (error) return;
    const normalized = {
      ...form,
      targets: form.targets.split(",").map((t) => t.trim()).filter(Boolean).join(","),
    };
    const result = await wd.save(normalized);
    if (result.ok) {
      toast.success(normalized.enabled ? "Watchdog saved and enabled" : "Watchdog disabled");
      setDraft(null);
    } else setProblem(result.message || "Save failed");
  };

  return (
    <PageShell
      title="Connection Monitoring"
      description="How the connection is tested, and what the watchdog does when it fails: restart the radio or the modem."
    >
      <ConnectionChecksCard />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Watchdog</CardTitle>
              <CardDescription>Takes effect as soon as it is saved.</CardDescription>
            </div>
            {wd.config && (
              <Badge
                variant="outline"
                className={
                  wd.config.enabled
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-muted text-muted-foreground"
                }
              >
                {wd.config.enabled ? "Running" : "Disabled"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {wd.isLoading || !form ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="wd-enabled">Enabled</Label>
                <Switch
                  id="wd-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) => update({ enabled: v })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wd-targets">Targets</Label>
                <Input
                  id="wd-targets"
                  value={form.targets}
                  onChange={(e) => update({ targets: e.target.value })}
                />
              </div>
              <div className="grid gap-4 @md/main:grid-cols-2">
                <NumberField id="wd-fail" label="Failures before acting" value={form.failCount} onChange={(v) => update({ failCount: v })} />
                <NumberField id="wd-interval" label="Check interval" suffix="s" value={form.checkInterval} onChange={(v) => update({ checkInterval: v })} />
                <NumberField id="wd-timeout" label="Ping timeout" suffix="s" value={form.pingTimeoutSec} onChange={(v) => update({ pingTimeoutSec: v })} />
                <NumberField id="wd-grace" label="Boot grace" suffix="s" value={form.bootGrace} onChange={(v) => update({ bootGrace: v })} />
              </div>
              <div className="grid gap-2">
                <Label>Action</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={form.action}
                  onValueChange={(v) => v && update({ action: v as WatchdogConfig["action"] })}
                  className="justify-start"
                >
                  <ToggleGroupItem value="cfun" className="px-4">Restart radio</ToggleGroupItem>
                  <ToggleGroupItem value="reboot" className="px-4">Reboot modem</ToggleGroupItem>
                </ToggleGroup>
              </div>
              {form.action === "cfun" && (
                <NumberField
                  id="wd-cfun"
                  label="Radio restarts before rebooting"
                  value={form.cfunMaxAttempts}
                  onChange={(v) => update({ cfunMaxAttempts: v })}
                />
              )}
              {problem && (
                <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircleIcon className="size-4 shrink-0" />
                  {problem}
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={!draft || wd.isSaving}>
            <SaveIcon />
            Save
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Watchdog Log</CardTitle>
          <CardDescription>/tmp/connection-watchdog.log, refreshed every 3 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          {log.error ? (
            <p className="text-sm text-destructive">{log.error}</p>
          ) : (
            <pre
              ref={logRef}
              className="h-[28rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            >
              {log.text || "The log is empty."}
            </pre>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
