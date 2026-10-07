// =============================================================================
// Modem actions — user-triggered AT commands
// =============================================================================
// The only AT traffic the UI generates: one command per explicit user action,
// sent through the user_atcommand CGI, which serializes it with every other
// AT client via atcli_smd8 (admin role required).
// =============================================================================

import { authFetch } from "@/lib/auth-fetch";

const AT_ENDPOINT = "/cgi-bin/user_atcommand";

export interface AtResult {
  success: boolean;
  output?: string;
  message?: string;
}

export async function sendAtCommand(
  command: string,
  init?: RequestInit,
): Promise<AtResult> {
  const resp = await authFetch(
    `${AT_ENDPOINT}?atcmd=${encodeURIComponent(command)}`,
    { cache: "no-store", ...init },
  );
  const data: AtResult = await resp.json();
  // A command can be accepted and still answer ERROR.
  if (data.success && data.output && /\bERROR\b/.test(data.output)) {
    return { ...data, success: false, message: data.output.trim() };
  }
  return data;
}

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
  const request = sendAtCommand("AT+CFUN=1,1", { keepalive: true }).catch(
    (): AtResult => ({ success: false, message: "Modem unreachable" }),
  );
  const timeout = new Promise<AtResult>((resolve) =>
    setTimeout(() => resolve({ success: true, message: "No answer" }), REBOOT_ACK_MS),
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
  const detach = await sendAtCommand("AT+COPS=2");
  if (!detach.success) return detach;
  let last: AtResult = { success: false };
  for (let attempt = 0; attempt < REATTACH_ATTEMPTS; attempt++) {
    try {
      last = await sendAtCommand("AT+COPS=0");
    } catch {
      last = { success: false, message: "Connection lost" };
    }
    if (last.success) return last;
  }
  return {
    ...last,
    success: false,
    message:
      "The modem is deregistered: re-registration (AT+COPS=0) failed. " +
      "Retry the reconnect or reboot the modem.",
  };
}
