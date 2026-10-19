"use client";

import { useTranslation } from "react-i18next";
import ATTerminalCard from "@/components/system/at-terminal/at-terminal-card";
import { PageShell } from "@/components/page-shell";

export default function TerminalPage() {
  const { t } = useTranslation("terminal");
  return (
    <PageShell
      title={t("page.title")}
      description={t("page.description")}
      columns={1}
    >
      <ATTerminalCard />
    </PageShell>
  );
}
