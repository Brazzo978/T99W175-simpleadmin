"use client";

import Image from "next/image";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation("about");
  const networkRows = [
    { label: t("simpleadmin.rows.device_ip"), value: data?.network.device_ip },
    { label: t("simpleadmin.rows.lan_gateway"), value: data?.network.lan_gateway },
    { label: t("simpleadmin.rows.wan_ipv4"), value: data?.network.wan_ipv4 },
    { label: t("simpleadmin.rows.wan_ipv6"), value: data?.network.wan_ipv6 },
    { label: t("simpleadmin.rows.public_ipv4"), value: data?.network.public_ipv4 },
    { label: t("simpleadmin.rows.public_ipv6"), value: data?.network.public_ipv6 },
  ];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">{t("simpleadmin.title")}</CardTitle>
        <CardDescription>{t("simpleadmin.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center">
            <Image
              src={SimpleT99Icon}
              alt={t("simpleadmin.logo_alt")}
              className="size-24"
              priority
            />
          </div>

          {/* Description */}
          <div className="grid gap-y-4">
            <p className="text-sm text-muted-foreground text-pretty leading-relaxed font-medium">
              {t("simpleadmin.intro")}
            </p>
            <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
              <Trans
                t={t}
                i18nKey="simpleadmin.credits"
                components={{
                  link: (
                    <a
                      href="https://github.com/dr-dolomite/QManager-RM520N"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    />
                  ),
                }}
              />
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
                  {t("simpleadmin.version")}
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
              {t("simpleadmin.network")}
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
