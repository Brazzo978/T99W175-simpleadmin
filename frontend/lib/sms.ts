// =============================================================================
// SMS in text mode — list parsing, body decoding, UCS-2 encoding
// =============================================================================
// As the T99W175 answers AT+CMGL="ALL" in text mode with +CSDH=1:
//   +CMGL: 4,"REC READ","8610111412132...",,"26/02/07,10:29:33+04",208,123
//   <body>
// The last two header fields say how to read the rest:
//   - <tooa> 208 (0xD0) is an alphanumeric sender, which this firmware
//     prints as the decimal codes of its characters ("Very Mobile");
//   - <length> counts characters for a 7-bit body, sent as text in the GSM
//     alphabet (control bytes escaped by the CGI as \u00xx), and octets for
//     an 8-bit or UCS-2 body, sent as hex: a body of exactly 2 x <length>
//     hex digits is hex, anything else is text.
// Sending goes through cgi-bin/send_sms with UCS-2 hex number and text,
// 70 UTF-16 units per part.
// =============================================================================

import type { SmsMessage } from "@/types/sms";

/** Prepares text mode and lists every message of the current storage. */
export const SMS_LIST_COMMAND =
  'AT+CSMS=1;+CSDH=1;+CNMI=2,1,0,0,0;+CMGF=1;+CSCA?;+CSMP=17,167,0,8;+CMGL="ALL"';

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

/** Type of address of an alphanumeric sender ("Very Mobile"). */
const TOA_ALPHANUMERIC = 0xd0;

/** The decimal character codes this firmware prints for such a sender. */
function decodeDecimalSender(sender: string): string {
  let out = "";
  for (let i = 0; i < sender.length; ) {
    // Printable ASCII is 32-126: three digits when it starts with 1.
    const width = sender[i] === "1" ? 3 : 2;
    const code = Number(sender.substr(i, width));
    if (!(code >= 32 && code <= 126)) return sender;
    out += String.fromCharCode(code);
    i += width;
  }
  return out.trim() || sender;
}

/** "YY/MM/DD,HH:MM:SS+TZ" → the "MM/DD/YY HH:MM:SS" the inbox expects. */
function inboxTimestamp(modem: string): string {
  const m = modem.match(/^(\d{2})\/(\d{2})\/(\d{2}),(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]} ${m[4]}` : modem;
}

export function parseSmsList(output: string, storage: "ME" | "SM"): SmsMessage[] {
  const header =
    /^\s*\+CMGL:\s*(\d+),"[^"]*","([^"]*)",(?:"[^"]*")?,"([^"]*)",(\d+),(\d+)[ \t]*$/gm;
  const messages: SmsMessage[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(output)) !== null) {
    const index = Number.parseInt(match[1], 10);
    const senderRaw = match[2];
    const toa = Number.parseInt(match[4], 10);
    const length = Number.parseInt(match[5], 10);
    // A UCS-2 sender is hex, starting with "+" (002B) or a digit (003x).
    const sender =
      toa === TOA_ALPHANUMERIC && /^\d+$/.test(senderRaw)
        ? decodeDecimalSender(senderRaw)
        : senderRaw.length > 11 && (senderRaw.startsWith("002B") || senderRaw.startsWith("003"))
          ? decodeHexText(senderRaw)
          : senderRaw;
    // The body runs from the end of the header line to the next entry.
    const start = output.indexOf("\n", header.lastIndex) + 1;
    const ends = [output.indexOf("+CMGL:", start), output.indexOf("+CSCA:", start)]
      .filter((i) => i !== -1);
    const end = ends.length ? Math.min(...ends) : output.length;
    const raw = output
      .substring(start, end)
      .replace(/\s*OK\s*$/, "")
      .replace(/^\r?\n|\r?\n$/g, "");
    const compact = raw.replace(/\s+/g, "");
    const isHex = length > 0 && compact.length === length * 2 && /^[0-9A-Fa-f]+$/.test(compact);
    messages.push({
      indexes: [index],
      sender,
      // Only protocol line endings are stripped: the text itself is kept as sent.
      content: isHex ? decodeHexText(compact) : decodeGsm7(raw),
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

/**
 * Parts of at most `length` UTF-16 units. A character outside the BMP (an
 * emoji) takes two units and never straddles two parts.
 */
export function splitParts(text: string, length = SMS_PART_LENGTH): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of text) {
    if (current.length + char.length > length) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}
