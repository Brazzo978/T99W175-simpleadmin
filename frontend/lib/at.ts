// =============================================================================
// AT client — one command per request through cgi-bin/get_atcommand
// =============================================================================
// get_atcommand runs the command through the serialized AT client
// (atcli_smd8 → system_bridge), retries while the modem is busy, and lets
// non-admin accounts send read-only commands only. Several commands can be
// chained with ";" (AT^SLMODE?;^SWITCH_SLOT?).
//
// The raw AT terminal uses cgi-bin/user_atcommand instead (admin, verbatim).
// =============================================================================

import { authFetch } from "@/lib/auth-fetch";

const AT_ENDPOINT = "/cgi-bin/get_atcommand";

export interface AtResult {
  /** The modem answered and the answer holds no ERROR */
  ok: boolean;
  /** Raw modem output (echo included) */
  output: string;
  /** Why it failed: CGI message, the modem's error line, or a network error */
  message?: string;
}

export async function sendAt(
  command: string,
  init?: RequestInit,
): Promise<AtResult> {
  let resp: Response;
  try {
    resp = await authFetch(
      `${AT_ENDPOINT}?${new URLSearchParams({ atcmd: command })}`,
      { cache: "no-store", ...init },
    );
  } catch {
    return { ok: false, output: "", message: "Modem unreachable" };
  }
  let data: {
    success?: boolean;
    output?: string;
    message?: string;
    has_error?: boolean;
  };
  try {
    data = await resp.json();
  } catch {
    return { ok: false, output: "", message: `HTTP ${resp.status}` };
  }
  const output = data.output ?? "";
  if (!data.success) {
    return { ok: false, output, message: data.message || `HTTP ${resp.status}` };
  }
  if (data.has_error) {
    const line = output
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /ERROR/.test(l));
    return { ok: false, output, message: line || "The modem answered ERROR" };
  }
  return { ok: true, output };
}

/** Lines of an AT answer without the echo, blank lines and the final OK. */
export function answerLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "OK" && !/^AT[+^$#]?/i.test(line));
}
