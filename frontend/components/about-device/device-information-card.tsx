"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCcw } from "lucide-react";

import type { AboutDeviceData } from "@/types/about-device";

// =============================================================================
// DeviceInformationCard — Modem image + device identity & network addresses
// =============================================================================

interface DataRow {
  label: string;
  value: string;
  mono?: boolean;
}

interface DataSection {
  title: string;
  rows: DataRow[];
}

interface DeviceInformationCardProps {
  data: AboutDeviceData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

function buildSections(data: AboutDeviceData, t: TFunction): DataSection[] {
  const row = (key: string) => t(`device_info.rows.${key}`);
  return [
    {
      title: t("device_info.sections.device"),
      rows: [
        { label: row("manufacturer"), value: data.device.manufacturer },
        { label: row("model"), value: data.device.model },
        { label: row("firmware"), value: data.device.firmware },
        { label: row("build_date"), value: data.device.build_date },
        { label: row("imei"), value: data.device.imei, mono: true },
        {
          label: row("release_lte"),
          value: data.threeGppRelease.lte,
        },
        {
          label: row("release_nr5g"),
          value: data.threeGppRelease.nr5g,
        },
      ],
    },
    {
      title: t("device_info.sections.system"),
      rows: [
        { label: row("hostname"), value: data.system.hostname },
        {
          label: row("system_version"),
          value: data.system.openwrt_version,
          mono: true,
        },
        {
          label: row("kernel_version"),
          value: data.system.kernel_version,
          mono: true,
        },
      ],
    },
  ];
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function DeviceInformationSkeleton() {
  const { t } = useTranslation("about");
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          {t("device_info.title")}
        </CardTitle>
        <CardDescription>{t("device_info.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center mb-8">
          <Skeleton className="size-44 rounded-full" />
        </div>
        <div className="grid divide-y divide-border border-y border-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const DeviceInformationCard = ({
  data,
  isLoading,
  error,
  onRetry,
}: DeviceInformationCardProps) => {
  const { t } = useTranslation("about");
  if (isLoading) {
    return <DeviceInformationSkeleton />;
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">
          {t("device_info.title")}
        </CardTitle>
        <CardDescription>{t("device_info.description")}</CardDescription>
      </CardHeader>
      <CardContent aria-live="polite">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("device_info.load_failed")}</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCcw className="size-3.5 mr-1.5" />
                {t("common:actions.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : data ? (
          <div className="grid gap-4">
            {/* Modem image */}
            <motion.div
              className="flex items-center justify-center mb-4"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <div className="size-44 bg-primary/15 rounded-full p-4 flex items-center justify-center">
                <img
                  src="/simple-t99-icon.png"
                  alt={
                    data.device.model
                      ? t("device_info.modem_alt", { model: data.device.model })
                      : t("device_info.modem_alt_generic")
                  }
                  className="size-full drop-shadow-md object-contain"
                />
              </div>
            </motion.div>

            {/* Data sections */}
            {buildSections(data, t).map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                <motion.dl
                  className="grid divide-y divide-border border-y border-border"
                  initial="hidden"
                  animate="visible"
                  variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
                >
                  {section.rows.map((row) => (
                    <motion.div
                      key={row.label}
                      className="flex items-center justify-between py-2"
                      variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <dt className="text-sm font-semibold text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd
                        className={`text-sm font-semibold min-w-0 truncate ml-4 ${
                          row.mono ? "tabular-nums" : ""
                        }`}
                        title={row.value || undefined}
                      >
                        {row.value || "-"}
                      </dd>
                    </motion.div>
                  ))}
                </motion.dl>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default DeviceInformationCard;
