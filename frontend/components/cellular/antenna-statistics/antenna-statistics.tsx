"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { pickRadio } from "@/lib/bridge/radio";
import { clearRadioHistory } from "@/lib/bridge/store";
import {
  RSRP_THRESHOLDS,
  RSRQ_THRESHOLDS,
  SINR_THRESHOLDS,
} from "@/types/modem-status";
import { chainMask } from "../antenna/chains";
import { SignalToolbar } from "../signal/controls";
import { windowed } from "../signal/metrics";
import { ChainStatsCard, LiveChainsCard, NoCellCard } from "./chain-cards";

const has = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export default function AntennaStatisticsComponent() {
  const { t } = useTranslation("antenna");
  const state = useBridgeState();
  const now = useNow();
  const [windowMs, setWindowMs] = useState(300_000);
  const { snapshot, source } = useMemo(() => pickRadio(state, now), [state, now]);
  const samples = useMemo(
    () => windowed(state.radioHistory, windowMs, now),
    [state.radioHistory, windowMs, now],
  );

  const pcell = snapshot?.lte.find((c) => !c.is_scell);
  const nr = snapshot?.nr[0];
  const nrTitle = pcell
    ? t("statistics.nr_nsa_title")
    : t("statistics.nr_primary_title");

  const lteLive = pcell ? (
    <LiveChainsCard
      title={t("statistics.lte_title")}
      description={t("statistics.lte_description", {
        band: pcell.band,
        earfcn: pcell.earfcn,
        pci: pcell.pci,
      })}
      mask={chainMask(pcell.rx_diversity, pcell.rsrp_rx, pcell.sinr_rx)}
      rsrp={pcell.rsrp_rx}
      sinr={pcell.sinr_rx}
      sinrLabel="SINR"
      metrics={[
        { label: "RSRP", value: pcell.rsrp, unit: "dBm", thresholds: RSRP_THRESHOLDS },
        { label: "RSRQ", value: pcell.rsrq, unit: "dB", thresholds: RSRQ_THRESHOLDS },
        { label: "SINR", value: pcell.sinr, unit: "dB", thresholds: SINR_THRESHOLDS },
        { label: "RSSI", value: pcell.rssi, unit: "dBm" },
      ]}
      footnote={
        source === "qmi"
          ? t("statistics.qmi_footnote")
          : undefined
      }
    />
  ) : (
    <NoCellCard title={t("statistics.lte_title")} rat="lte" />
  );

  const nrLive = nr ? (
    <LiveChainsCard
      title={nrTitle}
      description={
        nr.band
          ? t("statistics.nr_description_band", { band: nr.band, arfcn: nr.arfcn, pci: nr.pci })
          : t("statistics.nr_description", { arfcn: nr.arfcn, pci: nr.pci })
      }
      mask={chainMask(nr.rx_diversity, nr.rsrp_rx, nr.snr_rx)}
      rsrp={nr.rsrp_rx}
      sinr={nr.snr_rx}
      sinrLabel="SNR"
      metrics={[
        { label: "RSRP", value: nr.rsrp, unit: "dBm", thresholds: RSRP_THRESHOLDS },
        { label: "RSRQ", value: nr.rsrq, unit: "dB", thresholds: RSRQ_THRESHOLDS },
        {
          label: "SINR",
          value: nr.sinr,
          unit: "dB",
          thresholds: SINR_THRESHOLDS,
          note: has(nr.sinr_age_s)
            ? t("statistics.rrc_report_age", { age: nr.sinr_age_s })
            : undefined,
        },
        { label: t("statistics.snr_best"), value: nr.snr, unit: "dB", thresholds: SINR_THRESHOLDS },
      ]}
      footnote={
        (nr.snr_rx ?? []).some(has)
          ? undefined
          : t("statistics.no_nr_chain_snr")
      }
    />
  ) : (
    <NoCellCard title={t("statistics.nr_title")} rat="nr" />
  );

  const lteStats = (
    <ChainStatsCard title={t("statistics.lte_stats_title")} rat="lte" samples={samples} />
  );
  const nrStats = (
    <ChainStatsCard title={t("statistics.nr_stats_title")} rat="nr" samples={samples} />
  );
  // SA: the 5G cards lead.
  const nrFirst = !pcell && Boolean(nr);

  return (
    <PageShell
      title={t("statistics.page.title")}
      description={t("statistics.page.description")}
    >
      {!snapshot ? (
        <>
          <Skeleton className="h-10 w-full rounded-xl @3xl/main:col-span-2" />
          <Skeleton className="h-[30rem] w-full rounded-xl" />
          <Skeleton className="h-[30rem] w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </>
      ) : (
        <>
          <SignalToolbar
            source={source}
            windowMs={windowMs}
            onWindow={setWindowMs}
            samples={samples.length}
            onReset={clearRadioHistory}
          />
          {nrFirst ? nrLive : lteLive}
          {nrFirst ? lteLive : nrLive}
          {nrFirst ? nrStats : lteStats}
          {nrFirst ? lteStats : nrStats}
        </>
      )}
    </PageShell>
  );
}
