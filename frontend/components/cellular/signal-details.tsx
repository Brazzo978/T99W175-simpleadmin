"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { pickRadio, type RadioSource } from "@/lib/bridge/radio";
import { clearRadioHistory } from "@/lib/bridge/store";
import { DistributionCard, TrendCard } from "./signal/analysis-cards";
import { CarrierTableCard } from "./signal/carrier-table";
import { LteCard, NrCard } from "./signal/cell-cards";
import { SignalToolbar } from "./signal/controls";
import { windowed } from "./signal/metrics";
import {
  AggregateThroughputCard,
  CarrierThroughputCard,
} from "./signal/throughput-cards";

const SOURCE_LABEL: Record<RadioSource, string> = {
  diag: "DIAG",
  qmi: "QMI (diag_bridge not connected)",
  none: "no data",
};

export default function SignalDetailsComponent() {
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
      title="Signal Details"
      description={`Every carrier the modem uses, live, with trends and distributions over the last minutes. Source: ${SOURCE_LABEL[source]}${
        total ? ` · ${total} MHz aggregated` : ""
      }.`}
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
          <CarrierThroughputCard snapshot={snapshot} source={source} />
          <TrendCard samples={samples} from={from} to={now} />
          <DistributionCard samples={samples} />
          {lte.map((cell) => (
            <LteCard key={`lte-${cell.earfcn}-${cell.pci}`} cell={cell} />
          ))}
          {nr.map((cell, i) => (
            <NrCard key={`nr-${cell.arfcn}-${cell.pci}`} cell={cell} index={i} nsa={lte.length > 0} />
          ))}
        </>
      )}
    </PageShell>
  );
}
