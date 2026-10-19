"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/page-shell";
import { useBridgeState, useNow } from "@/hooks/use-bridge";
import { pickRadio } from "@/lib/bridge/radio";
import { carrierRows } from "../signal/carriers";
import {
  EMPTY_QUERY,
  HISTORY_MAX,
  carrierQuery,
  loadHistory,
  outcomeSummary,
  runQuery,
  saveHistory,
  servingKeys,
  type HistoryEntry,
  type Query,
} from "./calc";
import { CalculatorCard } from "./calculator-card";
import { HistoryCard, ServingCarriersCard } from "./side-cards";

export default function FrequencyCalculatorComponent() {
  const { t } = useTranslation("frequency-calculator");
  const state = useBridgeState();
  const now = useNow();
  const { snapshot } = useMemo(() => pickRadio(state, now), [state, now]);
  const carriers = useMemo(() => (snapshot ? carrierRows(snapshot) : []), [snapshot]);
  const serving = useMemo(() => servingKeys(carriers), [carriers]);

  // Until the user types or picks something, the calculator follows the
  // first serving carrier (the LTE PCell, else the 5G cell).
  const [form, setForm] = useState<Query | null>(null);
  const [submitted, setSubmitted] = useState<Query | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  useEffect(() => saveHistory(history), [history]);

  const prefill = carriers[0] ? carrierQuery(carriers[0]) : null;
  const shown = submitted ?? prefill;
  const outcome = shown ? runQuery(shown) : null;

  const calculate = (query: Query) => {
    setForm(query);
    setSubmitted(query);
    const result = runQuery(query);
    if (!result.ok) return;
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      query,
      summary: outcomeSummary(result),
      ts: Date.now(),
    };
    setHistory((h) =>
      [entry, ...h.filter((e) => e.summary !== entry.summary)].slice(0, HISTORY_MAX),
    );
  };

  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
    >
      <CalculatorCard
        form={form ?? prefill ?? EMPTY_QUERY}
        onForm={setForm}
        onSubmit={calculate}
        outcome={outcome}
        carriers={carriers}
        serving={serving}
      />
      {/* The two short cards share the second column, under each other. */}
      <div className="grid content-start gap-4">
        <ServingCarriersCard
          carriers={carriers}
          live={state.diagLink === "connected" || state.systemLink === "connected"}
        />
        <HistoryCard
          entries={history}
          onRecall={(e) => {
            setForm(e.query);
            setSubmitted(e.query);
          }}
          onRemove={(id) => setHistory((h) => h.filter((e) => e.id !== id))}
          onClear={() => setHistory([])}
        />
      </div>
    </PageShell>
  );
}
