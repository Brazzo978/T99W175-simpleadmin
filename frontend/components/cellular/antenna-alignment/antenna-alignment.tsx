"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { pickRadio } from "@/lib/bridge/radio";
import { CHAINS } from "../antenna/chains";
import { AlignmentMeterCard } from "./alignment-meter";
import { AntennaChainCard } from "./antenna-card";

export default function AntennaAlignmentComponent() {
  const { t } = useTranslation("antenna");
  const state = useBridgeState();
  const now = useNow();
  const { snapshot } = useMemo(() => pickRadio(state, now), [state, now]);
  const started = state.diagAt > 0 || state.systemAt > 0;
  const linked = state.diagLink === "connected" || state.systemLink === "connected";

  return (
    <PageShell
      title={t("alignment.page.title")}
      description={t("alignment.page.description")}
    >
      {!started && !snapshot ? (
        <>
          <Skeleton className="h-[34rem] w-full rounded-xl @3xl/main:col-span-2" />
          {CHAINS.map((port) => (
            <Skeleton key={port.rx} className="h-64 w-full rounded-xl" />
          ))}
        </>
      ) : (
        <>
          {!snapshot && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive @3xl/main:col-span-2"
            >
              {linked
                ? t("alignment.no_serving_cell_alert")
                : t("alignment.no_data_alert")}
            </div>
          )}
          <AlignmentMeterCard snapshot={snapshot} history={state.radioHistory} />
          {CHAINS.map((port, i) => (
            <AntennaChainCard key={port.rx} index={i} snapshot={snapshot} />
          ))}
        </>
      )}
    </PageShell>
  );
}
