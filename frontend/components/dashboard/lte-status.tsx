"use client";

import { useTranslation } from "react-i18next";
import { SignalStatusCard } from "./signal-status-card";
import type { LteStatus } from "@/types/modem-status";
import {
  CQI_THRESHOLDS,
  RSRP_THRESHOLDS,
  RSRQ_THRESHOLDS,
  SINR_THRESHOLDS,
} from "@/types/modem-status";

interface LTEStatusComponentProps {
  data: LteStatus | null;
  isLoading: boolean;
}

const LTEStatusComponent = ({ data, isLoading }: LTEStatusComponentProps) => {
  const { t } = useTranslation("dashboard");

  const fmt = (value: number | null | undefined, unit: string) => {
    if (value === null || value === undefined) return "-";
    return `${value} ${unit}`;
  };

  const rows = [
    { label: t("signal_status.band"), value: data?.band || "-" },
    { label: t("signal_status.earfcn"), value: data?.earfcn?.toString() ?? "-" },
    { label: t("signal_status.pci"), value: data?.pci?.toString() ?? "-" },
    {
      label: t("signal_status.rsrp"),
      value: fmt(data?.rsrp, "dBm"),
      rawValue: data?.rsrp,
      thresholds: RSRP_THRESHOLDS,
    },
    {
      label: t("signal_status.rsrq"),
      value: fmt(data?.rsrq, "dB"),
      rawValue: data?.rsrq,
      thresholds: RSRQ_THRESHOLDS,
    },
    { label: t("signal_status.rssi"), value: fmt(data?.rssi, "dBm") },
    {
      label: t("signal_status.sinr"),
      value: fmt(data?.sinr, "dB"),
      rawValue: data?.sinr,
      thresholds: SINR_THRESHOLDS,
    },
    {
      label: t("signal_status.cqi"),
      value: data?.cqi != null ? `${data.cqi} / 15` : "-",
      rawValue: data?.cqi,
      thresholds: CQI_THRESHOLDS,
    },
    {
      label: t("signal_status.rank"),
      value: data?.ri != null ? `${data.ri}` : "-",
    },
    { label: t("signal_status.tx_power"), value: fmt(data?.tx_power, "dBm") },
  ];

  return (
    <SignalStatusCard
      title={t("signal_status.lte_primary_title")}
      state={data?.state ?? "unknown"}
      rsrp={data?.rsrp ?? null}
      rows={rows}
      isLoading={isLoading}
    />
  );
};

export default LTEStatusComponent;
