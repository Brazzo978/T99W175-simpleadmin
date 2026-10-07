"use client";

import { useMemo, useState } from "react";
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
import { rebootModem } from "@/lib/modem-actions";

const MANUAL_MAC = "__manual__";

function validate(c: NetworkConfig): string[] {
  const errors: string[] = [];
  if (!isValidIp(c.ipAddress)) {
    errors.push("Enter a valid LAN IP address.");
  } else {
    const { network, broadcast } = subnetBounds(c.ipAddress, c.subnetMask);
    const own = ipToNumber(c.ipAddress);
    if (own === network || own === broadcast) {
      errors.push("The LAN IP cannot be the network or broadcast address of its subnet.");
    }
  }
  if (c.dhcpEnabled) {
    const problem = isValidIp(c.ipAddress)
      ? dhcpRangeProblem(c.ipAddress, c.subnetMask, c.dhcpStart, c.dhcpEnd)
      : null;
    if (problem) errors.push(problem);
    const lease = Number(c.dhcpLease);
    if (!Number.isInteger(lease) || lease <= 0) {
      errors.push("The lease time must be a positive number of seconds.");
    }
  }
  if (c.dmzEnabled) {
    if (!isValidIp(c.dmzIp) || c.dmzIp === "0.0.0.0" || c.dmzIp === c.ipAddress) {
      errors.push("Enter a valid DMZ host, other than the modem.");
    } else if (!sameSubnet(c.ipAddress, c.dmzIp, c.subnetMask)) {
      errors.push("The DMZ host must be in the LAN subnet.");
    }
  }
  if (c.bridgeEnabled && !isValidMac(c.bridgeMac)) {
    errors.push("IP passthrough needs the client MAC (AA:BB:CC:DD:EE:FF).");
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
  const net = useNetworkSettings();
  const { config, ttl, clients, isLoading, isSaving } = net;

  const [draft, setDraft] = useState<NetworkConfig | null>(null);
  const [rangeEdited, setRangeEdited] = useState(false);
  const [macChoice, setMacChoice] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
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
      setErrors([result.message || "Save failed"]);
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
      toast.error(result.message || "Restart refused");
      return;
    }
    sessionStorage.setItem("qm_rebooting", "1");
    window.location.href = "/reboot/";
  };

  const applyTtl = async (enabled: boolean) => {
    const value = enabled ? Number(ttlValue ?? (ttl?.value || 64)) : 0;
    if (enabled && (!Number.isInteger(value) || value < 1 || value > 255)) {
      toast.error("TTL must be between 1 and 255");
      return;
    }
    const result = await net.setTtlValue(value);
    if (result.ok) {
      toast.success(enabled ? `TTL override set to ${value}` : "TTL override disabled");
      setTtlValue(null);
    } else toast.error(result.message);
  };

  if (isLoading || !form) {
    return (
      <PageShell title="Local Network" description="LAN addressing, DHCP, DMZ, IP passthrough and TTL.">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Local Network"
      description="LAN addressing, DHCP, DMZ, IP passthrough and TTL. Network changes take effect after a modem restart."
    >
      <Card>
        <CardHeader>
          <CardTitle>LAN</CardTitle>
          <CardDescription>Address of the modem on the local network.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 @md/main:grid-cols-2">
          <Field label="IP address" htmlFor="lan-ip">
            <Input
              id="lan-ip"
              value={form.ipAddress}
              aria-invalid={!isValidIp(form.ipAddress)}
              onChange={(e) => update({ ipAddress: e.target.value })}
            />
          </Field>
          <Field label="Subnet mask">
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
          <CardTitle>DHCP Server</CardTitle>
          <CardDescription>Addresses handed out to LAN clients.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="dhcp"
            label="Enabled"
            checked={form.dhcpEnabled}
            disabled={form.bridgeEnabled}
            onChange={(v) => update({ dhcpEnabled: v })}
          />
          {form.dhcpEnabled && (
            <div className="grid gap-4 @md/main:grid-cols-3">
              <Field label="Range start" htmlFor="dhcp-start">
                <Input
                  id="dhcp-start"
                  value={form.dhcpStart}
                  onChange={(e) => {
                    setRangeEdited(true);
                    update({ dhcpStart: e.target.value });
                  }}
                />
              </Field>
              <Field label="Range end" htmlFor="dhcp-end">
                <Input
                  id="dhcp-end"
                  value={form.dhcpEnd}
                  onChange={(e) => {
                    setRangeEdited(true);
                    update({ dhcpEnd: e.target.value });
                  }}
                />
              </Field>
              <Field label="Lease (seconds)" htmlFor="dhcp-lease">
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
          <CardTitle>IP Passthrough</CardTitle>
          <CardDescription>
            Hands the mobile WAN address to one LAN device (bridge mode). The
            device must use DHCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="bridge"
            label="Enabled"
            checked={form.bridgeEnabled}
            onChange={(v) =>
              update(v ? { bridgeEnabled: true, dhcpEnabled: true } : { bridgeEnabled: false, bridgeMac: "" })
            }
          />
          {form.bridgeEnabled && (
            <div className="grid gap-4 @md/main:grid-cols-2">
              <Field label="Client">
                <Select
                  value={shownMacChoice}
                  onValueChange={(v) => {
                    setMacChoice(v);
                    if (v !== MANUAL_MAC) update({ bridgeMac: v });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.mac} value={c.mac}>
                        {c.mac} ({c.ips.join(", ")})
                      </SelectItem>
                    ))}
                    <SelectItem value={MANUAL_MAC}>Other MAC address…</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {shownMacChoice === MANUAL_MAC && (
                <Field label="MAC address" htmlFor="bridge-mac">
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
          <CardDescription>Forwards every unsolicited inbound connection to one LAN host.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="dmz"
            label="Enabled"
            checked={form.dmzEnabled}
            onChange={(v) => update({ dmzEnabled: v, dmzIp: v ? form.dmzIp : "" })}
          />
          {form.dmzEnabled && (
            <Field label="Host IP" htmlFor="dmz-ip">
              <Input id="dmz-ip" value={form.dmzIp} onChange={(e) => update({ dmzIp: e.target.value })} />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mobile Connection</CardTitle>
          <CardDescription>How the modem brings up the data connection.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="autoconnect"
            label="Connect automatically"
            checked={form.autoConnect}
            onChange={(v) => update({ autoConnect: v })}
          />
          <SwitchRow
            id="roaming"
            label="Allow roaming"
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
          <CardTitle>TTL Override</CardTitle>
          <CardDescription>
            Rewrites the IPv4 TTL of outgoing packets. Applied at once, no restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SwitchRow
            id="ttl"
            label="Enabled"
            checked={ttl?.enabled ?? false}
            disabled={isSaving}
            onChange={(v) => applyTtl(v)}
          />
          <Field label="TTL value" htmlFor="ttl-value">
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
            Apply TTL
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
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!dirty || isSaving}>
            <SaveIcon />
            Save Network Settings
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
            Discard Changes
          </Button>
        </div>
      </div>

      <AlertDialog open={askRestart} onOpenChange={setAskRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settings saved. Restart now?</AlertDialogTitle>
            <AlertDialogDescription>
              The new network settings take effect after a modem restart. LAN
              clients may need to renew their address afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Later</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={restartNow}>
              Restart Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
