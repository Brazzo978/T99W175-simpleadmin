"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  CheckCircle2Icon,
  CircleDotIcon,
  CompassIcon,
  Loader2Icon,
  MapPinIcon,
  RotateCcwIcon,
  Trash2Icon,
  TrophyIcon,
} from "lucide-react";
import { getValueColorClass } from "@/components/dashboard/signal-card-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { pickRadio } from "@/lib/bridge/radio";
import type { RadioSample } from "@/lib/bridge/radio-history";
import { getState, subscribePassive } from "@/lib/bridge/store";
import { cn } from "@/lib/utils";
import type { ChainValues, DiagSnapshot } from "@/types/bridge";
import {
  RSRP_THRESHOLDS,
  SINR_THRESHOLDS,
  type SignalThresholds,
} from "@/types/modem-status";
import { timeTick } from "../signal/controls";
import { fmt, quality, qualityFill } from "../signal/metrics";
import {
  DEFAULT_LABELS,
  RADIO_MODE_LABELS,
  RSRP_SCALE,
  SAMPLES_PER_RECORDING,
  SINR_SCALE,
  SLOT_COUNT,
  cellLabel,
  compareSlots,
  loadAlignment,
  makeRecording,
  radioMode,
  samplesSince,
  saveAlignment,
  type AntennaType,
  type RatKey,
  type RatReading,
  type Recording,
  type StoredAlignment,
} from "./utils";

// ---------------------------------------------------------------------------
// Recorder: slots, labels and the recording in progress
// ---------------------------------------------------------------------------

interface RecorderState extends StoredAlignment {
  /** Slot being recorded and the Date.now() it started at */
  active: { slot: number; since: number } | null;
}

const slotLabel = (s: StoredAlignment, slot: number) =>
  s.labels[s.antennaType][slot].trim() || DEFAULT_LABELS[s.antennaType][slot];

/** A slot label as shown: the default position names ("Position A", kept
 *  in English in storage) in the current language, a typed label as is. */
function labelText(t: TFunction<"antenna">, label: string): string {
  const i = DEFAULT_LABELS.omni.indexOf(label);
  return i < 0
    ? label
    : t("alignment.default_position", { letter: String.fromCharCode(65 + i) });
}

function useRecorder() {
  const [state, setState] = useState<RecorderState>(() => ({
    ...loadAlignment(),
    active: null,
  }));
  const { antennaType, labels, slots, active } = state;

  useEffect(() => {
    saveAlignment({ antennaType, labels, slots });
  }, [antennaType, labels, slots]);

  // A recording ends when enough new samples are in the store's radio
  // history: watched from the store, so it completes on the sample itself.
  useEffect(() => {
    if (!active) return;
    return subscribePassive(() => {
      const bridge = getState();
      const fresh = samplesSince(bridge.radioHistory, active.since);
      if (fresh.length < SAMPLES_PER_RECORDING) return;
      const now = Date.now();
      const { snapshot } = pickRadio(bridge, now);
      setState((s) => {
        if (s.active?.slot !== active.slot || s.active.since !== active.since) return s;
        const next = [...s.slots];
        next[active.slot] = makeRecording(
          slotLabel(s, active.slot),
          fresh.slice(0, SAMPLES_PER_RECORDING),
          snapshot,
          now,
        );
        return { ...s, slots: next, active: null };
      });
    });
  }, [active]);

  const start = useCallback((slot: number) => {
    setState((s) => (s.active ? s : { ...s, active: { slot, since: Date.now() } }));
  }, []);
  const cancel = useCallback(() => setState((s) => ({ ...s, active: null })), []);
  const clear = useCallback((slot: number) => {
    setState((s) => {
      if (s.active?.slot === slot) return s;
      const next = [...s.slots];
      next[slot] = null;
      return { ...s, slots: next };
    });
  }, []);
  const reset = useCallback(
    () => setState((s) => ({ ...s, slots: Array(SLOT_COUNT).fill(null), active: null })),
    [],
  );
  const setType = useCallback(
    (type: AntennaType) => setState((s) => (s.active ? s : { ...s, antennaType: type })),
    [],
  );
  const setLabel = useCallback((slot: number, label: string) => {
    setState((s) => {
      const list = [...s.labels[s.antennaType]];
      list[slot] = label;
      return { ...s, labels: { ...s.labels, [s.antennaType]: list } };
    });
  }, []);

  return { state, start, cancel, clear, reset, setType, setLabel };
}

// ---------------------------------------------------------------------------
// Compact value over a slim quality-tinted bar
// ---------------------------------------------------------------------------

function MiniSignalBar({
  label,
  value,
  unit,
  scale,
  thresholds,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  scale: readonly [number, number];
  thresholds: SignalThresholds;
}) {
  const v = typeof value === "number" ? value : null;
  const q = quality(v, thresholds);
  const fill = v === null ? 0 : Math.max(0, Math.min(1, (v - scale[0]) / (scale[1] - scale[0])));
  return (
    <div className="grid min-w-0 content-start gap-1">
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums transition-colors",
          v === null ? "text-muted-foreground" : getValueColorClass(q),
        )}
      >
        {fmt(v, unit)}
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <motion.div
          className={cn("h-full rounded-full", qualityFill(q))}
          style={{ originX: 0 }}
          initial={false}
          animate={{ scaleX: fill }}
          transition={{ type: "spring", stiffness: 180, damping: 24 }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

const RAT_NAME: Record<RatKey, string> = { lte: "LTE", nr: "5G NR" };

function RatBars({
  rat,
  rsrp,
  sinr,
}: {
  rat: RatKey;
  rsrp: number | null | undefined;
  sinr: number | null | undefined;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MiniSignalBar
        label={`${RAT_NAME[rat]} RSRP`}
        value={rsrp}
        unit="dBm"
        scale={RSRP_SCALE}
        thresholds={RSRP_THRESHOLDS}
      />
      <MiniSignalBar
        label={`${RAT_NAME[rat]} SINR`}
        value={sinr}
        unit="dB"
        scale={SINR_SCALE}
        thresholds={SINR_THRESHOLDS}
      />
    </div>
  );
}

function LivePreview({ snapshot }: { snapshot: DiagSnapshot | null }) {
  const { t } = useTranslation("antenna");
  const pcell = snapshot?.lte.find((c) => !c.is_scell);
  const nr = snapshot?.nr[0];
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {t("alignment.live.title")}
      </p>
      {!pcell && !nr ? (
        <p className="text-sm text-muted-foreground">{t("alignment.live.waiting")}</p>
      ) : (
        <div className="grid gap-4 @xl/card:grid-cols-2">
          {pcell && (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{cellLabel(snapshot, "lte")}</span>
              <RatBars rat="lte" rsrp={pcell.rsrp} sinr={pcell.sinr} />
            </div>
          )}
          {nr && (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{cellLabel(snapshot, "nr")}</span>
              <RatBars rat="nr" rsrp={nr.rsrp} sinr={nr.sinr} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One recording slot
// ---------------------------------------------------------------------------

function chainLine(values: ChainValues): string {
  return values.map((v) => (typeof v === "number" ? v.toFixed(0) : "—")).join(" · ");
}

function RecordedRat({ rat, reading }: { rat: RatKey; reading: RatReading }) {
  const { t } = useTranslation("antenna");
  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {RAT_NAME[rat]}
        {reading.cell ? <span className="font-normal normal-case"> · {reading.cell}</span> : null}
      </span>
      <RatBars rat={rat} rsrp={reading.rsrp} sinr={reading.sinr} />
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {t("alignment.chains_line", { values: chainLine(reading.rsrp_rx) })}
      </span>
    </div>
  );
}

function SlotRegion({
  index,
  antennaType,
  label,
  recording,
  isRecording,
  collected,
  isBest,
  score,
  canRecord,
  onLabel,
  onRecord,
  onCancel,
  onClear,
}: {
  index: number;
  antennaType: AntennaType;
  label: string;
  recording: Recording | null;
  isRecording: boolean;
  collected: number;
  isBest: boolean;
  score: number | null;
  canRecord: boolean;
  onLabel: (label: string) => void;
  onRecord: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation("antenna");
  const shown = recording ? recording.label : label;
  const status = isRecording
    ? t("alignment.slot.status_recording")
    : recording
      ? isBest
        ? t("alignment.slot.status_best")
        : t("alignment.slot.status_recorded")
      : t("alignment.slot.status_not_recorded");
  const Icon = antennaType === "directional" ? CompassIcon : MapPinIcon;
  return (
    <div
      role="region"
      aria-label={t("alignment.slot.aria", {
        index: index + 1,
        label: labelText(t, shown || DEFAULT_LABELS[antennaType][index]),
        status,
      })}
      className={cn(
        "relative grid content-start gap-3 rounded-xl border p-4 transition-colors",
        isRecording && "border-info/40 bg-info/5",
        isBest && "border-primary/30 bg-primary/5 ring-2 ring-primary",
      )}
    >
      {isBest && (
        <div className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2">
          <Badge className="gap-1">
            <TrophyIcon className="size-3" />
            {t("alignment.slot.best")}
          </Badge>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          value={labelText(t, shown)}
          onChange={(e) => onLabel(e.target.value)}
          disabled={isRecording || recording !== null}
          className="h-8 px-2 text-sm font-medium"
          placeholder={labelText(t, DEFAULT_LABELS[antennaType][index])}
          aria-label={
            antennaType === "directional"
              ? t("alignment.slot.angle_aria", { index: index + 1 })
              : t("alignment.slot.position_aria", { index: index + 1 })
          }
          maxLength={32}
        />
        {recording && !isRecording && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={t("alignment.slot.clear_aria", { label: labelText(t, recording.label) })}
            onClick={onClear}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

      {isRecording && (
        <div className="grid gap-3">
          <div className="grid justify-items-center gap-2 py-1" aria-live="polite">
            <div className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin text-info" aria-hidden />
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("alignment.slot.sample_progress", {
                  current: Math.min(collected + 1, SAMPLES_PER_RECORDING),
                  total: SAMPLES_PER_RECORDING,
                })}
              </span>
            </div>
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: SAMPLES_PER_RECORDING }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-2 rounded-full transition-colors duration-200",
                    i < collected ? "bg-info" : "bg-muted-foreground/20",
                  )}
                />
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("common:actions.cancel")}
          </Button>
        </div>
      )}

      {!isRecording && recording && (
        <div className="grid gap-3">
          {recording.lte && <RecordedRat rat="lte" reading={recording.lte} />}
          {recording.nr && <RecordedRat rat="nr" reading={recording.nr} />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2Icon className="size-3 text-success" aria-hidden />
              {t("alignment.slot.recorded_at", { time: timeTick(recording.ts) })}
            </span>
            {score !== null && (
              <span className="tabular-nums">
                <Trans
                  t={t}
                  i18nKey="alignment.slot.score"
                  values={{ score: score.toFixed(0) }}
                  components={{ value: <span className="font-semibold text-foreground" /> }}
                />
              </span>
            )}
          </div>
        </div>
      )}

      {!isRecording && !recording && (
        <div className="grid gap-3">
          <div className="flex items-center justify-center gap-2 py-3">
            <CircleDotIcon className="size-4 text-muted-foreground/50" aria-hidden />
            <span className="text-xs text-muted-foreground">
              {t("alignment.slot.not_recorded")}
            </span>
          </div>
          <Button size="sm" onClick={onRecord} disabled={!canRecord}>
            {antennaType === "directional"
              ? t("alignment.slot.record_angle")
              : t("alignment.slot.record_position")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function AlignmentMeterCard({
  snapshot,
  history,
}: {
  snapshot: DiagSnapshot | null;
  history: RadioSample[];
}) {
  const { t } = useTranslation("antenna");
  const { state, start, cancel, clear, reset, setType, setLabel } = useRecorder();
  const { antennaType, labels, slots, active } = state;
  const collected = active
    ? Math.min(samplesSince(history, active.since).length, SAMPLES_PER_RECORDING)
    : 0;
  const mode = radioMode(snapshot);
  const cmp = compareSlots(slots);
  const recorded = slots.filter(Boolean).length;
  const best = cmp.best !== null ? slots[cmp.best] : null;
  const noun = antennaType === "directional" ? "angle" : "position";
  // On the scores as shown, so the copy matches the slots.
  const margin =
    cmp.best !== null && cmp.second !== null
      ? Math.round(cmp.scores[cmp.best]!) - Math.round(cmp.scores[cmp.second]!)
      : null;
  const advice = [
    margin !== null && cmp.second !== null
      ? t(`alignment.recommendation.highest_${noun}_ahead`, {
          count: margin,
          label: labelText(t, slots[cmp.second]!.label),
        })
      : t(`alignment.recommendation.highest_${noun}`),
    margin !== null && margin < 3 ? t("alignment.recommendation.within_noise") : null,
    cmp.mixedCells ? t("alignment.recommendation.mixed_cells") : null,
    recorded < SLOT_COUNT
      ? t("alignment.recommendation.remaining", { count: SLOT_COUNT - recorded })
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  const basis = cmp.basis
    .map(({ rat, sinr }) =>
      t(sinr ? "alignment.basis.rsrp_sinr" : "alignment.basis.rsrp", {
        rat: rat === "lte" ? "LTE" : "5G",
      }),
    )
    .join(", ");

  return (
    <Card className="@container/card @3xl/main:col-span-2">
      <CardHeader>
        <CardTitle>{t("alignment.meter.title")}</CardTitle>
        <CardDescription>
          {antennaType === "directional"
            ? t("alignment.meter.description_directional", { samples: SAMPLES_PER_RECORDING })
            : t("alignment.meter.description_omni", { samples: SAMPLES_PER_RECORDING })}
        </CardDescription>
        {mode && (
          <CardAction>
            <Badge variant="outline">{RADIO_MODE_LABELS[mode]}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          className="flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label={t("alignment.meter.toolbar_aria")}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={antennaType}
            onValueChange={(v) => v && setType(v as AntennaType)}
            disabled={active !== null}
            aria-label={t("alignment.meter.antenna_type_aria")}
          >
            <ToggleGroupItem value="directional" className="px-3">
              <CompassIcon />
              {t("alignment.meter.directional")}
            </ToggleGroupItem>
            <ToggleGroupItem value="omni" className="px-3">
              <MapPinIcon />
              {t("alignment.meter.omni")}
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={reset}
            disabled={active !== null || recorded === 0}
          >
            <RotateCcwIcon />
            {t("alignment.meter.reset")}
          </Button>
        </div>

        <LivePreview snapshot={snapshot} />

        <div className="grid gap-4 pt-1 @2xl/card:grid-cols-3">
          {slots.map((slot, i) => (
            <SlotRegion
              key={i}
              index={i}
              antennaType={antennaType}
              label={labels[antennaType][i]}
              recording={slot}
              isRecording={active?.slot === i}
              collected={active?.slot === i ? collected : 0}
              isBest={cmp.best === i}
              score={cmp.scores[i]}
              canRecord={active === null && snapshot !== null}
              onLabel={(label) => setLabel(i, label)}
              onRecord={() => start(i)}
              onCancel={cancel}
              onClear={() => clear(i)}
            />
          ))}
        </div>

        <AnimatePresence initial={false} mode="wait">
          {best ? (
            <motion.div
              key="recommendation"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rounded-lg border border-primary/30 bg-primary/5 p-4"
              role="status"
            >
              <div className="flex items-start gap-3">
                <TrophyIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="grid gap-1">
                  <p className="text-sm font-semibold">
                    {t("alignment.recommendation.label")}{" "}
                    <span className="text-primary">{labelText(t, best.label)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{advice}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="text-sm text-muted-foreground"
            >
              {recorded >= 2
                ? t("alignment.hint.no_common")
                : t(`alignment.hint.record_two_${noun}`)}
            </motion.p>
          )}
        </AnimatePresence>

        <p className="text-xs text-muted-foreground">
          {basis
            ? t("alignment.footer.score_basis", { basis })
            : t("alignment.footer.score")}
        </p>
      </CardContent>
    </Card>
  );
}
