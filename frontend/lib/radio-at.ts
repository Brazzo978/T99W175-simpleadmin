// =============================================================================
// Foxconn T99W175 radio AT commands — parsers and command builders
// =============================================================================
// Answer formats as the T99W175 prints them:
//   AT^BAND_PREF_EXT?   " LTE,Enable Bands :1,3,7,20,"  " LTE,Disable Bands:"
//                       (also WCDMA, NR5G_NSA, NR5G_SA)
//   AT^SLMODE?          "^SLMODE:1,7"   second value: bit mask 1=3G 2=4G 4=5G,
//                       0 = automatic
//   AT^NR5G_MODE?       "^NR5G_MODE:1"  0 auto, 1 NSA, 2 SA
//   AT^SWITCH_SLOT?     "SIM2 ENABLE"   (set with AT^SWITCH_SLOT=0|1)
//   AT+CGDCONT?         '+CGDCONT: 1,"IPV4V6","internet.wind",...'
//   AT^LTE_LOCK?        "^LTE_LOCK:Have not set cell lock before" or the
//                       locked pairs, "(pci,earfcn)" or a flat list
//   AT^NR5G_LOCK?       same, with "(band,scs,arfcn,pci)"
// =============================================================================

import type { BandCategory } from "@/types/band-locking";

export interface BandPrefs {
  /** Bands the modem supports, per category (enabled + disabled) */
  supported: Record<BandCategory, number[]>;
  /** Bands currently enabled, per category */
  enabled: Record<BandCategory, number[]>;
}

const BAND_PREF_RAT: Record<string, BandCategory> = {
  LTE: "lte",
  NR5G_NSA: "nsa_nr5g",
  NR5G_SA: "sa_nr5g",
};

/** AT^BAND_PREF_EXT prefix for each category. */
export const BAND_PREF_PREFIX: Record<BandCategory, string> = {
  lte: "LTE",
  nsa_nr5g: "NR5G_NSA",
  sa_nr5g: "NR5G_SA",
};

const sortedUnique = (values: number[]) =>
  [...new Set(values)].sort((a, b) => a - b);

export function parseBandPref(output: string): BandPrefs {
  const empty = (): Record<BandCategory, number[]> => ({
    lte: [],
    nsa_nr5g: [],
    sa_nr5g: [],
  });
  const supported = empty();
  const enabled = empty();
  const re = /(LTE|NR5G_NSA|NR5G_SA),\s*(Enable|Disable) Bands\s*:(.*)/g;
  for (const match of output.matchAll(re)) {
    const category = BAND_PREF_RAT[match[1]];
    const bands = match[3]
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n));
    supported[category].push(...bands);
    if (match[2] === "Enable") enabled[category].push(...bands);
  }
  (Object.keys(supported) as BandCategory[]).forEach((c) => {
    supported[c] = sortedUnique(supported[c]);
    enabled[c] = sortedUnique(enabled[c]);
  });
  return { supported, enabled };
}

/** Enable exactly `bands` for one category. */
export function bandLockCommand(category: BandCategory, bands: number[]): string {
  return `AT^BAND_PREF_EXT=${BAND_PREF_PREFIX[category]},2,${bands.join(":")}`;
}

/** Restores the factory band preferences (every category). */
export const BAND_RESET_COMMAND = "AT^BAND_PREF_EXT";

// --- Network mode ------------------------------------------------------------

export const NETWORK_MODE_BITS = { threeG: 1, fourG: 2, fiveG: 4 } as const;

export function parseSlmode(output: string): number | null {
  const match = output.match(/\^SLMODE:\s*\d+\s*,\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function describeNetworkMode(value: number | null): string {
  if (value === null) return "Unknown";
  if (value === 0) return "Automatic";
  const parts = [
    value & 1 ? "3G" : "",
    value & 2 ? "4G" : "",
    value & 4 ? "5G" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "Unknown";
}

export type Nr5gMode = 0 | 1 | 2;
export const NR5G_MODE_LABELS: Record<Nr5gMode, string> = {
  0: "Automatic",
  1: "NSA only",
  2: "SA only",
};

export function parseNr5gMode(output: string): Nr5gMode | null {
  const match = output.match(/\^NR5G_MODE:\s*(\d+)/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value === 0 || value === 1 || value === 2 ? value : null;
}

// --- SIM slot ----------------------------------------------------------------

/** Active slot as the modem names it: 1 = SIM 1, 2 = SIM 2 / eSIM. */
export function parseSimSlot(output: string): 1 | 2 | null {
  const match = output.match(/SIM(\d)\s+ENABLE/i);
  if (!match) return null;
  return match[1] === "1" ? 1 : match[1] === "2" ? 2 : null;
}

/** AT^SWITCH_SLOT takes 0 for SIM 1 and 1 for SIM 2. */
export function simSlotCommand(slot: 1 | 2): string {
  return `AT^SWITCH_SLOT=${slot - 1}`;
}

// --- APN ---------------------------------------------------------------------

export interface PdpContext {
  cid: number;
  type: string;
  apn: string;
}

export function parsePdpContexts(output: string): PdpContext[] {
  const contexts: PdpContext[] = [];
  for (const match of output.matchAll(/\+CGDCONT:\s*(\d+),"([^"]*)","([^"]*)"/gi)) {
    contexts.push({
      cid: Number.parseInt(match[1], 10),
      type: match[2],
      apn: match[3],
    });
  }
  return contexts.sort((a, b) => a.cid - b.cid);
}

/** APN names the modem accepts (letters, digits, dot, dash, underscore). */
export function isValidApn(apn: string): boolean {
  return /^[a-zA-Z0-9._-]{1,63}$/.test(apn);
}

export const PDP_TYPES = ["IP", "IPV6", "IPV4V6"] as const;
export type PdpType = (typeof PDP_TYPES)[number];

// --- Cell lock ---------------------------------------------------------------

export interface LteLock {
  pci: number;
  earfcn: number;
}

export interface NrLock {
  band: number;
  scs: number;
  arfcn: number;
  pci: number;
}

/** SCS index used by AT^NR5G_LOCK. */
export const SCS_LABELS: Record<number, string> = {
  0: "15 kHz",
  1: "30 kHz",
  2: "60 kHz",
  3: "120 kHz",
  4: "240 kHz",
};

function lockPayload(output: string, tag: string): string {
  const line = output
    .split(/\r?\n/)
    .find((l) => l.toUpperCase().includes(`${tag}:`));
  if (!line) return "";
  const payload = line.slice(line.indexOf(":") + 1).trim();
  return /have not set cell lock before/i.test(payload) ? "" : payload;
}

function numbersOf(payload: string): number[] {
  return payload
    .split(/[,()\s]+/)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isInteger(v));
}

export function parseLteLocks(output: string): LteLock[] {
  const numbers = numbersOf(lockPayload(output, "^LTE_LOCK"));
  const locks: LteLock[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    locks.push({ pci: numbers[i], earfcn: numbers[i + 1] });
  }
  return locks;
}

export function parseNrLocks(output: string): NrLock[] {
  const numbers = numbersOf(lockPayload(output, "^NR5G_LOCK"));
  const locks: NrLock[] = [];
  for (let i = 0; i + 3 < numbers.length; i += 4) {
    locks.push({
      band: numbers[i],
      scs: numbers[i + 1],
      arfcn: numbers[i + 2],
      pci: numbers[i + 3],
    });
  }
  return locks;
}

/** Up to ten LTE cells; the modem only camps on these. */
export function lteLockCommand(cells: LteLock[]): string {
  return `AT^LTE_LOCK=${cells.map((c) => `${c.pci},${c.earfcn}`).join(",")}`;
}

export function nrLockCommand(lock: NrLock): string {
  return `AT^NR5G_LOCK=${lock.band},${lock.scs},${lock.arfcn},${lock.pci}`;
}

export const LTE_UNLOCK_COMMAND = "AT^LTE_LOCK";
export const NR_UNLOCK_COMMAND = "AT^NR5G_LOCK";
