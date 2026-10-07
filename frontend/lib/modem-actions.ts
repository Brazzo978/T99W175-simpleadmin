// =============================================================================
// Modem actions — user-triggered AT commands with side effects
// =============================================================================
// The only AT traffic the UI generates: one command per explicit user
// action, through lib/at.ts.
// =============================================================================

import { sendAt, type AtResult } from "@/lib/at";

/** How long to wait for the reset to be acknowledged before assuming it. */
const REBOOT_ACK_MS = 3000;

/**
 * Full modem reset. AT+CFUN=1,1 answers OK before the reset, so the CGI
 * normally confirms; a request still pending after REBOOT_ACK_MS was sent
 * and counts as accepted. A request that fails (network down, refusal by
 * role, ERROR) is a failure: nothing may have reached the modem.
 * keepalive lets the request survive the navigation to the countdown page.
 */
export async function rebootModem(): Promise<AtResult> {
  const request = sendAt("AT+CFUN=1,1", { keepalive: true });
  const timeout = new Promise<AtResult>((resolve) =>
    setTimeout(
      () => resolve({ ok: true, output: "", message: "No answer" }),
      REBOOT_ACK_MS,
    ),
  );
  return Promise.race([request, timeout]);
}

const REATTACH_ATTEMPTS = 3;

/**
 * Deregister and register again: a fresh attach without a reboot. Once the
 * detach went through the modem is off the network until AT+COPS=0
 * succeeds, so that step is retried, and a final failure says so.
 */
export async function reconnectNetwork(): Promise<AtResult> {
  const detach = await sendAt("AT+COPS=2");
  if (!detach.ok) return detach;
  let last: AtResult = { ok: false, output: "" };
  for (let attempt = 0; attempt < REATTACH_ATTEMPTS; attempt++) {
    last = await sendAt("AT+COPS=0");
    if (last.ok) return last;
  }
  return {
    ...last,
    ok: false,
    message:
      "The modem is deregistered: re-registration (AT+COPS=0) failed. " +
      "Retry the reconnect or reboot the modem.",
  };
}
