"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChainValues, DiagSnapshot } from "@/types/bridge";
import { RSRP_THRESHOLDS, SINR_THRESHOLDS } from "@/types/modem-status";
import {
  CHAINS,
  chainMask,
  chainValue,
  isChainActive,
} from "../antenna/chains";
import {
  ChainMeter,
  ChainStatusBadge,
  RSRP_RANGE,
  SINR_RANGE,
} from "../antenna/chain-meters";

const DESCRIPTIONS = [
  "Primary receive chain",
  "Diversity receive chain",
  "First MIMO receive chain",
  "Second MIMO receive chain",
];

function RatSection({
  title,
  index,
  active,
  rsrp,
  sinr,
  sinrLabel,
}: {
  title: string;
  index: number;
  active: boolean;
  rsrp: ChainValues | undefined;
  sinr: ChainValues | undefined;
  sinrLabel: "SINR" | "SNR";
}) {
  const name = `${CHAINS[index].name} (${CHAINS[index].rx})`;
  // The SINR/SNR row only where the RAT reports it for some chain.
  const hasSinr = CHAINS.some((_, i) => chainValue(sinr, i) !== null);
  return (
    <div className={cn("grid gap-2 rounded-lg border p-3 transition-opacity", !active && "opacity-60")}>
      <span className="text-xs font-medium text-muted-foreground">
        {title}
        {!active && <span className="font-normal"> · not used</span>}
      </span>
      <ChainMeter
        label="RSRP"
        value={chainValue(rsrp, index)}
        unit="dBm"
        range={RSRP_RANGE}
        thresholds={RSRP_THRESHOLDS}
        name={name}
      />
      {hasSinr && (
        <ChainMeter
          label={sinrLabel}
          value={chainValue(sinr, index)}
          unit="dB"
          range={SINR_RANGE}
          thresholds={SINR_THRESHOLDS}
          name={name}
        />
      )}
    </div>
  );
}

/** What one receive chain sees right now, on each serving cell. */
export function AntennaChainCard({
  index,
  snapshot,
}: {
  index: number;
  snapshot: DiagSnapshot | null;
}) {
  const port = CHAINS[index];
  const pcell = snapshot?.lte.find((c) => !c.is_scell);
  const nr = snapshot?.nr[0];
  const lteActive = pcell
    ? isChainActive(chainMask(pcell.rx_diversity, pcell.rsrp_rx, pcell.sinr_rx), index)
    : false;
  const nrActive = nr
    ? isChainActive(chainMask(nr.rx_diversity, nr.rsrp_rx, nr.snr_rx), index)
    : false;
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{port.name}</CardTitle>
        <CardDescription>
          {port.rx} · {DESCRIPTIONS[index]}
        </CardDescription>
        <CardAction>
          <ChainStatusBadge active={lteActive || nrActive} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!pcell && !nr && (
          <p className="text-sm text-muted-foreground">No serving cell.</p>
        )}
        {pcell && (
          <RatSection
            title={`LTE PCell · B${pcell.band}`}
            index={index}
            active={lteActive}
            rsrp={pcell.rsrp_rx}
            sinr={pcell.sinr_rx}
            sinrLabel="SINR"
          />
        )}
        {nr && (
          <RatSection
            title={`5G NR${nr.band ? ` · n${nr.band}` : ""}`}
            index={index}
            active={nrActive}
            rsrp={nr.rsrp_rx}
            sinr={nr.snr_rx}
            sinrLabel="SNR"
          />
        )}
      </CardContent>
    </Card>
  );
}
