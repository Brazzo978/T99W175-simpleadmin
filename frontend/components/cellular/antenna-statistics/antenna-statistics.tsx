"use client";

import { useMemo, useState } from "react";
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
  const nrTitle = pcell ? "5G NSA Cell" : "5G Primary Cell";

  const lteLive = pcell ? (
    <LiveChainsCard
      title="LTE Primary Cell"
      description={`Band ${pcell.band} · EARFCN ${pcell.earfcn} · PCI ${pcell.pci}`}
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
          ? "QMI reports the per-chain RSRP only: the per-chain SINR needs diag_bridge."
          : undefined
      }
    />
  ) : (
    <NoCellCard title="LTE Primary Cell" rat="lte" />
  );

  const nrLive = nr ? (
    <LiveChainsCard
      title={nrTitle}
      description={`${nr.band ? `Band n${nr.band} · ` : ""}NR-ARFCN ${nr.arfcn} · PCI ${nr.pci}`}
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
          note: has(nr.sinr_age_s) ? `RRC report, ${nr.sinr_age_s} s ago` : undefined,
        },
        { label: "SNR (best)", value: nr.snr, unit: "dB", thresholds: SINR_THRESHOLDS },
      ]}
      footnote={
        (nr.snr_rx ?? []).some(has)
          ? undefined
          : "No per-chain SNR reported: not every firmware logs it. The cell SINR comes from QMI or the last RRC measurement report."
      }
    />
  ) : (
    <NoCellCard title="5G NR Cell" rat="nr" />
  );

  const lteStats = <ChainStatsCard title="LTE chain statistics" rat="lte" samples={samples} />;
  const nrStats = <ChainStatsCard title="5G chain statistics" rat="nr" samples={samples} />;
  // SA: the 5G cards lead.
  const nrFirst = !pcell && Boolean(nr);

  return (
    <PageShell
      title="Antenna Statistics"
      description="Each receive chain of the LTE primary cell and of the 5G cell: which ones the modem uses, their live RSRP and SINR, and how they spread over the last minutes. Which connector feeds which chain depends on the band."
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
