"use client";

import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import SimpleT99Icon from "@/public/simple-t99-icon.png";
import packageJson from "@/package.json";

import type { AboutDeviceData } from "@/types/about-device";

// =============================================================================
// AboutSimpleAdminCard — SimpleAdmin info, credits + network details
// =============================================================================

interface AboutSimpleAdminCardProps {
  data: AboutDeviceData | null;
  isLoading: boolean;
}

const AboutSimpleAdminCard = ({ data, isLoading }: AboutSimpleAdminCardProps) => {
  const networkRows = [
    { label: "Device IP", value: data?.network.device_ip },
    { label: "LAN Gateway", value: data?.network.lan_gateway },
    { label: "WWAN IPv4", value: data?.network.wan_ipv4 },
    { label: "WWAN IPv6", value: data?.network.wan_ipv6 },
    { label: "Public IPv4", value: data?.network.public_ipv4 },
    { label: "Public IPv6", value: data?.network.public_ipv6 },
  ];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">About Simple T99</CardTitle>
        <CardDescription>
          Management interface for the Foxconn T99W175 modem.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center">
            <Image
              src={SimpleT99Icon}
              alt="Simple T99 Logo"
              className="size-24"
              priority
            />
          </div>

          {/* Description */}
          <div className="grid gap-y-4">
            <p className="text-sm text-muted-foreground text-pretty leading-relaxed font-medium">
              Simple T99 (SimpleAdmin) runs on the modem it manages. Live
              radio data comes from the Qualcomm DIAG interface and QMI
              through two small bridges, so the dashboard costs the modem
              almost nothing while it is open.
            </p>
            <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
              This interface is based on{" "}
              <a
                href="https://github.com/dr-dolomite/QManager-RM520N"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                QManager
              </a>{" "}
              by DrDolomite, used under the MIT License with the Commons
              Clause condition: it may not be sold.
            </p>
          </div>

          {/* SimpleAdmin version */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              SimpleAdmin
            </h3>
            <dl className="grid divide-y divide-border border-y border-border">
              <div className="flex items-center justify-between py-2">
                <dt className="text-sm font-semibold text-muted-foreground">
                  Version
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {packageJson.version}
                </dd>
              </div>
            </dl>
          </div>

          {/* Network info */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Network
            </h3>
            <dl className="grid divide-y divide-border border-y border-border">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2"
                    >
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))
                : networkRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between py-2"
                    >
                      <dt className="text-sm font-semibold text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd
                        className="text-sm font-semibold tabular-nums min-w-0 truncate ml-4"
                        title={row.value || undefined}
                      >
                        {row.value || "-"}
                      </dd>
                    </div>
                  ))}
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AboutSimpleAdminCard;
