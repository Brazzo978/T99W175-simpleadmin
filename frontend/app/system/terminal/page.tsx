import ATTerminalCard from "@/components/system/at-terminal/at-terminal-card";
import { PageShell } from "@/components/page-shell";

export default function TerminalPage() {
  return (
    <PageShell
      title="AT Terminal"
      description="Sends commands to the modem as typed. Admin accounts only; each command waits for the other AT clients."
      columns={1}
    >
      <ATTerminalCard />
    </PageShell>
  );
}
