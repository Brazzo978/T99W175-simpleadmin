// =============================================================================
// SMS in text mode — list parsing, body decoding, UCS-2 encoding
// =============================================================================
// Ported from the classic SMS page, which was validated on the T99W175:
//   - the list comes from AT+CMGL="ALL" in text mode (+CMGF=1, +CSDH=0);
//   - bodies arrive raw (GSM 7-bit alphabet, control bytes escaped by the
//     CGI as \u00xx) or hex-encoded (UCS-2, sometimes UTF-8);
//   - sending goes through cgi-bin/send_sms with UCS-2 hex number and text,
//     70 characters per part.
// =============================================================================

import type { SmsMessage } from "@/types/sms";

/** Prepares text mode and lists every message of the current storage. */
export const SMS_LIST_COMMAND =
  'AT+CSMS=1;+CSDH=0;+CNMI=2,1,0,0,0;+CMGF=1;+CSCA?;+CSMP=17,167,0,8;+CMGL="ALL"';

/** UCS-2 characters per SMS part. */
export const SMS_PART_LENGTH = 70;

export interface SmsStorageInfo {
  memory: "ME" | "SM";
  used: number;
  total: number;
}

export function parseCpms(output: string): SmsStorageInfo | null {
  const match = output.match(/\+CPMS:\s*"([A-Z]{2})",(\d+),(\d+)/);
  if (!match) return null;
  return {
    memory: match[1] === "SM" ? "SM" : "ME",
    used: Number.parseInt(match[2], 10),
    total: Number.parseInt(match[3], 10),
  };
}

function hexBytes(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => Number.parseInt(b, 16)));
}

function scoreText(text: string): number {
  if (!text) return 0;
  let score = 0;
  for (const char of text) {
    if (char === "�") score -= 5;
    else if (/\p{L}|\p{N}|\p{P}|\p{Zs}/u.test(char)) score += 1;
    else if (/\p{C}/u.test(char)) score -= 2;
  }
  return score / text.length;
}

/** UTF-16BE text has a zero high byte for every ASCII character. */
function zeroEvenRatio(bytes: Uint8Array): number {
  const pairs = Math.floor(bytes.length / 2);
  if (pairs === 0) return 0;
  let zeros = 0;
  for (let i = 0; i < pairs; i++) if (bytes[i * 2] === 0) zeros++;
  return zeros / pairs;
}

/** Hex payload decoded as UCS-2 or UTF-8, whichever reads better. */
export function decodeHexText(hex: string): string {
  const bytes = hexBytes(hex);
  const utf16 = new TextDecoder("utf-16be").decode(bytes);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const s16 = scoreText(utf16);
  const s8 = scoreText(utf8);
  if (zeroEvenRatio(bytes) > 0.3) return s16 >= s8 - 0.1 ? utf16 : utf8;
  return s8 >= s16 ? utf8 : utf16;
}

/** The body as hex when it is mostly hex digits, else null. */
function hexPayload(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "");
  if (!compact) return null;
  let hex = compact.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length < 2 || hex.length / compact.length < 0.7) return null;
  if (hex.length % 2) hex = hex.slice(0, -1);
  return hex;
}

/**
 * GSM 03.38 letters that arrive as control characters (0x04 is "è",
 * 0x7F is "à"), and the 0x1B escape into the extension table.
 */
export function decodeGsm7(text: string): string {
  const basic = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ";
  const extension: Record<string, string> = {
    "\n": "\f", "\u0014": "^", "(": "{", ")": "}", "/": "\\",
    "<": "[", "=": "~", ">": "]", "@": "|", e: "€",
  };
  return text
    .replace(/\u001b([\s\S])/g, (_, next: string) => extension[next] ?? next)
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001a\u001c-\u001f]/g, (c) => basic[c.charCodeAt(0)])
    .replace(/\u007f/g, "à");
}

/**
 * Alphanumeric senders ("Very Mobile") can arrive as their character codes
 * in decimal, run together: "86101114121...". A phone number has at most 15
 * digits, so a longer all-digit sender that decodes to printable text is one.
 */
function decodeDecimalSender(sender: string): string | null {
  if (!/^\d{16,}$/.test(sender)) return null;
  let out = "";
  for (let i = 0; i < sender.length; ) {
    // Printable ASCII is 32-126: three digits when it starts with 1.
    const width = sender[i] === "1" ? 3 : 2;
    const code = Number(sender.substr(i, width));
    if (!(code >= 32 && code <= 126)) return null;
    out += String.fromCharCode(code);
    i += width;
  }
  return /[A-Za-z]/.test(out) ? out.trim() : null;
}

/** "YY/MM/DD,HH:MM:SS+TZ" → the "MM/DD/YY HH:MM:SS" the inbox expects. */
function inboxTimestamp(modem: string): string {
  const m = modem.match(/^(\d{2})\/(\d{2})\/(\d{2}),(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]} ${m[4]}` : modem;
}

export function parseSmsList(output: string, storage: "ME" | "SM"): SmsMessage[] {
  const header = /^\s*\+CMGL:\s*(\d+),"[^"]*","([^"]*)"[^"]*,"([^"]*)"/gm;
  const messages: SmsMessage[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(output)) !== null) {
    const index = Number.parseInt(match[1], 10);
    const senderRaw = match[2];
    // A UCS-2 sender is hex, starting with "+" (002B) or a digit (003x).
    const sender =
      senderRaw.length > 11 && (senderRaw.startsWith("002B") || senderRaw.startsWith("003"))
        ? decodeHexText(senderRaw)
        : decodeDecimalSender(senderRaw) ?? senderRaw;
    const start = header.lastIndex;
    const ends = [output.indexOf("+CMGL:", start), output.indexOf("+CSCA:", start)]
      .filter((i) => i !== -1);
    const end = ends.length ? Math.min(...ends) : output.length;
    const raw = output
      .substring(start, end)
      .replace(/\n?OK\s*$/, "")
      .trim();
    const hex = hexPayload(raw);
    messages.push({
      indexes: [index],
      sender,
      content: decodeGsm7(hex ? decodeHexText(hex) : raw),
      timestamp: inboxTimestamp(match[3]),
      storage,
    });
  }
  return messages;
}

export function encodeUcs2(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return out;
}

/** Spaces removed, leading "+" written as "00". */
export function normalizeNumber(number: string): string {
  const compact = number.replace(/\s+/g, "");
  return compact.startsWith("+") ? `00${compact.slice(1)}` : compact;
}

export function splitParts(text: string, length = SMS_PART_LENGTH): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += length) parts.push(text.substring(i, i + length));
  return parts;
}
