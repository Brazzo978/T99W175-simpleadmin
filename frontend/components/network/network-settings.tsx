"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertCircleIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
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
import { useNetworkSettings, type NetworkConfig } from "@/hooks/use-network-settings";
import {
  LAN_MASKS,
  dhcpRangeProblem,
  ipToNumber,
  isValidIp,
  isValidMac,
  maskPrefix,
  sameSubnet,
  subnetBounds,
  suggestDhcpRange,
} from "@/lib/ipv4";
import { atMessage } from "@/lib/at";
import { msg, translate, type Msg } from "@/lib/i18n/message";
import { rebootModem } from "@/lib/modem-actions";

const MANUAL_MAC = "__manual__";

/** A form problem: ours to translate, or the CGI's own text. */
type Problem = Msg | string;

const problemText = (t: TFunction, p: Problem) => (typeof p === "string" ? p : translate(t, p));

function validate(c: NetworkConfig): Problem[] {
  const errors: Problem[] = [];
  if (!isValidIp(c.ipAddress)) {
    errors.push(msg("network:validation.lan_ip_invalid"));
  } else {
    const { network, broadcast } = subnetBounds(c.ipAddress, c.subnetMask);
    const own = ipToNumber(c.ipAddress);
    if (own === network || own === broadcast) {
      errors.push(msg("network:validation.lan_ip_reserved"));
    }
  }
  if (c.dhcpEnabled) {
    const problem = isValidIp(c.ipAddress)
      ? dhcpRangeProblem(c.ipAddress, c.subnetMask, c.dhcpStart, c.dhcpEnd)
      : null;
    if (problem) errors.push(problem);
    const lease = Number(c.dhcpLease);
    if (!Number.isInteger(lease) || lease <= 0) {
      errors.push(msg("network:validation.lease_invalid"));
    }
  }
  if (c.dmzEnabled) {
    if (!isValidIp(c.dmzIp) || c.dmzIp === "0.0.0.0" || c.dmzIp === c.ipAddress) {
      errors.push(msg("network:validation.dmz_invalid"));
    } else if (!sameSubnet(c.ipAddress, c.dmzIp, c.subnetMask)) {
      errors.push(msg("network:validation.dmz_subnet"));
    }
  }
  if (c.bridgeEnabled && !isValidMac(c.bridgeMac)) {
    errors.push(msg("network:validation.passthrough_mac"));
  }
  return errors;
}

function Field({ label, children, htmlFor }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function NetworkSettingsComponent() {
  const { t } = useTranslation("network");
  const net = useNetworkSettings();
  const { config, ttl, clients, isLoading, isSaving } = net;

  const [draft, setDraft] = useState<NetworkConfig | null>(null);
  const [rangeEdited, setRangeEdited] = useState(false);
  const [macChoice, setMacChoice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Problem[]>([]);
  const [askRestart, setAskRestart] = useState(false);
  const [ttlValue, setTtlValue] = useState<string | null>(null);

  const form = draft ?? config;
  const dirty = useMemo(
    () => draft !== null && config !== null && JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config],
  );

  const update = (patch: Partial<NetworkConfig>) => {
    if (!form) return;
    const next = { ...form, ...patch };
    // Keep the DHCP range inside the subnet while the user has not set it.
    if (!rangeEdited && (patch.ipAddress !== undefined || patch.subnetMask !== undefined)) {
      const range = suggestDhcpRange(next.ipAddress, next.subnetMask);
      if (range) {
        next.dhcpStart = range.start;
        next.dhcpEnd = range.end;
      }
    }
    setDraft(next);
  };

  const shownMacChoice =
    macChoice ??
    (form?.bridgeMac
      ? clients.some((c) => c.mac === form.bridgeMac.toUpperCase())
        ? form.bridgeMac.toUpperCase()
        : MANUAL_MAC
      : "");

  const handleSave = async () => {
    if (!form) return;
    const problems = validate(form);
    setErrors(problems);
    if (problems.length) return;
    const result = await net.save(form);
    if (!result.ok) {
      setErrors([result.message || msg("network:errors.save_failed")]);
      return;
    }
    setDraft(null);
    setRangeEdited(false);
    setMacChoice(null);
    setAskRestart(true);
  };

  const restartNow = async () => {
    setAskRestart(false);
    const result = await rebootModem();
    if (!result.ok) {
      toast.error(atMessage(t, result) || t("errors.restart_refused"));
      return;
    }
    sessionStorage.setItem("qm_rebooting", "1");
    window.location.href = "/reboot/";
  };

  const applyTtl = async (enabled: boolean) => {
    const value = enabled ? Number(ttlValue ?? (ttl?.value || 64)) : 0;
    if (enabled && (!Number.isInteger(value) || value < 1 || value > 255)) {
      toast.error(t("ttl.out_of_range"));
      return;
    }
    const result = await net.setTtlValue(value);
    if (result.ok) {
      toast.success(enabled ? t("ttl.set", { value }) : t("ttl.disabled"));
      setTtlValue(null);
    } else toast.error(result.message);
  };

  if (isLoading || !form) {
    return (
      <PageShell title={t("page.title")} description={t("page.description_short")}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </PageShell>
    );
  }

  return (
    <PageShell title={t("page.title")} description={t("page.description")}>
      <Card>
        <CardHeader>
          <CardTitle>LAN</CardTitle>
          <CardDescription>{t("lan.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 @md/main:grid-cols-2">
          <Field label={t("lan.ip_address")} htmlFor="lan-ip">
            <Input
              id="lan-ip"
              value={form.ipAddress}
              aria-invalid={!isValidIp(form.ipAddress)}
              onChange={(e) => update({ ipAddress: e.target.value })}
            />
          </Field>
          <Field label={t("lan.subnet_mask")}>
            <Select value={form.subnetMask} onValueChange={(v) => update({ subnetMask: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAN_MASKS.map((mask) => (
                  <SelectItem key={mask} value={mask}>
                    /{maskPrefix(mask)} ({mask})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dhcp.title")}</CardTitle>
          <CardDescription>{t("dhcp.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="dhcp"
            label={t("enabled")}
            checked={form.dhcpEnabled}
            disabled={form.bridgeEnabled}
            onChange={(v) => update({ dhcpEnabled: v })}
          />
          {form.dhcpEnabled && (
            <div className="grid gap-4 @md/main:grid-cols-3">
              <Field label={t("dhcp.range_start")} htmlFor="dhcp-start">
                <Input
                  id="dhcp-start"
                  value={form.dhcpStart}
                  onChange={(e) => {
                    setRangeEdited(true);
                    update({ dhcpStart: e.target.value });
                  }}
                />
              </Field>
              <Field label={t("dhcp.range_end")} htmlFor="dhcp-end">
                <Input
                  id="dhcp-end"
                  value={form.dhcpEnd}
                  onChange={(e) => {
                    setRangeEdited(true);
                    update({ dhcpEnd: e.target.value });
                  }}
                />
              </Field>
              <Field label={t("dhcp.lease")} htmlFor="dhcp-lease">
                <Input
                  id="dhcp-lease"
                  inputMode="numeric"
                  value={form.dhcpLease}
                  onChange={(e) => update({ dhcpLease: e.target.value })}
                />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("passthrough.title")}</CardTitle>
          <CardDescription>{t("passthrough.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="bridge"
            label={t("enabled")}
            checked={form.bridgeEnabled}
            onChange={(v) =>
              update(v ? { bridgeEnabled: true, dhcpEnabled: true } : { bridgeEnabled: false, bridgeMac: "" })
            }
          />
          {form.bridgeEnabled && (
            <div className="grid gap-4 @md/main:grid-cols-2">
              <Field label={t("passthrough.client")}>
                <Select
                  value={shownMacChoice}
                  onValueChange={(v) => {
                    setMacChoice(v);
                    if (v !== MANUAL_MAC) update({ bridgeMac: v });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("passthrough.choose_device")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.mac} value={c.mac}>
                        {c.mac} ({c.ips.join(", ")})
                      </SelectItem>
                    ))}
                    <SelectItem value={MANUAL_MAC}>{t("passthrough.other_mac")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {shownMacChoice === MANUAL_MAC && (
                <Field label={t("passthrough.mac_address")} htmlFor="bridge-mac">
                  <Input
                    id="bridge-mac"
                    placeholder="AA:BB:CC:DD:EE:FF"
                    value={form.bridgeMac}
                    aria-invalid={form.bridgeMac !== "" && !isValidMac(form.bridgeMac)}
                    onChange={(e) => update({ bridgeMac: e.target.value })}
                  />
                </Field>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DMZ</CardTitle>
          <CardDescription>{t("dmz.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="dmz"
            label={t("enabled")}
            checked={form.dmzEnabled}
            onChange={(v) => update({ dmzEnabled: v, dmzIp: v ? form.dmzIp : "" })}
          />
          {form.dmzEnabled && (
            <Field label={t("dmz.host_ip")} htmlFor="dmz-ip">
              <Input id="dmz-ip" value={form.dmzIp} onChange={(e) => update({ dmzIp: e.target.value })} />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("mobile.title")}</CardTitle>
          <CardDescription>{t("mobile.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="autoconnect"
            label={t("mobile.auto_connect")}
            checked={form.autoConnect}
            onChange={(v) => update({ autoConnect: v })}
          />
          <SwitchRow
            id="roaming"
            label={t("mobile.roaming")}
            checked={form.roamingEnabled}
            onChange={(v) => update({ roamingEnabled: v })}
          />
          <SwitchRow
            id="ipv6"
            label="IPv6"
            checked={form.ipv6Enabled}
            onChange={(v) => update({ ipv6Enabled: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("ttl.title")}</CardTitle>
          <CardDescription>{t("ttl.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="ttl"
            label={t("enabled")}
            checked={ttl?.enabled ?? false}
            disabled={isSaving}
            onChange={(v) => applyTtl(v)}
          />
          <Field label={t("ttl.value")} htmlFor="ttl-value">
            <Input
              id="ttl-value"
              inputMode="numeric"
              value={ttlValue ?? String(ttl?.enabled ? ttl.value : 64)}
              onChange={(e) => setTtlValue(e.target.value)}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => applyTtl(true)}
            disabled={isSaving || ttlValue === null}
          >
            {t("ttl.apply")}
          </Button>
        </CardFooter>
      </Card>

      <div className="col-span-full flex flex-col gap-3">
        {errors.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <ul className="grid gap-1">
              {errors.map((e) => {
                const text = problemText(t, e);
                return <li key={text}>{text}</li>;
              })}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!dirty || isSaving}>
            <SaveIcon />
            {t("actions.save")}
          </Button>
          <Button
            variant="outline"
            disabled={!dirty || isSaving}
            onClick={() => {
              setDraft(null);
              setErrors([]);
              setRangeEdited(false);
              setMacChoice(null);
            }}
          >
            <RotateCcwIcon />
            {t("actions.discard")}
          </Button>
        </div>
      </div>

      <AlertDialog open={askRestart} onOpenChange={setAskRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("restart_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("restart_dialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("restart_dialog.later")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={restartNow}>
              {t("restart_dialog.restart")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
