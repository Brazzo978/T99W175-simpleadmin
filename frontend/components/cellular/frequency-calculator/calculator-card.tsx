"use client";

import { CheckCircle2Icon } from "lucide-react";
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

function uplinkText(m: BandMatch): string {
  if (m.duplex === "SDL") return "None, supplemental downlink";
  if (m.duplex === "TDD") return "Same as downlink (TDD)";
  if (!m.ul) return "None, beyond the uplink range";
  return `${m.ul.channel} · ${fmtMHz(m.ul.freq, m.rat)}`;
}

function MatchRow({ m, serving }: { m: BandMatch; serving: boolean }) {
  const rows: [string, string][] = [
    ["Downlink", m.dl ? `${m.dl.channel} · ${fmtMHz(m.dl.freq, m.rat)}` : "None, beyond the downlink range"],
    ["Uplink", uplinkText(m)],
    ["DL band", range(m.dlEdges, "MHz")],
    ["DL channels", range(m.dlChannels)],
  ];
  if (m.duplex === "FDD") {
    rows.push(["UL band", range(m.ulEdges, "MHz")], ["UL channels", range(m.ulChannels)]);
  }
  if (m.duplexSpacing !== null) {
    const spacing = Math.abs(m.duplexSpacing);
    rows.push(["Duplex", `${spacing} MHz, uplink ${m.duplexSpacing > 0 ? "below" : "above"} downlink`]);
  }
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{m.label}</span>
        <span className="text-sm text-muted-foreground">{m.name}</span>
        <Badge variant="outline">{m.duplex}</Badge>
        {m.direction === "UL" && <Badge variant="outline">Uplink channel</Badge>}
        {serving && (
          <Badge
            variant="outline"
            className="border-success/30 bg-success/15 text-success hover:bg-success/20"
          >
            <CheckCircle2Icon className="size-3" />
            Serving
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
  const name = result.rat === "LTE" ? "LTE" : "5G NR";
  // LTE channel numbers depend on the band; NR has one global numbering.
  const headline =
    mode === "channel" || result.rat === "NR"
      ? `${channelName(result.rat)} ${result.channel} · ${fmtMHz(result.freq, result.rat)}`
      : `${result.matches.length} band${result.matches.length === 1 ? "" : "s"}, nearest 100 kHz channel each`;
  return (
    <section className="grid gap-2" aria-label={`${name} result`}>
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
  const inputLabel =
    form.mode === "frequency"
      ? "Frequency (MHz)"
      : form.rat === "auto"
        ? "EARFCN or NR-ARFCN"
        : channelName(form.rat as Rat);
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Channel calculator</CardTitle>
        <CardDescription>
          An EARFCN or NR-ARFCN to its frequency and bands, or a frequency to its
          channel numbers.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Tabs
          value={form.mode}
          onValueChange={(v) =>
            onForm({ ...form, mode: v as Mode, value: carryOver(outcome, v as Mode) })
          }
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="channel">Channel to frequency</TabsTrigger>
            <TabsTrigger value="frequency">Frequency to channel</TabsTrigger>
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
              aria-label="Radio technology"
            >
              <ToggleGroupItem value="auto" className="px-3">
                {form.mode === "channel" ? "Auto" : "Both"}
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
                placeholder={form.mode === "channel" ? "e.g. 1850 or 643296" : "e.g. 1842.5"}
                className="min-w-0 flex-1 tabular-nums"
              />
              <Button type="submit">Calculate</Button>
            </div>
          </div>
        </form>

        {carriers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Serving cells">
            <span className="text-xs text-muted-foreground">Serving cells</span>
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
            {outcome.error}
          </div>
        )}

        {outcome?.ok &&
          outcome.results.map((r) => (
            <ResultGroup key={r.rat} result={r} mode={outcome.query.mode} serving={serving} />
          ))}

        <p className="text-xs text-muted-foreground">
          LTE: 3GPP TS 36.101 §5.7.3, 100 kHz raster. NR: TS 38.104 §5.4.2.1
          global raster, one NR-ARFCN numbering for downlink and uplink. Where
          bands overlap every candidate is listed; the serving one is marked.
        </p>
      </CardContent>
    </Card>
  );
}
