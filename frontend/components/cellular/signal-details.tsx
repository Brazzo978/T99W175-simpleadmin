"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { pickRadio } from "@/lib/bridge/radio";
import { clearRadioHistory } from "@/lib/bridge/store";
import { DistributionCard, TrendCard } from "./signal/analysis-cards";
import { CarrierTableCard } from "./signal/carrier-table";
import { DiagLogsCard, NeighbourCard } from "./signal/diag-cards";
import { RadioEventsCard } from "./signal/events-card";
import { LteCard, NrCard } from "./signal/cell-cards";
import { SignalToolbar } from "./signal/controls";
import { windowed } from "./signal/metrics";
import {
  AggregateThroughputCard,
  CarrierThroughputCard,
} from "./signal/throughput-cards";

export default function SignalDetailsComponent() {
  const { t } = useTranslation("signal");
  const state = useBridgeState();
  const now = useNow();
  const [windowMs, setWindowMs] = useState(300_000);
  const { snapshot, source } = useMemo(() => pickRadio(state, now), [state, now]);
  const samples = useMemo(
    () => windowed(state.radioHistory, windowMs, now),
    [state.radioHistory, windowMs, now],
  );
  const from = now - windowMs;

  const lte = (snapshot?.lte ?? [])
    .slice()
    .sort((a, b) => a.is_scell - b.is_scell || (a.scell_idx ?? 0) - (b.scell_idx ?? 0));
  const nr = snapshot?.nr ?? [];
  const total = [...lte, ...nr].reduce((s, c) => s + (c.bandwidth_mhz ?? 0), 0);

  return (
    <PageShell
      title={t("page.title")}
      description={t(total ? "page.description_aggregated" : "page.description", {
        source: t(`page.source.${source}`),
        total,
      })}
    >
      {!snapshot ? (
        <>
          <Skeleton className="h-10 w-full rounded-xl @3xl/main:col-span-2" />
          <Skeleton className="h-80 w-full rounded-xl @3xl/main:col-span-2" />
          <Skeleton className="h-56 w-full rounded-xl @3xl/main:col-span-2" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
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
          <AggregateThroughputCard snapshot={snapshot} source={source} samples={samples} from={from} to={now} />
          <CarrierTableCard snapshot={snapshot} live={source === "diag"} />
          <RadioEventsCard events={state.radioEvents} rrc={snapshot.rrc} live={source === "diag"} />
          <CarrierThroughputCard snapshot={snapshot} source={source} />
          <TrendCard samples={samples} from={from} to={now} />
          <DistributionCard samples={samples} />
          {/* 0xB180 is not logged by this firmware: the card shows only if a
              firmware sends neighbour measurements. */}
          {(snapshot.lte_neighbors?.length ?? 0) > 0 && (
            <NeighbourCard snapshot={snapshot} live={source === "diag"} />
          )}
          {lte.map((cell) => (
            <LteCard key={`lte-${cell.earfcn}-${cell.pci}`} cell={cell} />
          ))}
          {nr.map((cell, i) => (
            <NrCard key={`nr-${cell.arfcn}-${cell.pci}`} cell={cell} index={i} nsa={lte.length > 0} />
          ))}
          <DiagLogsCard snapshot={snapshot} live={source === "diag"} now={now} base={state.diagLogBase} />
        </>
      )}
    </PageShell>
  );
}
