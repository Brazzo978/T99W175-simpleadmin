"use client";

import type { TFunction } from "i18next";
import { CheckCircle2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BandMatch, CalcResult, Rat } from "@/lib/earfcn";
import { translate } from "@/lib/i18n/message";
import type { CarrierRow } from "../signal/carriers";
import {
  carrierQuery,
  channelName,
  fmtMHz,
  isServing,
  type Mode,
  type Outcome,
  type Query,
  type RatChoice,
} from "./calc";

const range = (r: [number, number] | null, unit = "") =>
  r ? `${r[0]}–${r[1]}${unit ? ` ${unit}` : ""}` : "—";

function uplinkText(t: TFunction, m: BandMatch): string {
  if (m.duplex === "SDL") return t("result.sdl");
  if (m.duplex === "TDD") return t("result.tdd_uplink");
  if (!m.ul) return t("result.no_uplink");
  return `${m.ul.channel} · ${fmtMHz(m.ul.freq, m.rat)}`;
}

function MatchRow({ m, serving }: { m: BandMatch; serving: boolean }) {
  const { t } = useTranslation("frequency-calculator");
  const rows: [string, string][] = [
    [
      t("result.rows.downlink"),
      m.dl ? `${m.dl.channel} · ${fmtMHz(m.dl.freq, m.rat)}` : t("result.no_downlink"),
    ],
    [t("result.rows.uplink"), uplinkText(t, m)],
    [t("result.rows.dl_band"), range(m.dlEdges, "MHz")],
    [t("result.rows.dl_channels"), range(m.dlChannels)],
  ];
  if (m.duplex === "FDD") {
    rows.push(
      [t("result.rows.ul_band"), range(m.ulEdges, "MHz")],
      [t("result.rows.ul_channels"), range(m.ulChannels)],
    );
  }
  if (m.duplexSpacing !== null) {
    const spacing = Math.abs(m.duplexSpacing);
    rows.push([
      t("result.rows.duplex"),
      t(m.duplexSpacing > 0 ? "result.duplex_below" : "result.duplex_above", { spacing }),
    ]);
  }
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{m.label}</span>
        <span className="text-sm text-muted-foreground">{m.name}</span>
        <Badge variant="outline">{m.duplex}</Badge>
        {m.direction === "UL" && (
          <Badge variant="outline">{t("result.uplink_channel_badge")}</Badge>
        )}
        {serving && (
          <Badge
            variant="outline"
            className="border-success/30 bg-success/15 text-success hover:bg-success/20"
          >
            <CheckCircle2Icon className="size-3" />
            {t("result.serving_badge")}
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm @xl/card:grid-cols-[auto_1fr_auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ResultGroup({
  result,
  mode,
  serving,
}: {
  result: CalcResult;
  mode: Mode;
  serving: Set<string>;
}) {
  const { t } = useTranslation("frequency-calculator");
  const name = result.rat === "LTE" ? "LTE" : "5G NR";
  // LTE channel numbers depend on the band; NR has one global numbering.
  const headline =
    mode === "channel" || result.rat === "NR"
      ? `${channelName(result.rat)} ${result.channel} · ${fmtMHz(result.freq, result.rat)}`
      : t("result.headline_bands", { count: result.matches.length });
  return (
    <section className="grid gap-2" aria-label={t("result.aria", { name })}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{name}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">{headline}</span>
      </div>
      {result.matches.map((m) => (
        <MatchRow
          key={`${m.label}-${m.direction}`}
          m={m}
          serving={isServing(serving, m.rat, m.dl?.channel, m.label)}
        />
      ))}
    </section>
  );
}

/** Value to carry over when switching between channel and frequency input. */
function carryOver(outcome: Outcome | null, mode: Mode): string {
  if (!outcome?.ok) return "";
  const r = outcome.results[0];
  if (mode === "frequency") return r.freq !== null ? String(r.freq) : "";
  if (r.rat === "NR") return String(r.channel);
  const m = r.matches[0];
  const point = m.direction === "UL" ? m.ul : m.dl;
  return point ? String(point.channel) : "";
}

export function CalculatorCard({
  form,
  onForm,
  onSubmit,
  outcome,
  carriers,
  serving,
}: {
  form: Query;
  onForm: (query: Query) => void;
  onSubmit: (query: Query) => void;
  outcome: Outcome | null;
  carriers: CarrierRow[];
  serving: Set<string>;
}) {
  const { t } = useTranslation("frequency-calculator");
  const inputLabel =
    form.mode === "frequency"
      ? t("calculator.input_frequency")
      : form.rat === "auto"
        ? t("calculator.input_channel_any")
        : channelName(form.rat as Rat);
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("calculator.title")}</CardTitle>
        <CardDescription>{t("calculator.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Tabs
          value={form.mode}
          onValueChange={(v) =>
            onForm({ ...form, mode: v as Mode, value: carryOver(outcome, v as Mode) })
          }
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="channel">{t("calculator.tab_channel")}</TabsTrigger>
            <TabsTrigger value="frequency">{t("calculator.tab_frequency")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
        >
          <Label htmlFor="frequency-calculator-input">{inputLabel}</Label>
          <div className="flex flex-wrap gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              value={form.rat}
              onValueChange={(v) => v && onForm({ ...form, rat: v as RatChoice })}
              aria-label={t("calculator.rat_aria")}
            >
              <ToggleGroupItem value="auto" className="px-3">
                {form.mode === "channel" ? t("calculator.rat_auto") : t("calculator.rat_both")}
              </ToggleGroupItem>
              <ToggleGroupItem value="LTE" className="px-3">
                LTE
              </ToggleGroupItem>
              <ToggleGroupItem value="NR" className="px-3">
                NR
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex min-w-48 flex-1 gap-2">
              <Input
                id="frequency-calculator-input"
                value={form.value}
                onChange={(e) => onForm({ ...form, value: e.target.value })}
                inputMode={form.mode === "channel" ? "numeric" : "decimal"}
                autoComplete="off"
                placeholder={
                  form.mode === "channel"
                    ? t("calculator.placeholder_channel")
                    : t("calculator.placeholder_frequency")
                }
                className="min-w-0 flex-1 tabular-nums"
              />
              <Button type="submit">{t("calculator.submit")}</Button>
            </div>
          </div>
        </form>

        {carriers.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t("calculator.serving_label")}
          >
            <span className="text-xs text-muted-foreground">{t("calculator.serving_label")}</span>
            {carriers.map((c) => (
              <Button
                key={c.key}
                variant="outline"
                size="xs"
                className="tabular-nums"
                onClick={() => onSubmit(carrierQuery(c))}
              >
                {c.name} · {c.arfcn}
              </Button>
            ))}
          </div>
        )}

        {outcome && !outcome.ok && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {translate(t, outcome.error)}
          </div>
        )}

        {outcome?.ok &&
          outcome.results.map((r) => (
            <ResultGroup key={r.rat} result={r} mode={outcome.query.mode} serving={serving} />
          ))}

        <p className="text-xs text-muted-foreground">{t("calculator.footnote")}</p>
      </CardContent>
    </Card>
  );
}
